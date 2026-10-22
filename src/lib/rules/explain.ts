// Plain-language "why this alert fired", referencing the family's own care plan. Pure.
import type { Alert, CarePlan, DoorEvent } from "../types";
import { clockLabel, formatHHMM, parseHHMM } from "../time";

const KIND_WORD: Record<string, string> = {
  ding: "Doorbell",
  person: "Someone at the door",
  package: "Package",
  vehicle: "Vehicle",
  motion: "Movement",
  animal: "Animal",
  on_demand: "Live view",
};

const DAY_NAMES = ["Sundays", "Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays"];

/** The rule's subject from a stored alert id (`origin:rule:subject:…`). */
function subjectOf(alert: Pick<Alert, "id" | "rule">): string | null {
  const parts = alert.id.split(":");
  const i = parts.indexOf(alert.rule === "late_night_activity" ? "late_night" : alert.rule);
  return i >= 0 ? (parts[i + 1] ?? null) : null;
}

export function explainAlert(
  alert: Pick<Alert, "id" | "rule" | "triggeredAt" | "eventIds">,
  plan: CarePlan,
  events: Array<Pick<DoorEvent, "id" | "kind" | "startMs">>,
): string {
  const tz = plan.timeZone;
  const name = plan.parentName;
  const first = events.find((e) => e.id === alert.eventIds[0]);
  const at = (ms: number) => clockLabel(ms, tz);

  switch (alert.rule) {
    case "late_night_activity": {
      const what = first ? `${KIND_WORD[first.kind] ?? "Door activity"} at ${at(first.startMs)}` : "Door activity";
      return `${what} — outside ${name}'s usual hours (${plan.lateNightEnd}–${plan.lateNightStart}). Your care plan flags anyone at the door between ${plan.lateNightStart} and ${plan.lateNightEnd}.`;
    }
    case "quiet_morning": {
      const from = formatHHMM(Math.min(parseHHMM(plan.lateNightEnd), parseHHMM(plan.quietMorningBy)));
      return `No door activity at all between ${from} and ${plan.quietMorningBy}. Your care plan expects to see ${name} or a visitor by ${plan.quietMorningBy}.`;
    }
    case "missed_visit": {
      const v = plan.visitors.find((x) => x.id === subjectOf(alert));
      if (!v) return "A scheduled visit window passed without anyone coming to the door.";
      const g = plan.visitGraceMinutes;
      const days =
        v.days.length === 7 ? "every day" : `on ${v.days.map((d) => DAY_NAMES[d]).join(", ")}`;
      const from = formatHHMM(parseHHMM(v.windowStart) - g);
      const to = formatHHMM(parseHHMM(v.windowEnd) + g);
      return `${v.name} is scheduled ${v.windowStart}–${v.windowEnd} ${days}. Nobody came to the door between ${from} and ${to} (your ${g}-minute grace).`;
    }
    case "package_left_out": {
      const t = first ? at(first.startMs) : "earlier";
      return `A package was delivered at ${t} and nobody has been seen bringing it in. Your care plan flags packages left out for ${plan.packageHours} h, or still out after dark (${plan.darkAt}).`;
    }
    case "unanswered_doorbell": {
      const t = first ? at(first.startMs) : "earlier";
      return `The doorbell rang at ${t} and the camera didn't see the door open within ${plan.doorbellAnswerMinutes} minutes (your care plan setting). This is a best-effort guess: the camera can't always see the door.`;
    }
  }
}
