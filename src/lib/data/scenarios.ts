// SCENARIO mode: the Ring Playground doesn't deliver webhooks, so to demonstrate a full day of
// caretaking alerts we inject timed synthetic events on a simulated clock. Every scenario event
// is stored with origin "simulated" and labelled as such in the UI.

import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { DescriptionTags, DoorEvent, Visitor } from "../types";
import { parseHHMM, zonedTimeToUtc } from "../time";

export const SCENARIO_DIR = path.resolve(process.cwd(), "scenarios");

const scenarioEventSchema = z.object({
  at: z.string(),
  kind: z.enum(["person", "ding", "package", "vehicle", "motion", "animal"]),
  image: z.string(),
  sentence: z.string(),
  tags: z
    .object({
      people: z.number().optional(),
      packageVisible: z.boolean().nullable().optional(),
      doorOpen: z.boolean().nullable().optional(),
      vehicle: z.boolean().optional(),
      roles: z.array(z.string()).optional(),
    })
    .default({}),
});

const scenarioSchema = z.object({
  id: z.string(),
  title: z.string(),
  summary: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  /** Optional pinned schedule so the scenario is reproducible regardless of the weekday. */
  visitors: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        days: z.array(z.number()),
        windowStart: z.string(),
        windowEnd: z.string(),
      }),
    )
    .optional(),
  events: z.array(scenarioEventSchema),
});

export type Scenario = z.infer<typeof scenarioSchema>;
export type ScenarioEvent = z.infer<typeof scenarioEventSchema>;

export const SCENARIO_IDS = [
  "grace_normal_day",
  "missed_aide_visit",
  "package_left_out",
  "quiet_morning",
  "late_night_ding",
] as const;

export function loadScenario(id: string): Scenario {
  if (!/^[a-z0-9_]+$/.test(id)) throw new Error("Bad scenario id");
  const raw = JSON.parse(fs.readFileSync(path.join(SCENARIO_DIR, `${id}.json`), "utf8"));
  return scenarioSchema.parse(raw);
}

export function listScenarios(): Scenario[] {
  return SCENARIO_IDS.map(loadScenario);
}

/**
 * Scenario frames are drawn illustrations (`porch_empty`) or, with a `ring:` prefix, a real frame
 * recorded from the Ring Developer Playground (`ring:<part of the recorded event id>`), which keeps
 * Ring's watermark. Real frames are labelled as such in the UI.
 */
export function scenarioImagePath(image: string): string {
  if (image.startsWith("ring:")) {
    const key = image.slice(5);
    if (!/^[A-Z0-9]{6,}$/.test(key)) throw new Error("Bad Ring frame key");
    const dir = path.join("fixtures", "playground", "snapshots");
    const file = fs.existsSync(dir) ? fs.readdirSync(dir).find((f) => f.includes(key)) : undefined;
    if (!file) throw new Error(`Recorded Ring frame ${key} not found`);
    return path.join(dir, file);
  }
  if (!/^[a-z0-9_]+$/.test(image)) throw new Error("Bad image name");
  // A processed free-licence stock photo (scripts/stockify.py) beats the illustration when present.
  const stock = path.join("scenarios", "images", "stock", `${image}.jpg`);
  if (fs.existsSync(stock)) return stock;
  return path.join("scenarios", "images", `${image}.jpg`);
}

export interface ScenarioState {
  scenarioId: string;
  dateKey: string;
  simMs: number;
  speed: number;
  playing: boolean;
  lastRealMs: number;
}

export const SPEEDS = [1, 10, 60, 300] as const;

/** Advance the simulated clock by elapsed real time × speed, stopping at the scenario end. Pure. */
export function advanceClock(state: ScenarioState, scenario: Scenario, tz: string, realNow: number): ScenarioState {
  const end = zonedTimeToUtc(state.dateKey, parseHHMM(scenario.endTime), tz);
  if (!state.playing) return { ...state, lastRealMs: realNow };
  const simMs = Math.min(end, state.simMs + Math.max(0, realNow - state.lastRealMs) * state.speed);
  return { ...state, simMs, lastRealMs: realNow, playing: simMs < end };
}

export function scenarioStartMs(scenario: Scenario, dateKey: string, tz: string): number {
  return zonedTimeToUtc(dateKey, parseHHMM(scenario.startTime), tz);
}

export function scenarioEndMs(scenario: Scenario, dateKey: string, tz: string): number {
  return zonedTimeToUtc(dateKey, parseHHMM(scenario.endTime), tz);
}

export interface MaterializedScenarioEvent {
  event: DoorEvent;
  image: string;
  hint: { sentence: string; tags: Partial<DescriptionTags> };
}

/** All scenario events with absolute times on the given local date. Pure. */
export function materialize(scenario: Scenario, dateKey: string, tz: string, deviceId: string): MaterializedScenarioEvent[] {
  return scenario.events.map((e, i) => {
    const startMs = zonedTimeToUtc(dateKey, parseHHMM(e.at), tz);
    return {
      event: {
        // Stable ids (no date) so cached Bedrock descriptions are reused when a scenario is replayed.
        id: `sim:${scenario.id}:${String(i).padStart(2, "0")}`,
        deviceId,
        kind: e.kind,
        startMs,
        endMs: startMs + 20_000,
        origin: "simulated",
        rawType: e.kind === "ding" ? "ding" : e.kind === "package" ? "motion" : "motion",
        rawSubType: e.kind === "person" ? "human" : e.kind === "package" ? "package_delivery" : e.kind === "ding" ? null : e.kind,
        scenarioId: scenario.id,
      },
      image: e.image,
      hint: { sentence: e.sentence, tags: e.tags },
    };
  });
}

export function scenarioVisitors(scenario: Scenario): Visitor[] | null {
  return scenario.visitors ?? null;
}
