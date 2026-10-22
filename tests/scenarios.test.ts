import { describe, expect, it } from "vitest";
import { advanceClock, listScenarios, materialize, scenarioImagePath, scenarioStartMs, type ScenarioState } from "@/lib/data/scenarios";
import { evaluateRules } from "@/lib/rules/engine";
import { scenarioEndMs } from "@/lib/data/scenarios";
import type { CarePlan } from "@/lib/types";
import fs from "node:fs";
import path from "node:path";

const TZ = "Africa/Lagos";
const DATE = "2026-10-20";

const plan: CarePlan = {
  parentName: "Grace",
  familyName: "Ada",
  timeZone: TZ,
  quietMorningBy: "10:30",
  lateNightStart: "23:00",
  lateNightEnd: "05:00",
  packageHours: 3,
  darkAt: "18:30",
  doorbellAnswerMinutes: 3,
  visitGraceMinutes: 15,
  deviceId: null,
  contacts: [],
  visitors: [
    { id: "aide", name: "Home aide", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "09:00", windowEnd: "10:30" },
    { id: "meals", name: "Meal delivery", days: [1, 2, 3, 4, 5], windowStart: "12:00", windowEnd: "13:00" },
  ],
};

/** Run a scenario to its end with mock tags and return which rules fired. */
function rulesFired(id: string): string[] {
  const s = listScenarios().find((x) => x.id === id)!;
  const events = materialize(s, DATE, TZ, "dev").map((m) => ({
    ...m.event,
    tags: { people: 0, packageVisible: null, doorOpen: null, vehicle: false, roles: [], ...m.hint.tags },
  }));
  const p = s.visitors ? { ...plan, visitors: s.visitors } : plan;
  return evaluateRules({ now: scenarioEndMs(s, DATE, TZ), plan: p, events })
    .filter((a) => a.clearedAt === null || id === "quiet_morning") // quiet_morning is designed to clear
    .map((a) => a.rule);
}

describe("scenarios", () => {
  it("all five ship, parse, and reference images that exist", () => {
    const all = listScenarios();
    expect(all.map((s) => s.id)).toHaveLength(5);
    for (const s of all)
      for (const e of s.events) expect(fs.existsSync(scenarioImagePath(e.image)), e.image).toBe(true);
  });

  it("produce exactly the alerts they're designed to demonstrate", () => {
    expect(rulesFired("grace_normal_day")).toEqual([]);
    expect(rulesFired("missed_aide_visit")).toEqual(["missed_visit"]);
    expect(rulesFired("package_left_out")).toEqual(["package_left_out"]);
    expect(rulesFired("quiet_morning")).toEqual(["quiet_morning"]);
    expect(rulesFired("late_night_ding").sort()).toEqual(["late_night_activity", "unanswered_doorbell"]);
  });

  it("missed_aide_visit behaves the same on a weekend (pinned schedule)", () => {
    const s = listScenarios().find((x) => x.id === "missed_aide_visit")!;
    const sunday = "2026-10-25";
    const events = materialize(s, sunday, TZ, "dev").map((m) => ({
      ...m.event,
      tags: { people: 0, packageVisible: null, doorOpen: null, vehicle: false, roles: [], ...m.hint.tags },
    }));
    const out = evaluateRules({ now: scenarioEndMs(s, sunday, TZ), plan: { ...plan, visitors: s.visitors! }, events });
    expect(out.map((a) => [a.rule, a.clearedAt])).toEqual([["missed_visit", null]]);
  });

  it("advances the simulated clock by speed and stops at the end", () => {
    const s = listScenarios()[0]!;
    const start = scenarioStartMs(s, DATE, TZ);
    const state: ScenarioState = { scenarioId: s.id, dateKey: DATE, simMs: start, speed: 60, playing: true, lastRealMs: 1000 };
    const next = advanceClock(state, s, TZ, 11_000); // 10 real seconds at 60x = 10 minutes
    expect(next.simMs - start).toBe(10 * 60_000);
    const done = advanceClock(next, s, TZ, 10_000_000_000);
    expect(done.simMs).toBe(scenarioEndMs(s, DATE, TZ));
    expect(done.playing).toBe(false);
    const paused = advanceClock({ ...state, playing: false }, s, TZ, 50_000);
    expect(paused.simMs).toBe(start);
  });

  it("scenario events are labelled simulated with stable ids", () => {
    const [m] = materialize(listScenarios()[0]!, DATE, TZ, "dev");
    expect(m?.event.origin).toBe("simulated");
    expect(m?.event.id).toBe("sim:grace_normal_day:00");
  });
});
