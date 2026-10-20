// Doorstep caretaking rules. Pure functions: (events, care plan, now) → alert candidates.
// No I/O, no clock reads, no randomness — so every rule is unit-testable, including across
// time zones and DST changes. Alert ids are deterministic so the pipeline can upsert them
// without duplicating or losing a family member's "acknowledged" state.

import type { AlertCandidate, CarePlan, DescriptionTags, DoorEvent } from "../types";
import {
  clockLabel,
  formatHHMM,
  inWrappingWindow,
  localDateKey,
  minutesOfDay,
  parseHHMM,
  weekdayOf,
  zonedTimeToUtc,
} from "../time";

export interface RuleEvent extends DoorEvent {
  tags?: DescriptionTags | null;
}

export interface RulesInput {
  now: number;
  plan: CarePlan;
  /** Events from at least the previous 24 h. Order does not matter. */
  events: RuleEvent[];
}

const MIN = 60_000;
const HOUR = 60 * MIN;

/** Kinds that represent a person at the door (as opposed to cars, animals or live views). */
const PERSON_KINDS = new Set(["person", "ding"]);
/** Kinds that count as "door activity" for the quiet-morning rule. */
const ACTIVITY_KINDS = new Set(["person", "ding", "package", "motion"]);

export function evaluateRules(input: RulesInput): AlertCandidate[] {
  const events = input.events
    .filter((e) => e.startMs <= input.now)
    .sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id));
  const ctx = { ...input, events };
  return [
    ...quietMorning(ctx),
    ...missedVisits(ctx),
    ...packagesLeftOut(ctx),
    ...lateNightActivity(ctx),
    ...unansweredDoorbell(ctx),
  ].sort((a, b) => a.triggeredAt - b.triggeredAt || a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// Quiet morning: no door activity of any kind between the end of the late-night
// window (start of "morning") and the configured time.

export function quietMorning({ now, plan, events }: RulesInput): AlertCandidate[] {
  const tz = plan.timeZone;
  const today = localDateKey(now, tz);
  const byMin = parseHHMM(plan.quietMorningBy);
  if (minutesOfDay(now, tz) < byMin) return [];

  const morningStartMin = Math.min(parseHHMM(plan.lateNightEnd), byMin);
  const from = zonedTimeToUtc(today, morningStartMin, tz);
  const by = zonedTimeToUtc(today, byMin, tz);
  const activity = events.filter((e) => ACTIVITY_KINDS.has(e.kind));
  if (activity.some((e) => e.startMs >= from && e.startMs < by)) return [];

  const later = activity.find((e) => e.startMs >= by);
  return [
    {
      id: `quiet_morning:${today}`,
      rule: "quiet_morning",
      severity: "attention",
      title: `A quiet morning at ${plan.parentName}'s door`,
      detail: `No door activity between ${formatHHMM(morningStartMin)} and ${plan.quietMorningBy}. That can be perfectly normal, but it may be worth a call.`,
      triggeredAt: by,
      eventIds: later ? [later.id] : [],
      bestEffort: false,
      clearedAt: later ? later.startMs : null,
      clearedReason: later ? `Door activity at ${clockLabel(later.startMs, tz)}` : null,
    },
  ];
}

// ---------------------------------------------------------------------------
// Missed visit: a scheduled visitor's window passed (plus grace) with nobody at the door.
// Doorstep never identifies people, so "a visit" means any person/doorbell event in the window.

export function missedVisits({ now, plan, events }: RulesInput): AlertCandidate[] {
  const tz = plan.timeZone;
  const today = localDateKey(now, tz);
  const weekday = weekdayOf(today);
  const grace = plan.visitGraceMinutes * MIN;
  const people = events.filter((e) => PERSON_KINDS.has(e.kind));
  const out: AlertCandidate[] = [];

  for (const v of plan.visitors) {
    if (!v.days.includes(weekday)) continue;
    const startMin = parseHHMM(v.windowStart);
    const endMin = parseHHMM(v.windowEnd);
    if (endMin <= startMin) continue; // overnight windows are rejected by the care-plan validator
    const ws = zonedTimeToUtc(today, startMin, tz);
    const we = zonedTimeToUtc(today, endMin, tz);
    const deadline = we + grace;
    if (now < deadline) continue;
    if (people.some((e) => e.startMs >= ws - grace && e.startMs <= deadline)) continue;

    const late = people.find((e) => e.startMs > deadline);
    out.push({
      id: `missed_visit:${v.id}:${today}`,
      rule: "missed_visit",
      severity: "attention",
      title: `${v.name} doesn't seem to have come`,
      detail: `Expected ${v.windowStart}–${v.windowEnd}. Nobody was seen at the door in that window.`,
      triggeredAt: deadline,
      eventIds: late ? [late.id] : [],
      bestEffort: false,
      clearedAt: late ? late.startMs : null,
      clearedReason: late ? `Someone came to the door at ${clockLabel(late.startMs, tz)} (after the window)` : null,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Package left out: a package with no later sign of being brought in, for N hours or past dark.
// "Brought in" = a later snapshot where the model says no package is visible; if a later person
// event has no description yet, we optimistically treat it as a pickup (fewer false alarms).

export function packagesLeftOut({ now, plan, events }: RulesInput): AlertCandidate[] {
  const tz = plan.timeZone;
  const darkMin = parseHHMM(plan.darkAt);
  const out: AlertCandidate[] = [];
  const recent = events.filter((e) => e.startMs >= now - 24 * HOUR);

  let i = 0;
  while (i < recent.length) {
    const p = recent[i]!;
    if (p.kind !== "package") {
      i++;
      continue;
    }
    // Find the first later event that shows the package gone.
    let pickupIdx = -1;
    for (let j = i + 1; j < recent.length; j++) {
      if (isPickup(recent[j]!)) {
        pickupIdx = j;
        break;
      }
    }
    const pickup = pickupIdx >= 0 ? recent[pickupIdx]! : null;

    const darkAt = zonedTimeToUtc(localDateKey(p.startMs, tz), darkMin, tz);
    const byHours = p.startMs + plan.packageHours * HOUR;
    // Delivered after dark: give a 30-minute grace rather than alerting instantly.
    const byDark = Math.max(darkAt, p.startMs + 30 * MIN);
    const triggerAt = Math.min(byHours, byDark);
    const reason = triggerAt === byHours ? "hours" : "dark";

    if (now >= triggerAt && (!pickup || pickup.startMs > triggerAt)) {
      const waited = Math.round(((pickup?.startMs ?? now) - p.startMs) / HOUR);
      out.push({
        id: `package_left_out:${p.id}`,
        rule: "package_left_out",
        severity: "attention",
        title: "A package is still on the porch",
        detail:
          reason === "dark"
            ? `Delivered at ${clockLabel(p.startMs, tz)} and still out after dark.`
            : `Delivered at ${clockLabel(p.startMs, tz)}; still out after ${Math.max(waited, plan.packageHours)} h.`,
        triggeredAt: triggerAt,
        eventIds: pickup ? [p.id, pickup.id] : [p.id],
        bestEffort: false,
        clearedAt: pickup ? pickup.startMs : null,
        clearedReason: pickup ? `Brought in around ${clockLabel(pickup.startMs, tz)}` : null,
      });
    }
    // Further package events before the pickup are the same outstanding parcel(s).
    i = pickupIdx >= 0 ? pickupIdx + 1 : recent.length;
  }
  return out;
}

function isPickup(e: RuleEvent): boolean {
  if (e.tags && e.tags.packageVisible === false) return true;
  if (e.tags && e.tags.packageVisible === true) return false;
  // Unknown: a person at the door without a description is assumed to have taken it in.
  return e.kind === "person" && (!e.tags || e.tags.packageVisible === null);
}

// ---------------------------------------------------------------------------
// Late-night door activity: person/doorbell events inside the late-night window.
// Bursts within 15 minutes are grouped into one alert.

export function lateNightActivity({ now, plan, events }: RulesInput): AlertCandidate[] {
  const tz = plan.timeZone;
  const start = parseHHMM(plan.lateNightStart);
  const end = parseHHMM(plan.lateNightEnd);
  const hits = events.filter(
    (e) =>
      e.startMs >= now - 24 * HOUR &&
      PERSON_KINDS.has(e.kind) &&
      inWrappingWindow(minutesOfDay(e.startMs, tz), start, end),
  );
  const out: AlertCandidate[] = [];
  let cluster: RuleEvent[] = [];
  const flush = () => {
    if (!cluster.length) return;
    const first = cluster[0]!;
    const dings = cluster.filter((e) => e.kind === "ding").length;
    out.push({
      id: `late_night:${first.id}`,
      rule: "late_night_activity",
      severity: "urgent",
      title: dings ? "Someone rang the doorbell late at night" : "Someone was at the door late at night",
      detail: `${cluster.length === 1 ? "Activity" : `${cluster.length} events`} at the front door from ${clockLabel(first.startMs, tz)}${
        cluster.length > 1 ? ` to ${clockLabel(cluster[cluster.length - 1]!.startMs, tz)}` : ""
      }.`,
      triggeredAt: first.startMs,
      eventIds: cluster.map((e) => e.id),
      bestEffort: false,
      clearedAt: null,
      clearedReason: null,
    });
    cluster = [];
  };
  for (const e of hits) {
    const last = cluster[cluster.length - 1];
    if (last && e.startMs - last.startMs > 15 * MIN) flush();
    cluster.push(e);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------------------
// Unanswered doorbell (best-effort heuristic): a ding, then nothing suggesting the door was
// opened within the answer window. Signals of "answered": the model saw the door open, or two
// or more people together. Repeated dings inside one window are one visit.

export function unansweredDoorbell({ now, plan, events }: RulesInput): AlertCandidate[] {
  const tz = plan.timeZone;
  const windowMs = plan.doorbellAnswerMinutes * MIN;
  const recent = events.filter((e) => e.startMs >= now - 24 * HOUR);
  const out: AlertCandidate[] = [];

  let i = 0;
  while (i < recent.length) {
    const d = recent[i]!;
    if (d.kind !== "ding") {
      i++;
      continue;
    }
    // Extend the visit while further dings arrive inside the window.
    let lastDing = d;
    let j = i + 1;
    const dings = [d];
    while (j < recent.length && recent[j]!.startMs <= lastDing.startMs + windowMs) {
      if (recent[j]!.kind === "ding") {
        lastDing = recent[j]!;
        dings.push(lastDing);
      }
      j++;
    }
    const windowEnd = lastDing.startMs + windowMs;
    const inWindow = recent.filter((e) => e.startMs >= d.startMs && e.startMs <= windowEnd);
    const answered = inWindow.some((e) => e.tags?.doorOpen === true || (e.tags?.people ?? 0) >= 2);

    if (now >= windowEnd && !answered) {
      out.push({
        id: `unanswered_doorbell:${d.id}`,
        rule: "unanswered_doorbell",
        severity: "attention",
        title: "The doorbell may have gone unanswered",
        detail: `${dings.length > 1 ? `Rang ${dings.length} times` : "Rang"} at ${clockLabel(d.startMs, tz)}; we didn't see the door open within ${plan.doorbellAnswerMinutes} minutes.`,
        triggeredAt: windowEnd,
        eventIds: dings.map((e) => e.id),
        bestEffort: true,
        clearedAt: null,
        clearedReason: null,
      });
    }
    i = j;
  }
  return out;
}
