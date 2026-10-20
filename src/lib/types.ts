// Domain types shared by the server pipeline, the rules engine and the UI.

export type DataMode = "LIVE" | "REPLAY" | "SCENARIO";

/** Doorstep's own event vocabulary, mapped from Ring event types/subtypes. */
export type EventKind = "person" | "ding" | "package" | "vehicle" | "motion" | "animal" | "on_demand";

/** Where an event came from — always shown in the UI so the demo is honest. */
export type EventOrigin = "live" | "replay" | "simulated";

export interface DoorEvent {
  id: string;
  deviceId: string;
  kind: EventKind;
  /** Epoch ms. */
  startMs: number;
  endMs: number | null;
  origin: EventOrigin;
  /** Raw Ring event_type / sub_type, kept for debugging and the friction log. */
  rawType: string;
  rawSubType: string | null;
  /** Scenario id when origin === "simulated". */
  scenarioId?: string | null;
}

/** Structured tags returned by the vision model alongside the sentence. */
export interface DescriptionTags {
  /** Number of people visible (0 if none). Never identities. */
  people: number;
  /** Is a package/parcel visible on the porch or step? null = model unsure. */
  packageVisible: boolean | null;
  /** Is the front door visibly open? null = can't tell. */
  doorOpen: boolean | null;
  vehicle: boolean;
  /** Short role guesses from appearance only, e.g. "courier", "visitor". Never names. */
  roles: string[];
}

export interface EventDescription {
  eventId: string;
  sentence: string;
  tags: DescriptionTags;
  model: string;
  mock: boolean;
  inputTokens: number;
  outputTokens: number;
  createdAt: number;
}

export interface Visitor {
  id: string;
  /** Family-entered label, e.g. "Home aide (Ngozi)". Not used for recognition. */
  name: string;
  /** 0 = Sunday … 6 = Saturday, in the parent's time zone. */
  days: number[];
  /** "HH:MM" local. */
  windowStart: string;
  windowEnd: string;
}

export interface CarePlan {
  parentName: string;
  familyName: string;
  timeZone: string;
  /** "HH:MM" — alert if no door activity by this time. */
  quietMorningBy: string;
  /** Late-night window, may wrap midnight. */
  lateNightStart: string;
  lateNightEnd: string;
  /** Hours before an unattended package triggers an alert. */
  packageHours: number;
  /** "HH:MM" — after this, a package still out is flagged ("after dark"). */
  darkAt: string;
  /** Minutes after a ding to look for someone answering. */
  doorbellAnswerMinutes: number;
  /** Minutes of slack after a visitor's window before flagging a missed visit. */
  visitGraceMinutes: number;
  visitors: Visitor[];
  /** Ring device id of the front-door camera. */
  deviceId: string | null;
}

export type AlertRule =
  | "quiet_morning"
  | "missed_visit"
  | "package_left_out"
  | "late_night_activity"
  | "unanswered_doorbell";

export type AlertSeverity = "attention" | "urgent";

/** What the pure rules engine emits. Deterministic id → idempotent upserts. */
export interface AlertCandidate {
  id: string;
  rule: AlertRule;
  severity: AlertSeverity;
  title: string;
  detail: string;
  /** Epoch ms at which the condition became true. */
  triggeredAt: number;
  eventIds: string[];
  /** Heuristic rules are labeled as such in the UI. */
  bestEffort: boolean;
  /** Set when the condition has since cleared on its own (e.g. package brought in). */
  clearedAt: number | null;
  clearedReason: string | null;
}

export type AlertStatus = "open" | "acknowledged" | "resolved";

export interface Alert extends AlertCandidate {
  status: AlertStatus;
  origin: EventOrigin;
  updatedAt: number;
}
