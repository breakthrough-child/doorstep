// Builds the JSON the UI renders. One place decides what "today" means in each data mode.
import { BEDROCK_MODEL_ID, BEDROCK_REGION } from "./bedrock";
import { bedrockStatus, getBedrockHealth, type BedrockStatus } from "./bedrock/health";
import { getCarePlan, getDataMode, getRingToken, isOnboarded, isRingTokenExpired } from "./config";
import { getSetting } from "./db";
import { listScenarios, loadScenario, scenarioEndMs, scenarioStartMs } from "./data/scenarios";
import type { ReplayMeta } from "./data/replay";
import { getDigest } from "./digest";
import { coverageStart, currentNow, effectivePlan, getScenarioState, ORIGIN_FOR_MODE } from "./pipeline";
import * as store from "./store";
import { clockLabel, localDateKey, parseHHMM, weekdayOf, zonedTimeToUtc } from "./time";
import type { Alert, Contact, DataMode, DescriptionTags, EventOrigin } from "./types";

export interface VisitStatus {
  id: string;
  name: string;
  window: string;
  state: "upcoming" | "in_window" | "seen" | "missed" | "not_watched";
  seenAt: string | null;
}

export interface TimelineView {
  id: string;
  kind: string;
  time: string;
  startMs: number;
  /** Real wall time the event reached Doorstep (differs from startMs in scenario/replay). */
  receivedAt: number;
  origin: EventOrigin;
  sentence: string | null;
  captionSource: string | null;
  /** True when the caption isn't from Bedrock (sample, or event-type only). */
  captionIsSample: boolean;
  hasSnapshot: boolean;
  /** The image is genuine Ring media (live, recorded, or a recorded frame reused by a scenario). */
  realRingFrame: boolean;
  snapshotNote: string | null;
  tags: DescriptionTags | null;
}

export interface AppState {
  mode: DataMode;
  origin: EventOrigin;
  now: number;
  nowLabel: string;
  dateLabel: string;
  parentName: string;
  familyName: string;
  timeZone: string;
  onboarded: boolean;
  status: { level: "calm" | "attention" | "urgent"; headline: string; sub: string };
  alerts: Alert[];
  activeAlertCount: number;
  timeline: TimelineView[];
  visits: VisitStatus[];
  ring: { hasToken: boolean; tokenSource: string | null; expired: boolean; pastedAt: number | null };
  replay: ReplayMeta | null;
  scenario: null | {
    id: string;
    title: string;
    summary: string;
    speed: number;
    playing: boolean;
    progress: number;
    startMs: number;
    startLabel: string;
    endLabel: string;
  };
  bedrock: {
    /** mock = forced by BEDROCK_MOCK; unavailable = real calls failing, sample captions shown. */
    status: BedrockStatus;
    mock: boolean;
    model: string;
    region: string;
    calls: number;
    inputTokens: number;
    outputTokens: number;
    lastError: string | null;
    lastErrorName: string | null;
    lastOkAt: number | null;
    nextRetryAt: number | null;
  };
  /** True when any caption on screen is a sample (not written by Bedrock). */
  sampleCaptions: boolean;
  digestReady: boolean;
  devices: Array<{ id: string; name: string; online: boolean | null }>;
  contacts: Contact[];
}

const ACTIVE = (a: Alert) => a.status !== "resolved" && a.clearedAt === null;
/** Needs attention right now: active and not snoozed (snoozedUntil is cleared when the reminder is due). */
export const NEEDS_ATTENTION = (a: Alert) => ACTIVE(a) && !a.snoozedUntil;

export function buildState(): AppState {
  const mode = getDataMode();
  const origin = ORIGIN_FOR_MODE[mode];
  const plan = effectivePlan(mode);
  const tz = plan.timeZone;
  const now = currentNow(mode);
  const dateKey = localDateKey(now, tz);
  const dayStart = zonedTimeToUtc(dateKey, 0, tz);

  const items = store.timeline(origin, dayStart, now);
  // Alerts relevant to today: triggered today, plus anything still active from the last 24h.
  const alerts = store
    .listAlerts(origin, now - 24 * 3600_000, now)
    .filter((a) => a.triggeredAt >= dayStart || ACTIVE(a));
  const active = alerts.filter(NEEDS_ATTENTION);
  const snoozed = alerts.filter((a) => ACTIVE(a) && !!a.snoozedUntil);
  const urgent = active.some((a) => a.severity === "urgent");

  const people = items.filter((e) => e.kind === "person" || e.kind === "ding");
  const coverage = coverageStart(mode);
  const weekday = weekdayOf(dateKey);
  const visits: VisitStatus[] = plan.visitors
    .filter((v) => v.days.includes(weekday))
    .map((v) => {
      const ws = zonedTimeToUtc(dateKey, parseHHMM(v.windowStart), tz);
      const we = zonedTimeToUtc(dateKey, parseHHMM(v.windowEnd), tz);
      const grace = plan.visitGraceMinutes * 60_000;
      const seen = people.find((e) => e.startMs >= ws - grace && e.startMs <= we + grace);
      const unwatched = coverage !== undefined && coverage > ws - grace;
      const state: VisitStatus["state"] = seen
        ? "seen"
        : unwatched
          ? "not_watched"
          : now < ws
            ? "upcoming"
            : now <= we + grace
              ? "in_window"
              : "missed";
      return { id: v.id, name: v.name, window: `${v.windowStart}–${v.windowEnd}`, state, seenAt: seen ? clockLabel(seen.startMs, tz) : null };
    });

  const last = items[items.length - 1];
  const watching = coverage !== undefined && coverage > dayStart ? ` · watching since ${clockLabel(coverage, tz)}` : "";
  const sub =
    (items.length
      ? `Last activity at ${clockLabel(last!.startMs, tz)} · ${items.length} door event${items.length === 1 ? "" : "s"} today`
      : "No door activity yet today") + watching;
  const reminders = snoozed.length
    ? ` · ${snoozed.length === 1 ? "1 reminder" : `${snoozed.length} reminders`} set for later`
    : "";
  const status: AppState["status"] = active.length
    ? {
        level: urgent ? "urgent" : "attention",
        headline: active.length === 1 ? "1 thing needs your attention" : `${active.length} things need your attention`,
        sub: sub + reminders,
      }
    : {
        level: "calm",
        headline: `All normal at ${plan.parentName}'s door today`,
        sub: snoozed.length ? sub + reminders : `${sub} · nothing needs you right now`,
      };

  const { token, source, pastedAt } = getRingToken();
  const scenarioState = mode === "SCENARIO" ? getScenarioState() : null;
  let scenario: AppState["scenario"] = null;
  if (scenarioState) {
    const s = loadScenario(scenarioState.scenarioId);
    const start = scenarioStartMs(s, scenarioState.dateKey, tz);
    const end = scenarioEndMs(s, scenarioState.dateKey, tz);
    scenario = {
      id: s.id,
      title: s.title,
      summary: s.summary,
      speed: scenarioState.speed,
      playing: scenarioState.playing,
      progress: end > start ? Math.min(1, (scenarioState.simMs - start) / (end - start)) : 1,
      startMs: start,
      startLabel: s.startTime,
      endLabel: s.endTime,
    };
  }

  const totals = store.bedrockTotals();
  const health = getBedrockHealth();
  const bStatus = bedrockStatus();

  return {
    mode,
    origin,
    now,
    nowLabel: clockLabel(now, tz),
    dateLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now),
    parentName: plan.parentName,
    familyName: plan.familyName,
    timeZone: tz,
    onboarded: isOnboarded(),
    status,
    alerts,
    activeAlertCount: active.length,
    timeline: items
      .slice()
      .reverse()
      .map((e) => toEventView(e, tz)),
    visits,
    ring: { hasToken: !!token, tokenSource: source, expired: isRingTokenExpired(), pastedAt },
    replay: mode === "REPLAY" ? getSetting<ReplayMeta | null>("replay_meta", null) : null,
    scenario,
    bedrock: {
      status: bStatus,
      mock: bStatus === "mock",
      model: BEDROCK_MODEL_ID,
      region: BEDROCK_REGION,
      calls: totals.calls,
      inputTokens: totals.inputTokens,
      outputTokens: totals.outputTokens,
      lastError: health.lastError,
      lastErrorName: health.lastErrorName,
      lastOkAt: health.lastOkAt,
      nextRetryAt: bStatus === "unavailable" ? health.nextRetryAt : null,
    },
    sampleCaptions: items.some((e) => e.description?.mock && e.description.model !== "metadata-only"),
    digestReady: !!getDigest(origin, dateKey),
    contacts: getCarePlan().contacts,
    devices: store.listDevices(origin === "simulated" ? "replay" : origin).map((d) => ({ id: d.id, name: d.name, online: d.online })),
  };
}

export function scenarioCatalog() {
  return listScenarios().map((s) => ({ id: s.id, title: s.title, summary: s.summary, startTime: s.startTime, endTime: s.endTime, events: s.events.length }));
}

export function toEventView(e: store.TimelineItem, tz: string): TimelineView {
  return {
    id: e.id,
    kind: e.kind,
    time: clockLabel(e.startMs, tz),
    startMs: e.startMs,
    receivedAt: e.createdAt,
    origin: e.origin,
    sentence: e.description?.sentence ?? null,
    captionSource: captionSource(e.description),
    captionIsSample: !!e.description && e.description.mock,
    hasSnapshot: e.snapshotStatus === "ok" && !!e.snapshotPath,
    realRingFrame: e.origin === "live" || (!!e.snapshotPath && e.snapshotPath.startsWith("fixtures")),
    snapshotNote: e.snapshotStatus === "missing" ? e.snapshotNote : null,
    tags: e.description?.tags ?? null,
  };
}

/** Honest data-source label shown on every event. */
export const ORIGIN_LABEL: Record<EventOrigin, string> = {
  live: "Live from Ring",
  replay: "Recorded from Ring Playground",
  simulated: "Simulated",
};

function captionSource(d: store.TimelineItem["description"]): string | null {
  if (!d) return null;
  if (!d.mock) return `Amazon Bedrock · ${d.model}`;
  if (d.model === "metadata-only") return "From the Ring event type (no image)";
  if (d.model === "sample") return "Sample caption — Amazon Bedrock not available yet";
  return "Sample caption — Bedrock not configured";
}
