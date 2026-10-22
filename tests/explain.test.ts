import { describe, expect, it } from "vitest";
import { explainAlert } from "@/lib/rules/explain";
import type { CarePlan } from "@/lib/types";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "Africa/Lagos";
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
  visitors: [{ id: "aide", name: "Home aide", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "09:00", windowEnd: "10:30" }],
};
const at = (h: number, m: number) => zonedTimeToUtc("2026-10-22", h * 60 + m, TZ);

describe("explainAlert", () => {
  it("late-night activity references the care plan's hours", () => {
    const ev = { id: "e1", kind: "ding" as const, startMs: at(23, 41) };
    const s = explainAlert({ id: "simulated:late_night:e1", rule: "late_night_activity", triggeredAt: ev.startMs, eventIds: ["e1"] }, plan, [ev]);
    expect(s).toBe(
      "Doorbell at 23:41 — outside Grace's usual hours (05:00–23:00). Your care plan flags anyone at the door between 23:00 and 05:00.",
    );
  });

  it("missed visit names the visitor, days and grace window", () => {
    const s = explainAlert({ id: "simulated:missed_visit:aide:2026-10-22", rule: "missed_visit", triggeredAt: at(10, 45), eventIds: [] }, plan, []);
    expect(s).toBe("Home aide is scheduled 09:00–10:30 every day. Nobody came to the door between 08:45 and 10:45 (your 15-minute grace).");
  });

  it("missed visit with specific days", () => {
    const p = { ...plan, visitors: [{ ...plan.visitors[0]!, days: [1, 3] }] };
    const s = explainAlert({ id: "live:missed_visit:aide:2026-10-22", rule: "missed_visit", triggeredAt: 0, eventIds: [] }, p, []);
    expect(s).toContain("on Mondays, Wednesdays");
  });

  it("quiet morning, package and doorbell", () => {
    expect(explainAlert({ id: "x:quiet_morning:2026-10-22", rule: "quiet_morning", triggeredAt: 0, eventIds: [] }, plan, [])).toBe(
      "No door activity at all between 05:00 and 10:30. Your care plan expects to see Grace or a visitor by 10:30.",
    );
    const pk = { id: "p", kind: "package" as const, startMs: at(13, 15) };
    expect(explainAlert({ id: "x:package_left_out:p", rule: "package_left_out", triggeredAt: 0, eventIds: ["p"] }, plan, [pk])).toContain(
      "delivered at 13:15",
    );
    const d = { id: "d", kind: "ding" as const, startMs: at(14, 2) };
    expect(explainAlert({ id: "x:unanswered_doorbell:d", rule: "unanswered_doorbell", triggeredAt: 0, eventIds: ["d"] }, plan, [d])).toContain(
      "rang at 14:02",
    );
  });
});
