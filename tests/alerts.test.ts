import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// Isolated SQLite database for these tests.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "doorstep-test-"));
process.env.DOORSTEP_DATA_DIR = dir;

type Store = typeof import("@/lib/store");
type Alerts = typeof import("@/lib/alerts");
let store: Store;
let alerts: Alerts;

beforeAll(async () => {
  store = await import("@/lib/store");
  alerts = await import("@/lib/alerts");
});

const MIN = 60_000;
const candidate = (id: string, severity: "urgent" | "attention", triggeredAt: number) => ({
  id,
  rule: (severity === "urgent" ? "late_night_activity" : "unanswered_doorbell") as "late_night_activity",
  severity,
  title: "t",
  detail: "d",
  triggeredAt,
  eventIds: [],
  bestEffort: false,
  clearedAt: null,
  clearedReason: null,
});

describe("caretaker actions and timers", () => {
  it("escalates an unacknowledged urgent alert after 15 minutes to the second family contact", () => {
    const now = Date.now();
    store.upsertAlerts([candidate("late_night:a", "urgent", now - 16 * MIN)], "live");
    alerts.processAlertTimers("live", now);
    const a = store.getAlert("live:late_night:a")!;
    expect(a.escalatedAt).toBe(a.triggeredAt + 15 * MIN);
    expect(a.escalatedTo).toBe("Chidi (Ada's brother)");
    expect(store.alertActions(a.id).map((x) => x.action)).toEqual(["escalated"]);
    // Idempotent.
    alerts.processAlertTimers("live", now + MIN);
    expect(store.alertActions(a.id)).toHaveLength(1);
  });

  it("doesn't escalate attention-level, acknowledged or young alerts", () => {
    const now = Date.now();
    store.upsertAlerts(
      [candidate("x:attention", "attention", now - 60 * MIN), candidate("late_night:young", "urgent", now - 5 * MIN), candidate("late_night:ack", "urgent", now - 60 * MIN)],
      "live",
    );
    alerts.performAlertAction("live:late_night:ack", { action: "call", contactId: "grace" });
    alerts.processAlertTimers("live", now);
    for (const id of ["live:x:attention", "live:late_night:young", "live:late_night:ack"]) expect(store.getAlert(id)!.escalatedAt).toBeNull();
    expect(store.getAlert("live:late_night:ack")!.status).toBe("acknowledged");
    expect(store.alertActions("live:late_night:ack")[0]!.label).toBe("Called Grace");
  });

  it("remind me in 30 min hides the alert, then resurfaces it when due", () => {
    const now = Date.now();
    store.upsertAlerts([candidate("x:remind", "attention", now - MIN)], "live");
    const id = "live:x:remind";
    alerts.performAlertAction(id, { action: "remind", minutes: 30 });
    const snoozed = store.getAlert(id)!;
    expect(snoozed.snoozedUntil).toBeGreaterThan(now + 29 * MIN);
    alerts.processAlertTimers("live", now + 10 * MIN);
    expect(store.getAlert(id)!.snoozedUntil).not.toBeNull();
    alerts.processAlertTimers("live", now + 31 * MIN);
    const due = store.getAlert(id)!;
    expect(due.snoozedUntil).toBeNull();
    expect(due.status).toBe("open");
    expect(store.alertActions(id).map((x) => x.action)).toEqual(["remind", "reminder_due"]);
  });

  it("that was expected resolves the alert and can add the visitor to the schedule", async () => {
    const { listVisitors } = await import("@/lib/config");
    store.upsertAlerts([candidate("x:exp", "attention", Date.now())], "live");
    const before = listVisitors().length;
    const res = alerts.performAlertAction("live:x:exp", {
      action: "expected",
      addVisitor: { name: "Night nurse", days: [4], windowStart: "23:15", windowEnd: "23:59" },
    });
    expect(res.ok).toBe(true);
    expect(store.getAlert("live:x:exp")!.status).toBe("resolved");
    expect(listVisitors()).toHaveLength(before + 1);
    expect(store.alertActions("live:x:exp")[0]!.label).toContain("added Night nurse (23:15–23:59)");
  });

  it("rejects unknown contacts and backwards windows", () => {
    store.upsertAlerts([candidate("x:bad", "attention", Date.now())], "live");
    expect(alerts.performAlertAction("live:x:bad", { action: "call", contactId: "nobody" })).toMatchObject({ ok: false, status: 400 });
    expect(
      alerts.performAlertAction("live:x:bad", { action: "expected", addVisitor: { name: "X", days: [1], windowStart: "10:00", windowEnd: "09:00" } }),
    ).toMatchObject({ ok: false, status: 400 });
  });

  it("acted-on alerts are never pruned when rules stop producing them", () => {
    store.upsertAlerts([candidate("x:keep", "attention", Date.now()), candidate("x:drop", "attention", Date.now())], "live");
    alerts.performAlertAction("live:x:keep", { action: "remind", minutes: 30 });
    store.pruneAlerts("live", [], Date.now() - 60 * MIN, Date.now() + MIN);
    expect(store.getAlert("live:x:keep")).not.toBeNull();
    expect(store.getAlert("live:x:drop")).toBeNull();
  });
});
