import { describe, expect, it } from "vitest";
import {
  evaluateRules,
  lateNightActivity,
  missedVisits,
  packagesLeftOut,
  quietMorning,
  unansweredDoorbell,
  type RuleEvent,
} from "@/lib/rules/engine";
import type { CarePlan, DescriptionTags, EventKind } from "@/lib/types";
import { zonedTimeToUtc } from "@/lib/time";

const TZ = "Africa/Lagos"; // UTC+1, no DST
const DAY = "2026-10-20"; // a Tuesday

const plan = (over: Partial<CarePlan> = {}): CarePlan => ({
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
  visitors: [{ id: "aide", name: "Home aide", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "09:00", windowEnd: "10:30" }],
  ...over,
});

const at = (hhmm: string, date = DAY, tz = TZ) => {
  const [h, m] = hhmm.split(":").map(Number) as [number, number];
  return zonedTimeToUtc(date, h * 60 + m, tz);
};

let seq = 0;
const ev = (time: string, kind: EventKind, tags?: Partial<DescriptionTags> | null, date = DAY, tz = TZ): RuleEvent => ({
  id: `e${++seq}`,
  deviceId: "d1",
  kind,
  startMs: at(time, date, tz),
  endMs: null,
  origin: "simulated",
  rawType: kind,
  rawSubType: null,
  tags:
    tags === null || tags === undefined
      ? null
      : { people: 1, packageVisible: null, doorOpen: null, vehicle: false, roles: [], ...tags },
});

describe("quiet morning", () => {
  it("does nothing before the configured time", () => {
    expect(quietMorning({ now: at("10:29"), plan: plan(), events: [] })).toEqual([]);
  });

  it("fires at the configured time when there was no activity", () => {
    const [a] = quietMorning({ now: at("10:30"), plan: plan(), events: [] });
    expect(a?.id).toBe(`quiet_morning:${DAY}`);
    expect(a?.triggeredAt).toBe(at("10:30"));
    expect(a?.clearedAt).toBeNull();
  });

  it("is satisfied by any morning activity, including a package", () => {
    expect(quietMorning({ now: at("11:00"), plan: plan(), events: [ev("08:00", "package")] })).toEqual([]);
  });

  it("ignores late-night activity before morning starts, vehicles and live views", () => {
    const events = [ev("02:00", "person"), ev("09:00", "vehicle"), ev("09:30", "on_demand")];
    expect(quietMorning({ now: at("11:00"), plan: plan(), events })).toHaveLength(1);
  });

  it("clears when activity appears later", () => {
    const [a] = quietMorning({ now: at("12:00"), plan: plan(), events: [ev("11:20", "motion")] });
    expect(a?.clearedAt).toBe(at("11:20"));
    expect(a?.clearedReason).toContain("11:20");
  });

  it("ignores events that haven't happened yet (scenario clock)", () => {
    const out = evaluateRules({ now: at("10:45"), plan: plan({ visitors: [] }), events: [ev("11:20", "motion")] });
    expect(out.map((a) => a.rule)).toEqual(["quiet_morning"]);
    expect(out[0]?.clearedAt).toBeNull();
  });
});

describe("missed visit", () => {
  it("waits until the window plus grace has passed", () => {
    expect(missedVisits({ now: at("10:44"), plan: plan(), events: [] })).toEqual([]);
    expect(missedVisits({ now: at("10:45"), plan: plan(), events: [] })).toHaveLength(1);
  });

  it("counts a doorbell or person inside the window (with grace) as the visit", () => {
    expect(missedVisits({ now: at("12:00"), plan: plan(), events: [ev("08:50", "ding")] })).toEqual([]);
    expect(missedVisits({ now: at("12:00"), plan: plan(), events: [ev("10:40", "person")] })).toEqual([]);
  });

  it("does not count vehicles, animals or packages as a visit", () => {
    const events = [ev("09:30", "vehicle"), ev("09:40", "animal"), ev("09:50", "package")];
    expect(missedVisits({ now: at("12:00"), plan: plan(), events })).toHaveLength(1);
  });

  it("ignores visitors not scheduled today", () => {
    const p = plan({ visitors: [{ id: "x", name: "Nurse", days: [0], windowStart: "09:00", windowEnd: "10:00" }] });
    expect(missedVisits({ now: at("12:00"), plan: p, events: [] })).toEqual([]);
  });

  it("notes a late arrival as cleared", () => {
    const [a] = missedVisits({ now: at("12:30"), plan: plan(), events: [ev("11:40", "ding")] });
    expect(a?.clearedReason).toContain("11:40");
  });

  it("a late arrival more than 2 hours after the deadline doesn't clear it", () => {
    const [a] = missedVisits({ now: at("14:00"), plan: plan(), events: [ev("12:50", "ding")] });
    expect(a?.clearedAt).toBeNull();
  });

  it("someone arriving during another visitor's window doesn't clear it", () => {
    const p = plan({
      visitors: [
        { id: "aide", name: "Home aide", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "09:00", windowEnd: "10:30" },
        { id: "meals", name: "Meal delivery", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "11:30", windowEnd: "12:00" },
      ],
    });
    const out = missedVisits({ now: at("13:00"), plan: p, events: [ev("11:40", "ding")] });
    expect(out).toHaveLength(1);
    expect(out[0]?.id).toBe(`missed_visit:aide:${DAY}`);
    expect(out[0]?.clearedAt).toBeNull();
  });

  it("uses a stable id per visitor per day", () => {
    const [a] = missedVisits({ now: at("12:00"), plan: plan(), events: [] });
    expect(a?.id).toBe(`missed_visit:aide:${DAY}`);
  });
});

describe("package left out", () => {
  it("fires after N hours with no pickup", () => {
    const events = [ev("10:00", "package", { packageVisible: true })];
    expect(packagesLeftOut({ now: at("12:59"), plan: plan(), events })).toEqual([]);
    const [a] = packagesLeftOut({ now: at("13:00"), plan: plan(), events });
    expect(a?.triggeredAt).toBe(at("13:00"));
  });

  it("fires at dark if that comes before N hours", () => {
    const events = [ev("17:00", "package", { packageVisible: true })];
    const [a] = packagesLeftOut({ now: at("18:30"), plan: plan(), events });
    expect(a?.triggeredAt).toBe(at("18:30"));
    expect(a?.detail).toContain("after dark");
  });

  it("gives a 30-minute grace when delivered after dark", () => {
    const events = [ev("19:00", "package", { packageVisible: true })];
    expect(packagesLeftOut({ now: at("19:29"), plan: plan(), events })).toEqual([]);
    expect(packagesLeftOut({ now: at("19:30"), plan: plan(), events })).toHaveLength(1);
  });

  it("no alert when the package is brought in before the threshold", () => {
    const events = [ev("10:00", "package", { packageVisible: true }), ev("11:00", "person", { packageVisible: false })];
    expect(packagesLeftOut({ now: at("15:00"), plan: plan(), events })).toEqual([]);
  });

  it("a person walking past while the package is still visible is not a pickup", () => {
    const events = [ev("10:00", "package", { packageVisible: true }), ev("11:00", "person", { packageVisible: true })];
    expect(packagesLeftOut({ now: at("13:30"), plan: plan(), events })).toHaveLength(1);
  });

  it("treats an undescribed later person event as a pickup (fewer false alarms)", () => {
    const events = [ev("10:00", "package", { packageVisible: true }), ev("11:00", "person", null)];
    expect(packagesLeftOut({ now: at("15:00"), plan: plan(), events })).toEqual([]);
  });

  it("clears when picked up after the alert fired", () => {
    const events = [ev("10:00", "package", { packageVisible: true }), ev("14:10", "person", { packageVisible: false })];
    const [a] = packagesLeftOut({ now: at("15:00"), plan: plan(), events });
    expect(a?.clearedAt).toBe(at("14:10"));
  });

  it("repeated package events before pickup produce one alert", () => {
    const events = [
      ev("10:00", "package", { packageVisible: true }),
      ev("10:01", "motion", { packageVisible: true }),
      ev("11:00", "package", { packageVisible: true }),
    ];
    expect(packagesLeftOut({ now: at("16:00"), plan: plan(), events })).toHaveLength(1);
  });
});

describe("late-night activity", () => {
  it("flags person/doorbell events inside a window that wraps midnight", () => {
    const events = [ev("23:30", "ding", {}, "2026-10-19"), ev("04:59", "person")];
    const out = lateNightActivity({ now: at("06:00"), plan: plan(), events });
    expect(out).toHaveLength(2);
    expect(out[0]?.severity).toBe("urgent");
  });

  it("ignores the boundaries' outside and non-person kinds", () => {
    const events = [ev("05:00", "person"), ev("22:59", "ding", {}, "2026-10-19"), ev("01:00", "vehicle"), ev("01:10", "animal")];
    expect(lateNightActivity({ now: at("06:00"), plan: plan(), events })).toEqual([]);
  });

  it("groups a burst within 15 minutes into one alert", () => {
    const events = [ev("23:41", "ding"), ev("23:42", "person"), ev("23:44", "ding")];
    const out = lateNightActivity({ now: at("23:50"), plan: plan(), events });
    expect(out).toHaveLength(1);
    expect(out[0]?.eventIds).toHaveLength(3);
    expect(out[0]?.title).toMatch(/rang the doorbell/);
  });

  it("supports a non-wrapping window", () => {
    const p = plan({ lateNightStart: "01:00", lateNightEnd: "04:00" });
    expect(lateNightActivity({ now: at("06:00"), plan: p, events: [ev("00:30", "person"), ev("02:00", "person")] })).toHaveLength(1);
  });
});

describe("unanswered doorbell (best-effort)", () => {
  it("waits for the answer window", () => {
    const events = [ev("14:00", "ding", { doorOpen: false })];
    expect(unansweredDoorbell({ now: at("14:02"), plan: plan(), events })).toEqual([]);
    const out = unansweredDoorbell({ now: at("14:03"), plan: plan(), events });
    expect(out).toHaveLength(1);
    expect(out[0]?.bestEffort).toBe(true);
  });

  it("answered if the door is seen open, or two people together", () => {
    const open = [ev("14:00", "ding"), ev("14:01", "person", { doorOpen: true })];
    const two = [ev("15:00", "ding"), ev("15:01", "person", { people: 2 })];
    expect(unansweredDoorbell({ now: at("16:00"), plan: plan(), events: open })).toEqual([]);
    expect(unansweredDoorbell({ now: at("16:00"), plan: plan(), events: two })).toEqual([]);
  });

  it("an answer after the window doesn't count", () => {
    const events = [ev("14:00", "ding"), ev("14:10", "person", { doorOpen: true })];
    expect(unansweredDoorbell({ now: at("15:00"), plan: plan(), events })).toHaveLength(1);
  });

  it("repeated rings within the window are one visit, and the window extends", () => {
    const events = [ev("23:41", "ding"), ev("23:44", "ding")];
    expect(unansweredDoorbell({ now: at("23:46"), plan: plan(), events })).toEqual([]);
    const out = unansweredDoorbell({ now: at("23:47"), plan: plan(), events });
    expect(out).toHaveLength(1);
    expect(out[0]?.detail).toContain("Rang 2 times");
  });
});

describe("time zones and DST", () => {
  it("evaluates in the parent's zone, not the server's", () => {
    // 10:30 in Tokyo is 01:30 UTC.
    const p = plan({ timeZone: "Asia/Tokyo", visitors: [] });
    const now = zonedTimeToUtc(DAY, 10 * 60 + 30, "Asia/Tokyo");
    expect(new Date(now).toISOString()).toBe("2026-10-20T01:30:00.000Z");
    expect(quietMorning({ now, plan: p, events: [] })).toHaveLength(1);
    expect(quietMorning({ now: now - 60_000, plan: p, events: [] })).toEqual([]);
  });

  it("handles a DST fall-back day in New York (25-hour day)", () => {
    const tz = "America/New_York";
    const date = "2026-11-01"; // clocks go back at 02:00
    const p = plan({ timeZone: tz, visitors: [] });
    const nowET = zonedTimeToUtc(date, 10 * 60 + 30, tz);
    expect(new Date(nowET).toISOString()).toBe("2026-11-01T15:30:00.000Z"); // EST = UTC-5
    const [a] = quietMorning({ now: nowET, plan: p, events: [] });
    expect(a?.id).toBe(`quiet_morning:${date}`);
  });

  it("handles a DST spring-forward day for late-night windows", () => {
    const tz = "America/New_York";
    const date = "2026-03-08"; // 02:00 → 03:00
    const p = plan({ timeZone: tz, visitors: [] });
    const events = [ev("01:30", "person", {}, date, tz), ev("03:30", "ding", {}, date, tz)];
    const out = lateNightActivity({ now: zonedTimeToUtc(date, 6 * 60, tz), plan: p, events });
    // 01:30 EST and 03:30 EDT are only 60 real minutes apart, still > 15 min → two alerts.
    expect(out).toHaveLength(2);
    expect(out[1]!.triggeredAt - out[0]!.triggeredAt).toBe(60 * 60_000);
  });
});

describe("evaluateRules", () => {
  it("a normal day produces no alerts", () => {
    const events = [
      ev("07:48", "motion", { doorOpen: true }),
      ev("09:12", "ding"),
      ev("09:13", "person", { people: 2, doorOpen: true }),
      ev("14:05", "package", { packageVisible: true }),
      ev("15:32", "person", { packageVisible: false, doorOpen: true }),
    ];
    expect(evaluateRules({ now: at("21:30"), plan: plan(), events })).toEqual([]);
  });

  it("is deterministic regardless of input order", () => {
    const events = [ev("23:41", "ding"), ev("13:00", "package", { packageVisible: true }), ev("23:44", "ding")];
    const a = evaluateRules({ now: at("23:59"), plan: plan(), events });
    const b = evaluateRules({ now: at("23:59"), plan: plan(), events: [...events].reverse() });
    expect(a).toEqual(b);
    expect(a.map((x) => x.rule).sort()).toEqual(
      ["late_night_activity", "missed_visit", "package_left_out", "quiet_morning", "unanswered_doorbell"].sort(),
    );
  });
});
