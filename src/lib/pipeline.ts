// The Doorstep pipeline: ingest (LIVE / REPLAY / SCENARIO) → snapshot → Bedrock description →
// rules → alerts. `tick()` is idempotent and safe to call often; the poller and API routes call it.

import fs from "node:fs";
import path from "node:path";
import { describeSnapshot } from "./bedrock";
import { bedrockStatus, recordBedrockFailure, recordBedrockSuccess } from "./bedrock/health";
import { DATA_DIR, getSetting, setSetting } from "./db";
import { getCarePlan, getDataMode, getRingToken, markRingTokenExpired } from "./config";
import { evaluateRules, type RuleEvent } from "./rules/engine";
import { RingApiError, RingClient, RingTokenExpiredError } from "./ring/client";
import {
  advanceClock,
  loadScenario,
  materialize,
  scenarioImagePath,
  scenarioEndMs,
  scenarioStartMs,
  scenarioVisitors,
  type ScenarioState,
} from "./data/scenarios";
import { loadReplay, readManifest, type ReplayMeta } from "./data/replay";
import { tokenIssuedAtMs } from "./ring/token";
import { processAlertTimers } from "./alerts";
import { generateDigest, getDigest } from "./digest";
import * as store from "./store";
import { clockLabel, localDateKey, startOfLocalDay } from "./time";
import type { CarePlan, DataMode, DescriptionTags, EventOrigin } from "./types";

export const ORIGIN_FOR_MODE: Record<DataMode, EventOrigin> = {
  LIVE: "live",
  REPLAY: "replay",
  SCENARIO: "simulated",
};

const LIVE_POLL_MS = Number(process.env.LIVE_POLL_SECONDS ?? 30) * 1000;
const DAY = 24 * 60 * 60 * 1000;

export interface TickResult {
  mode: DataMode;
  now: number;
  newEvents: number;
  described: number;
  newAlerts: string[];
  error: string | null;
}

declare global {
  // eslint-disable-next-line no-var
  var __doorstepTick: Promise<TickResult> | undefined;
}

/** Single-flight: concurrent callers share the in-progress tick. */
export function tick(): Promise<TickResult> {
  if (!globalThis.__doorstepTick) {
    globalThis.__doorstepTick = runTick().finally(() => {
      globalThis.__doorstepTick = undefined;
    });
  }
  return globalThis.__doorstepTick;
}

export function getScenarioState(): ScenarioState | null {
  return getSetting<ScenarioState | null>("scenario_state", null);
}

/** "Now" as the app sees it: the simulated clock in SCENARIO mode, wall time otherwise. */
export function currentNow(mode: DataMode = getDataMode()): number {
  if (mode === "SCENARIO") {
    const s = getScenarioState();
    if (s) return s.simMs;
  }
  return Date.now();
}

/** Care plan as the rules see it (a scenario may pin the visitor schedule for reproducibility). */
export function effectivePlan(mode: DataMode = getDataMode()): CarePlan {
  const plan = getCarePlan();
  if (mode === "SCENARIO") {
    const s = getScenarioState();
    if (s) {
      const pinned = scenarioVisitors(loadScenario(s.scenarioId));
      if (pinned) return { ...plan, visitors: pinned };
    }
  }
  return plan;
}

async function runTick(): Promise<TickResult> {
  const mode = getDataMode();
  const origin = ORIGIN_FOR_MODE[mode];
  const plan = getCarePlan();
  let newEvents = 0;
  let error: string | null = null;

  try {
    if (mode === "SCENARIO") newEvents = ingestScenario(plan);
    else if (mode === "REPLAY") newEvents = ingestReplay(plan);
    else newEvents = await ingestLive(plan);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
    if (e instanceof RingTokenExpiredError) markRingTokenExpired(true);
    console.warn(`[pipeline] ingest (${mode}) failed: ${error}`);
  }

  const now = currentNow(mode);
  if (mode === "LIVE") await fetchLiveSnapshots();
  const described = await describePending(origin, now, plan);
  const newAlerts = runRules(origin, now, effectivePlan(mode));
  processAlertTimers(origin, now);
  if (mode === "SCENARIO") await autoDigest(plan);
  return { mode, now, newEvents, described, newAlerts, error };
}

// --- SCENARIO -----------------------------------------------------------------

function ingestScenario(plan: CarePlan): number {
  const state = getScenarioState();
  if (!state) return 0;
  const scenario = loadScenario(state.scenarioId);
  const next = advanceClock(state, scenario, plan.timeZone, Date.now());
  setSetting("scenario_state", next);
  const deviceId = plan.deviceId ?? store.listDevices("replay")[0]?.id ?? "doorstep-sim-device";
  const due = materialize(scenario, next.dateKey, plan.timeZone, deviceId).filter((m) => m.event.startMs <= next.simMs);
  return store.insertEvents(
    due.map((m) => ({ ...m.event, snapshotPath: scenarioImagePath(m.image), snapshotStatus: "ok" as const })),
  );
}

/** Start (or restart) a scenario on today's date in the parent's time zone. */
export function startScenario(scenarioId: string, speed: number): ScenarioState {
  const plan = getCarePlan();
  const scenario = loadScenario(scenarioId);
  store.clearOrigin("simulated");
  const dateKey = localDateKey(Date.now(), plan.timeZone);
  const state: ScenarioState = {
    scenarioId,
    dateKey,
    simMs: scenarioStartMs(scenario, dateKey, plan.timeZone),
    speed,
    playing: true,
    lastRealMs: Date.now(),
  };
  setSetting("scenario_state", state);
  return state;
}

export function updateScenario(patch: Partial<Pick<ScenarioState, "speed" | "playing" | "simMs">>): ScenarioState | null {
  const s = getScenarioState();
  if (!s) return null;
  // Bank elapsed time at the old speed before changing anything.
  const plan = getCarePlan();
  const advanced = advanceClock(s, loadScenario(s.scenarioId), plan.timeZone, Date.now());
  const next = { ...advanced, ...patch, lastRealMs: Date.now() };
  setSetting("scenario_state", next);
  return next;
}

export function stopScenario(): void {
  setSetting("scenario_state", null);
  store.clearOrigin("simulated");
}

/** When a scenario day finishes, write its digest once (the end-of-day moment in the demo). */
async function autoDigest(plan: CarePlan): Promise<void> {
  const s = getScenarioState();
  if (!s || s.playing) return;
  const end = scenarioEndMs(loadScenario(s.scenarioId), s.dateKey, plan.timeZone);
  const existing = getDigest("simulated", s.dateKey);
  if (s.simMs < end) return;
  // Write once; rewrite a sample digest once real Bedrock is back.
  if (existing && !(existing.model === "sample" && bedrockStatus() === "ok")) return;
  if (store.eventsNeedingDescription("simulated", s.simMs, 1).length) return; // wait for captions
  await generateDigest("simulated", effectivePlan("SCENARIO"), s.simMs);
}

/** Lookup for mock descriptions: scenario files ship a canned caption per event. */
function scenarioHint(eventId: string) {
  const m = /^sim:([a-z0-9_]+):(\d+)$/.exec(eventId);
  if (!m) return null;
  const ev = loadScenario(m[1]!).events[Number(m[2])];
  return ev ? { sentence: ev.sentence, tags: ev.tags } : null;
}

// --- REPLAY -------------------------------------------------------------------

/** Sample caption for a recorded event (manifest.sampleCaptions), keyed by the original Ring id. */
function replayHint(eventId: string) {
  try {
    const c = readManifest().sampleCaptions?.[eventId.replace(/^rp:/, "")];
    return c ? { sentence: c.sentence, tags: c.tags as Partial<DescriptionTags> } : null;
  } catch {
    return null;
  }
}

function ingestReplay(plan: CarePlan): number {
  const loadedFor = getSetting<string | null>("replay_loaded_for", null);
  const today = localDateKey(Date.now(), plan.timeZone);
  if (loadedFor === today) return 0;
  const replay = loadReplay(Date.now(), undefined, startOfLocalDay(Date.now(), plan.timeZone));
  store.clearOrigin("replay");
  store.upsertDevices(replay.devices, "replay");
  const n = store.insertEvents(replay.events);
  setSetting("replay_loaded_for", today);
  setSetting("replay_meta", replay.meta);
  return n;
}

export function reloadReplay(): void {
  setSetting("replay_loaded_for", null);
}

// --- LIVE ---------------------------------------------------------------------

function liveClient(): RingClient {
  const { token } = getRingToken();
  if (!token) throw new RingTokenExpiredError("(no token)");
  return new RingClient({
    token,
    onRequest: ({ method, path: p, status, ms }) => store.logApi(method, p, status, ms),
  });
}

async function ingestLive(plan: CarePlan): Promise<number> {
  const last = getSetting<number>("live_last_poll", 0);
  if (Date.now() - last < LIVE_POLL_MS) return 0;
  setSetting("live_last_poll", Date.now());
  if (!getSetting<number | null>("live_first_poll", null)) setSetting("live_first_poll", Date.now());
  const client = liveClient();
  const devices = await client.listDevices();
  store.upsertDevices(devices, "live");
  markRingTokenExpired(false);
  const target = devices.filter((d) => !plan.deviceId || d.id === plan.deviceId);
  let n = 0;
  for (const d of target) {
    const events = await client.listEventsSince(d.id, Date.now() - DAY);
    n += store.insertEvents(events);
  }
  return n;
}

export function forceLivePoll(): void {
  setSetting("live_last_poll", 0);
}

async function fetchLiveSnapshots(): Promise<void> {
  const pending = store.eventsNeedingSnapshot("live", 3);
  if (!pending.length) return;
  let client: RingClient;
  try {
    client = liveClient();
  } catch {
    return;
  }
  const dir = path.join(DATA_DIR, "snapshots");
  fs.mkdirSync(dir, { recursive: true });
  for (const e of pending) {
    try {
      const snap = await client.getSnapshot(e.deviceId, e.startMs + 1000);
      const file = path.join(dir, `${safeName(e.id)}.jpg`);
      fs.writeFileSync(file, snap.bytes);
      store.setSnapshot(e.id, "ok", path.relative(process.cwd(), file), snap.mediaOrigin);
    } catch (err) {
      if (err instanceof RingTokenExpiredError) {
        markRingTokenExpired(true);
        return;
      }
      // 403 / 416 / 425 etc: keep going without an image (logged for the friction log).
      const status = err instanceof RingApiError ? err.status : 0;
      const note = err instanceof Error ? err.message : String(err);
      store.setSnapshot(e.id, status === 425 ? "pending" : "missing", null, note);
      store.logApi("POST", `snapshot ${e.id}`, status, 0, note);
    }
  }
}

export function safeName(id: string): string {
  return id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 120);
}

// --- Bedrock descriptions ------------------------------------------------------
// Real Bedrock is the default. While it's unavailable (see bedrock/health.ts) events get a
// clearly labelled sample caption (model "sample"); once a call succeeds, sample captions are
// re-described with Nova Lite in the background.

export const SAMPLE_MODEL = "sample";

async function describePending(origin: EventOrigin, now: number, plan: CarePlan): Promise<number> {
  const status = bedrockStatus();
  const fresh = store.eventsNeedingDescription(origin, now, status === "mock" || status === "unavailable" ? 50 : status === "unknown" ? 1 : 4);
  // When Bedrock is healthy and there's nothing new, upgrade sample captions to real ones.
  const upgrades = status === "ok" && fresh.length === 0 ? store.eventsWithModel(origin, SAMPLE_MODEL, 3) : [];
  let n = 0;
  for (const chunk of [fresh, upgrades]) {
    await Promise.all(chunk.map(async (e) => (await describeOne(e, plan)) && n++));
  }
  return n;
}

async function describeOne(e: store.StoredEvent, plan: CarePlan): Promise<boolean> {
  const input = {
    eventId: e.id,
    kind: e.kind,
    timeLabel: clockLabel(e.startMs, plan.timeZone),
    image: readSnapshot(e),
    mockHint: e.origin === "simulated" ? scenarioHint(e.id) : e.origin === "replay" ? replayHint(e.id) : null,
  };
  const status = bedrockStatus();
  if (status === "mock" || status === "unavailable") {
    if (status === "unavailable" && store.descriptionsFor([e.id]).has(e.id)) return false; // keep existing sample
    return saveSample(e.id, input, status === "mock" ? "mock" : SAMPLE_MODEL);
  }
  try {
    const res = await describeSnapshot(input, false);
    recordBedrockSuccess();
    store.saveDescription({
      eventId: e.id,
      sentence: res.sentence,
      tags: res.tags,
      model: res.usage.model,
      mock: res.usage.mock,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
      createdAt: Date.now(),
    });
    store.logBedrockUsage({ purpose: "describe", ref: e.id, ...res.usage });
    return true;
  } catch (err) {
    const h = recordBedrockFailure(err);
    console.warn(`[bedrock] describe ${e.id} failed (${h.lastErrorName}); sample captions until ${new Date(h.nextRetryAt).toLocaleTimeString()}: ${h.lastError}`);
    if (store.descriptionsFor([e.id]).has(e.id)) return false;
    return saveSample(e.id, input, SAMPLE_MODEL);
  }
}

async function saveSample(eventId: string, input: Parameters<typeof describeSnapshot>[0], model: string): Promise<boolean> {
  const res = await describeSnapshot(input, true);
  store.saveDescription({
    eventId,
    sentence: res.sentence,
    tags: res.tags,
    model: input.image ? model : "metadata-only",
    mock: true,
    inputTokens: 0,
    outputTokens: 0,
    createdAt: Date.now(),
  });
  return true;
}

function readSnapshot(e: store.StoredEvent): { bytes: Uint8Array; format: "jpeg" | "png" } | null {
  if (!e.snapshotPath || e.snapshotStatus !== "ok") return null;
  const abs = path.resolve(process.cwd(), e.snapshotPath);
  if (!fs.existsSync(abs)) return null;
  return { bytes: fs.readFileSync(abs), format: abs.endsWith(".png") ? "png" : "jpeg" };
}


// --- Rules --------------------------------------------------------------------

/** When Doorstep's view of the door begins, per mode (undefined = full coverage). */
export function coverageStart(mode: DataMode = getDataMode()): number | undefined {
  if (mode === "REPLAY") return getSetting<ReplayMeta | null>("replay_meta", null)?.coverageStartMs ?? undefined;
  if (mode === "LIVE") {
    const { token, pastedAt } = getRingToken();
    if (!token) return undefined;
    return tokenIssuedAtMs(token) ?? pastedAt ?? getSetting<number | null>("live_first_poll", null) ?? undefined;
  }
  return undefined;
}

function runRules(origin: EventOrigin, now: number, plan: CarePlan): string[] {
  const events = store.timeline(origin, now - 2 * DAY, now);
  // Don't judge the day past an event whose description is still on its way (its tags decide
  // e.g. whether a package was taken in or a doorbell answered). Give up waiting after 5 minutes.
  const waiting = events.find(
    (e) => !e.description && e.snapshotStatus !== "missing" && Date.now() - e.createdAt < 5 * 60_000,
  );
  if (waiting) now = waiting.startMs - 1;
  const ruleEvents: RuleEvent[] = events.map((e) => ({ ...e, tags: e.description?.tags ?? null }));
  const mode = (Object.keys(ORIGIN_FOR_MODE) as DataMode[]).find((m) => ORIGIN_FOR_MODE[m] === origin)!;
  const candidates = evaluateRules({ now, plan, events: ruleEvents, coverageStartMs: coverageStart(mode) });
  store.pruneAlerts(origin, candidates.map((c) => c.id), now - DAY, now);
  return store.upsertAlerts(candidates, origin);
}
