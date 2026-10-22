// Alert detail, caretaker actions, reminders and in-app escalation.
import { z } from "zod";
import { getCarePlan, getDataMode, replaceVisitors } from "./config";
import { currentNow, effectivePlan, ORIGIN_FOR_MODE } from "./pipeline";
import { explainAlert } from "./rules/explain";
import * as store from "./store";
import { clockLabel, formatHHMM, minutesOfDay, parseHHMM, weekdayOf, localDateKey } from "./time";
import type { Alert, AlertAction, Contact, EventOrigin, Visitor } from "./types";
import { ORIGIN_LABEL, toEventView, type TimelineView } from "./view";

const MIN = 60_000;
/** Urgent alerts nobody acknowledges within this long are escalated in-app. */
export const ESCALATE_AFTER_MS = 15 * MIN;
export const REMIND_AFTER_MS = 30 * MIN;
const RELATED_WINDOW_MS = 10 * MIN;

export interface AlertDetail {
  alert: Alert;
  why: string;
  timeLabel: string;
  originLabel: string;
  /** The events the rule cited (e.g. the doorbell press), newest first. */
  events: TimelineView[];
  /** Other door events within ±10 minutes, for context. */
  related: TimelineView[];
  actions: Array<AlertAction & { timeLabel: string }>;
  contacts: Contact[];
  parentName: string;
  escalationContact: Contact | null;
  /** Suggested schedule entry for "That was expected" (from the cited person/doorbell event). */
  suggestedVisitor: Omit<Visitor, "id" | "name"> | null;
  snoozed: boolean;
  snoozeLabel: string | null;
  nowMs: number;
}

export function alertDetail(id: string): AlertDetail | null {
  const alert = store.getAlert(id);
  if (!alert) return null;
  const mode = (Object.keys(ORIGIN_FOR_MODE) as Array<keyof typeof ORIGIN_FOR_MODE>).find((m) => ORIGIN_FOR_MODE[m] === alert.origin)!;
  const plan = effectivePlan(mode);
  const tz = plan.timeZone;
  const contacts = getCarePlan().contacts;

  const cited = alert.eventIds.map((eid) => store.getEvent(eid)).filter((e) => !!e);
  const anchors = cited.length ? cited.map((e) => e.startMs) : [alert.triggeredAt];
  const from = Math.min(...anchors) - RELATED_WINDOW_MS;
  const to = Math.max(...anchors) + RELATED_WINDOW_MS;
  const nearby = store.timeline(alert.origin, from, Math.min(to, currentNow(mode)));
  const citedIds = new Set(alert.eventIds);
  const descs = store.descriptionsFor(alert.eventIds);

  const firstPerson = cited.find((e) => e.kind === "ding" || e.kind === "person");
  const suggestedVisitor = firstPerson
    ? (() => {
        const m = minutesOfDay(firstPerson.startMs, tz);
        return {
          days: [weekdayOf(localDateKey(firstPerson.startMs, tz))],
          windowStart: formatHHMM(Math.max(0, m - 30)),
          windowEnd: formatHHMM(Math.min(23 * 60 + 59, m + 30)),
        };
      })()
    : null;

  return {
    alert,
    why: explainAlert(alert, plan, cited),
    timeLabel: clockLabel(alert.triggeredAt, tz),
    originLabel: ORIGIN_LABEL[alert.origin],
    events: cited
      .map((e) => toEventView({ ...e, description: descs.get(e.id) ?? null }, tz))
      .sort((a, b) => b.startMs - a.startMs),
    related: nearby
      .filter((e) => !citedIds.has(e.id))
      .map((e) => toEventView(e, tz))
      .sort((a, b) => a.startMs - b.startMs),
    actions: store.alertActions(id).map((a) => ({ ...a, timeLabel: clockLabel(a.appAt, tz) })),
    contacts,
    parentName: plan.parentName,
    escalationContact: contacts.find((c) => c.escalation) ?? null,
    suggestedVisitor,
    snoozed: !!alert.snoozedUntil && alert.snoozedUntil > currentNow(mode),
    snoozeLabel: alert.snoozedUntil ? clockLabel(alert.snoozedUntil, tz) : null,
    nowMs: currentNow(mode),
  };
}

const actionSchemaStrict = z.discriminatedUnion("action", [
  z.object({ action: z.literal("call"), contactId: z.string() }),
  z.object({
    action: z.literal("expected"),
    addVisitor: z
      .object({
        name: z.string().trim().min(1).max(60),
        days: z.array(z.number().int().min(0).max(6)).min(1),
        windowStart: z.string(),
        windowEnd: z.string(),
      })
      .optional(),
  }),
  z.object({ action: z.literal("remind"), minutes: z.number().int().min(1).max(24 * 60).default(30) }),
  z.object({ action: z.literal("resolve") }),
  z.object({ action: z.literal("reopen") }),
  z.object({ action: z.literal("acknowledge") }),
]);

/** Accepts the action API, plus the earlier `{status}` API for back-compat. */
export const actionSchema = z.union([
  actionSchemaStrict,
  z.object({ status: z.enum(["open", "acknowledged", "resolved"]) }).transform((v) => ({
    action: v.status === "resolved" ? ("resolve" as const) : v.status === "open" ? ("reopen" as const) : ("acknowledge" as const),
  })),
]);

export type AlertActionInput = z.infer<typeof actionSchema>;

export function performAlertAction(id: string, input: AlertActionInput): { ok: true } | { ok: false; error: string; status: number } {
  const alert = store.getAlert(id);
  if (!alert) return { ok: false, error: "Alert not found", status: 404 };
  const mode = (Object.keys(ORIGIN_FOR_MODE) as Array<keyof typeof ORIGIN_FOR_MODE>).find((m) => ORIGIN_FOR_MODE[m] === alert.origin)!;
  const now = currentNow(mode);
  const plan = getCarePlan();

  switch (input.action) {
    case "call": {
      const c = plan.contacts.find((x) => x.id === input.contactId);
      if (!c) return { ok: false, error: "Unknown contact", status: 400 };
      store.addAlertAction(id, "call", `Called ${c.name}`, now);
      if (alert.status === "open") store.setAlertStatus(id, "acknowledged");
      store.setAlertSnooze(id, null);
      break;
    }
    case "expected": {
      let label = "Marked as expected";
      if (input.addVisitor) {
        const v = input.addVisitor;
        if (parseHHMM(v.windowEnd) <= parseHHMM(v.windowStart)) return { ok: false, error: "The window must end after it starts", status: 400 };
        const visitors = [...plan.visitors, { id: `v${Date.now().toString(36)}`, ...v }];
        replaceVisitors(visitors);
        label += ` · added ${v.name} (${v.windowStart}–${v.windowEnd}) to the schedule`;
      }
      store.addAlertAction(id, "expected", label, now);
      store.setAlertStatus(id, "resolved");
      store.setAlertSnooze(id, null);
      break;
    }
    case "remind": {
      const until = now + input.minutes * MIN;
      store.setAlertSnooze(id, until);
      store.addAlertAction(id, "remind", `Remind me in ${input.minutes} min (at ${clockLabel(until, plan.timeZone)})`, now);
      if (alert.status === "open") store.setAlertStatus(id, "acknowledged");
      break;
    }
    case "acknowledge":
      store.setAlertStatus(id, "acknowledged");
      store.addAlertAction(id, "acknowledged", "Acknowledged", now);
      break;
    case "resolve":
      store.setAlertStatus(id, "resolved");
      store.setAlertSnooze(id, null);
      store.addAlertAction(id, "resolved", "Marked as sorted", now);
      break;
    case "reopen":
      store.setAlertStatus(id, "open");
      store.addAlertAction(id, "reopened", "Reopened", now);
      break;
  }
  return { ok: true };
}

/**
 * Run on every tick: due reminders resurface their alert; urgent alerts nobody has acted on for
 * 15 minutes (app time) are escalated in-app to the second family contact. No SMS/email.
 */
export function processAlertTimers(origin: EventOrigin, now: number): void {
  const plan = getCarePlan();
  const second = plan.contacts.find((c) => c.escalation) ?? null;
  for (const a of store.listAlerts(origin, now - 2 * 24 * 60 * MIN, now)) {
    if (a.status === "resolved" || a.clearedAt !== null) continue;
    if (a.snoozedUntil && a.snoozedUntil <= now) {
      store.setAlertSnooze(a.id, null);
      store.setAlertStatus(a.id, "open");
      store.addAlertAction(a.id, "reminder_due", "Reminder: still needs a look", a.snoozedUntil);
    }
    if (a.severity === "urgent" && a.status === "open" && !a.escalatedAt && !a.snoozedUntil && now - a.triggeredAt >= ESCALATE_AFTER_MS) {
      const at = a.triggeredAt + ESCALATE_AFTER_MS;
      store.setAlertEscalated(a.id, at, second?.name ?? null);
      store.addAlertAction(
        a.id,
        "escalated",
        second ? `Escalated to ${second.name} — nobody acknowledged it for 15 min (in-app)` : "Unacknowledged for 15 min — add a second family contact in the Care plan to escalate",
        at,
      );
    }
  }
}

export function currentOrigin(): EventOrigin {
  return ORIGIN_FOR_MODE[getDataMode()];
}
