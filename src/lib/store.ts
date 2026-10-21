// Typed data access over SQLite.
import { db } from "./db";
import type { Device } from "./ring/normalize";
import type {
  Alert,
  AlertCandidate,
  AlertStatus,
  DescriptionTags,
  DoorEvent,
  EventDescription,
  EventOrigin,
} from "./types";

export interface StoredEvent extends DoorEvent {
  snapshotPath: string | null;
  snapshotStatus: "pending" | "ok" | "missing" | "error";
  snapshotNote: string | null;
  createdAt: number;
}

export interface TimelineItem extends StoredEvent {
  description: EventDescription | null;
}

type EventRow = {
  id: string;
  device_id: string;
  kind: DoorEvent["kind"];
  start_ms: number;
  end_ms: number | null;
  origin: EventOrigin;
  raw_type: string;
  raw_sub_type: string | null;
  scenario_id: string | null;
  snapshot_path: string | null;
  snapshot_status: StoredEvent["snapshotStatus"];
  snapshot_note: string | null;
  created_at: number;
};

function toEvent(r: EventRow): StoredEvent {
  return {
    id: r.id,
    deviceId: r.device_id,
    kind: r.kind,
    startMs: r.start_ms,
    endMs: r.end_ms,
    origin: r.origin,
    rawType: r.raw_type,
    rawSubType: r.raw_sub_type,
    scenarioId: r.scenario_id,
    snapshotPath: r.snapshot_path,
    snapshotStatus: r.snapshot_status,
    snapshotNote: r.snapshot_note,
    createdAt: r.created_at,
  };
}

export function upsertDevices(devices: Device[], origin: EventOrigin): void {
  const stmt = db().prepare(
    `INSERT INTO devices (id, origin, name, image_url, online, info, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id, origin) DO UPDATE SET name = excluded.name, image_url = excluded.image_url,
       online = excluded.online, info = excluded.info, updated_at = excluded.updated_at`,
  );
  const now = Date.now();
  db().transaction(() => {
    for (const d of devices)
      stmt.run(d.id, origin, d.name, d.imageUrl, d.online === null ? null : d.online ? 1 : 0, JSON.stringify(d), now);
  })();
}

export function listDevices(origin: EventOrigin): Device[] {
  const rows = db().prepare("SELECT info FROM devices WHERE origin = ? ORDER BY name").all(origin) as Array<{ info: string }>;
  return rows.map((r) => JSON.parse(r.info) as Device);
}

/** Insert events that aren't stored yet. Returns the number inserted. */
export function insertEvents(
  events: Array<DoorEvent & { snapshotPath?: string | null; snapshotStatus?: StoredEvent["snapshotStatus"] }>,
): number {
  const stmt = db().prepare(
    `INSERT OR IGNORE INTO events (id, device_id, kind, start_ms, end_ms, origin, raw_type, raw_sub_type, scenario_id,
       snapshot_path, snapshot_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  let n = 0;
  const now = Date.now();
  db().transaction(() => {
    for (const e of events) {
      n += stmt.run(
        e.id,
        e.deviceId,
        e.kind,
        e.startMs,
        e.endMs,
        e.origin,
        e.rawType,
        e.rawSubType,
        e.scenarioId ?? null,
        e.snapshotPath ?? null,
        e.snapshotStatus ?? "pending",
        now,
      ).changes;
    }
  })();
  return n;
}

export function setSnapshot(eventId: string, status: StoredEvent["snapshotStatus"], snapshotPath: string | null, note: string | null): void {
  db()
    .prepare("UPDATE events SET snapshot_status = ?, snapshot_path = ?, snapshot_note = ? WHERE id = ?")
    .run(status, snapshotPath, note, eventId);
}

export function getEvent(id: string): StoredEvent | null {
  const r = db().prepare("SELECT * FROM events WHERE id = ?").get(id) as EventRow | undefined;
  return r ? toEvent(r) : null;
}

export function eventsInRange(origin: EventOrigin, fromMs: number, toMs: number): StoredEvent[] {
  const rows = db()
    .prepare("SELECT * FROM events WHERE origin = ? AND start_ms >= ? AND start_ms <= ? ORDER BY start_ms")
    .all(origin, fromMs, toMs) as EventRow[];
  return rows.map(toEvent);
}

export function eventsNeedingSnapshot(origin: EventOrigin, limit: number): StoredEvent[] {
  const rows = db()
    .prepare("SELECT * FROM events WHERE origin = ? AND snapshot_status = 'pending' ORDER BY start_ms DESC LIMIT ?")
    .all(origin, limit) as EventRow[];
  return rows.map(toEvent);
}

export function eventsNeedingDescription(origin: EventOrigin, upToMs: number, limit: number): StoredEvent[] {
  const rows = db()
    .prepare(
      `SELECT e.* FROM events e LEFT JOIN descriptions d ON d.event_id = e.id
       WHERE e.origin = ? AND e.start_ms <= ? AND d.event_id IS NULL AND e.snapshot_status != 'pending'
       ORDER BY e.start_ms LIMIT ?`,
    )
    .all(origin, upToMs, limit) as EventRow[];
  return rows.map(toEvent);
}

/** Events whose cached description came from a given model (used to upgrade sample captions). */
export function eventsWithModel(origin: EventOrigin, model: string, limit: number): StoredEvent[] {
  const rows = db()
    .prepare(
      `SELECT e.* FROM events e JOIN descriptions d ON d.event_id = e.id
       WHERE e.origin = ? AND d.model = ? ORDER BY e.start_ms DESC LIMIT ?`,
    )
    .all(origin, model, limit) as EventRow[];
  return rows.map(toEvent);
}

type DescRow = {
  event_id: string;
  sentence: string;
  tags: string;
  model: string;
  mock: number;
  input_tokens: number;
  output_tokens: number;
  created_at: number;
};

function toDesc(r: DescRow): EventDescription {
  return {
    eventId: r.event_id,
    sentence: r.sentence,
    tags: JSON.parse(r.tags) as DescriptionTags,
    model: r.model,
    mock: !!r.mock,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    createdAt: r.created_at,
  };
}

export function saveDescription(d: EventDescription): void {
  db()
    .prepare(
      `INSERT OR REPLACE INTO descriptions (event_id, sentence, tags, model, mock, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(d.eventId, d.sentence, JSON.stringify(d.tags), d.model, d.mock ? 1 : 0, d.inputTokens, d.outputTokens, d.createdAt);
}

export function descriptionsFor(eventIds: string[]): Map<string, EventDescription> {
  const out = new Map<string, EventDescription>();
  if (!eventIds.length) return out;
  const stmt = db().prepare("SELECT * FROM descriptions WHERE event_id = ?");
  for (const id of eventIds) {
    const r = stmt.get(id) as DescRow | undefined;
    if (r) out.set(id, toDesc(r));
  }
  return out;
}

export function timeline(origin: EventOrigin, fromMs: number, toMs: number): TimelineItem[] {
  const events = eventsInRange(origin, fromMs, toMs);
  const descs = descriptionsFor(events.map((e) => e.id));
  return events.map((e) => ({ ...e, description: descs.get(e.id) ?? null }));
}

type AlertRow = {
  id: string;
  origin: EventOrigin;
  rule: Alert["rule"];
  severity: Alert["severity"];
  title: string;
  detail: string;
  triggered_at: number;
  event_ids: string;
  best_effort: number;
  cleared_at: number | null;
  cleared_reason: string | null;
  status: AlertStatus;
  updated_at: number;
};

function toAlert(r: AlertRow): Alert {
  return {
    id: r.id,
    origin: r.origin,
    rule: r.rule,
    severity: r.severity,
    title: r.title,
    detail: r.detail,
    triggeredAt: r.triggered_at,
    eventIds: JSON.parse(r.event_ids) as string[],
    bestEffort: !!r.best_effort,
    clearedAt: r.cleared_at,
    clearedReason: r.cleared_reason,
    status: r.status,
    updatedAt: r.updated_at,
  };
}

/** Upsert rule output. Keeps the family's status (acknowledged/resolved) across re-evaluations. */
export function upsertAlerts(candidates: AlertCandidate[], origin: EventOrigin): string[] {
  const conn = db();
  const existing = conn.prepare("SELECT id FROM alerts WHERE id = ?");
  const stmt = conn.prepare(
    `INSERT INTO alerts (id, origin, rule, severity, title, detail, triggered_at, event_ids, best_effort, cleared_at,
       cleared_reason, status, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)
     ON CONFLICT(id) DO UPDATE SET title = excluded.title, detail = excluded.detail, event_ids = excluded.event_ids,
       cleared_at = excluded.cleared_at, cleared_reason = excluded.cleared_reason, updated_at = excluded.updated_at
     WHERE alerts.detail != excluded.detail OR alerts.event_ids != excluded.event_ids
       OR IFNULL(alerts.cleared_at, -1) != IFNULL(excluded.cleared_at, -1)`,
  );
  const created: string[] = [];
  const now = Date.now();
  conn.transaction(() => {
    for (const rule of candidates) {
      // Rule ids are per-day/per-event; namespace by origin so replayed, live and simulated
      // days never overwrite each other's alerts.
      const c = { ...rule, id: `${origin}:${rule.id}` };
      const isNew = !existing.get(c.id);
      stmt.run(
        c.id,
        origin,
        c.rule,
        c.severity,
        c.title,
        c.detail,
        c.triggeredAt,
        JSON.stringify(c.eventIds),
        c.bestEffort ? 1 : 0,
        c.clearedAt,
        c.clearedReason,
        now,
      );
      if (isNew) created.push(c.id);
    }
  })();
  return created;
}

export function listAlerts(origin: EventOrigin, sinceMs = 0, upToMs = Number.MAX_SAFE_INTEGER): Alert[] {
  const rows = db()
    .prepare("SELECT * FROM alerts WHERE origin = ? AND triggered_at >= ? AND triggered_at <= ? ORDER BY triggered_at DESC")
    .all(origin, sinceMs, upToMs) as AlertRow[];
  return rows.map(toAlert);
}

export function setAlertStatus(id: string, status: AlertStatus): boolean {
  return db().prepare("UPDATE alerts SET status = ?, updated_at = ? WHERE id = ?").run(status, Date.now(), id).changes > 0;
}

export function logBedrockUsage(u: {
  purpose: "describe" | "digest";
  ref: string;
  model: string;
  mock: boolean;
  inputTokens: number;
  outputTokens: number;
  ms: number;
}): void {
  db()
    .prepare(
      "INSERT INTO bedrock_usage (purpose, ref, model, mock, input_tokens, output_tokens, ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .run(u.purpose, u.ref, u.model, u.mock ? 1 : 0, u.inputTokens, u.outputTokens, u.ms, Date.now());
}

export function bedrockTotals(): { calls: number; inputTokens: number; outputTokens: number } {
  const r = db()
    .prepare("SELECT COUNT(*) AS calls, IFNULL(SUM(input_tokens),0) AS i, IFNULL(SUM(output_tokens),0) AS o FROM bedrock_usage WHERE mock = 0")
    .get() as { calls: number; i: number; o: number };
  return { calls: r.calls, inputTokens: r.i, outputTokens: r.o };
}

export function logApi(method: string, path: string, status: number, ms: number, note: string | null = null): void {
  db()
    .prepare("INSERT INTO api_log (method, path, status, ms, note, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(method, path, status, ms, note, Date.now());
}

export function recentApiLog(limit = 30): Array<{ method: string; path: string; status: number; ms: number; note: string | null; created_at: number }> {
  return db().prepare("SELECT method, path, status, ms, note, created_at FROM api_log ORDER BY id DESC LIMIT ?").all(limit) as never;
}

/** Wipe everything produced by a given origin (used by /demo reset and scenario restarts). */
export function clearOrigin(origin: EventOrigin): void {
  const conn = db();
  conn.transaction(() => {
    // Descriptions are deliberately kept: they're the Bedrock cache, keyed by event id.
    conn.prepare("DELETE FROM events WHERE origin = ?").run(origin);
    conn.prepare("DELETE FROM alerts WHERE origin = ?").run(origin);
    conn.prepare("DELETE FROM digests WHERE origin = ?").run(origin);
  })();
}
