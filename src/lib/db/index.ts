// SQLite persistence (better-sqlite3). Local-first, zero setup: one file under ./data.
import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const DATA_DIR = path.resolve(ROOT, process.env.DOORSTEP_DATA_DIR ?? "data");
export const DB_PATH = path.join(DATA_DIR, "doorstep.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT NOT NULL,
  origin TEXT NOT NULL,
  name TEXT NOT NULL,
  image_url TEXT,
  online INTEGER,
  info TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, origin)
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER,
  origin TEXT NOT NULL,
  raw_type TEXT NOT NULL,
  raw_sub_type TEXT,
  scenario_id TEXT,
  snapshot_path TEXT,
  snapshot_status TEXT NOT NULL DEFAULT 'pending',
  snapshot_note TEXT,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS events_origin_start ON events (origin, start_ms);
CREATE TABLE IF NOT EXISTS descriptions (
  event_id TEXT PRIMARY KEY,
  sentence TEXT NOT NULL,
  tags TEXT NOT NULL,
  model TEXT NOT NULL,
  mock INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  rule TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  triggered_at INTEGER NOT NULL,
  event_ids TEXT NOT NULL,
  best_effort INTEGER NOT NULL,
  cleared_at INTEGER,
  cleared_reason TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS alerts_origin ON alerts (origin, triggered_at);
CREATE TABLE IF NOT EXISTS visitors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  days TEXT NOT NULL,
  window_start TEXT NOT NULL,
  window_end TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS digests (
  id TEXT PRIMARY KEY,
  origin TEXT NOT NULL,
  date_key TEXT NOT NULL,
  headline TEXT NOT NULL,
  summary TEXT NOT NULL,
  highlights TEXT NOT NULL,
  model TEXT NOT NULL,
  mock INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS bedrock_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  purpose TEXT NOT NULL,
  ref TEXT NOT NULL,
  model TEXT NOT NULL,
  mock INTEGER NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS api_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  method TEXT NOT NULL,
  path TEXT NOT NULL,
  status INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  note TEXT,
  created_at INTEGER NOT NULL
);
`;

declare global {
  // eslint-disable-next-line no-var
  var __doorstepDb: Database.Database | undefined;
}

export function db(): Database.Database {
  if (!globalThis.__doorstepDb) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const conn = new Database(DB_PATH);
    conn.pragma("journal_mode = WAL");
    conn.pragma("busy_timeout = 3000");
    conn.exec(SCHEMA);
    globalThis.__doorstepDb = conn;
  }
  return globalThis.__doorstepDb;
}

export function getSetting<T>(key: string, fallback: T): T {
  const row = db().prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(key: string, value: unknown): void {
  db()
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, JSON.stringify(value));
}

export function deleteSetting(key: string): void {
  db().prepare("DELETE FROM settings WHERE key = ?").run(key);
}
