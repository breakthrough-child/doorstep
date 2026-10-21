// REPLAY mode: serve Ring Partner API responses recorded from the Developer Playground
// (scripts/record-fixtures.ts), pushed through the same JSON:API normalizer the LIVE client uses.
// Events are time-shifted so the most recent one lands just before "now", preserving spacing.

import fs from "node:fs";
import path from "node:path";
import type { Document } from "../ring/jsonapi";
import {
  normalizeDevices,
  normalizeHistoryEvents,
  type Device,
  type RingDeviceAttributes,
  type RingHistoryEventAttributes,
} from "../ring/normalize";
import type { DoorEvent } from "../types";

/** Real Ring Developer Playground recordings (npm run record) live in fixtures/playground. */
export function fixtureDir(): string {
  return path.resolve(process.cwd(), process.env.FIXTURE_DIR ?? path.join("fixtures", "playground"));
}

export interface FixtureManifest {
  recordedAt: number;
  /** Start of the recording's authorized data window (before shifting); absence rules respect it. */
  coverageStartMs?: number | null;
  /** true only for hand-written fixtures; recordings from the Playground are false. */
  synthetic: boolean;
  source: string;
  devices: string;
  history: Array<{ deviceId: string; pages: string[] }>;
  /** event id → snapshot path (relative to fixtures/) or null when Ring returned no image. */
  snapshots: Record<string, string | null>;
  snapshotErrors?: Record<string, string>;
  /** Hand-written, labelled sample captions per recorded event, used while Bedrock is unavailable. */
  sampleCaptions?: Record<string, { sentence: string; tags?: Record<string, unknown> }>;
  notes?: string[];
}

export interface ReplayMeta {
  recordedAt: number;
  synthetic: boolean;
  source: string;
  shiftMs: number;
  /** Coverage start, already time-shifted like the events. */
  coverageStartMs: number | null;
  eventCount: number;
  notes: string[];
}

export function readManifest(dir = fixtureDir()): FixtureManifest {
  return JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8")) as FixtureManifest;
}

/**
 * @param dayStartMs local midnight of "today"; when given, the recording is kept inside today
 *   (just after midnight the default "newest = now − 10 min" shift would split it across days).
 */
export function loadReplay(now: number, dir = fixtureDir(), dayStartMs?: number) {
  const manifest = readManifest(dir);
  const read = <T>(rel: string) => JSON.parse(fs.readFileSync(path.join(dir, rel), "utf8")) as T;

  const devices: Device[] = normalizeDevices(read<Document<RingDeviceAttributes>>(manifest.devices));
  const raw: DoorEvent[] = manifest.history.flatMap((h) =>
    h.pages.flatMap((p) => normalizeHistoryEvents(read<Document<RingHistoryEventAttributes>>(p), h.deviceId, "replay")),
  );
  const latest = raw.reduce((m, e) => Math.max(m, e.startMs), 0);
  const earliest = raw.reduce((m, e) => Math.min(m, e.startMs), Infinity);
  let shiftMs = latest ? now - 10 * 60_000 - latest : 0;
  if (latest && dayStartMs !== undefined && earliest + shiftMs < dayStartMs) {
    // Pull the whole recording into today, as long as nothing lands in the future.
    shiftMs = Math.min(dayStartMs + 60_000 - earliest, now - 60_000 - latest);
  }

  const events = raw.map((e) => {
    const snap = manifest.snapshots[e.id];
    return {
      ...e,
      id: `rp:${e.id}`,
      startMs: e.startMs + shiftMs,
      endMs: e.endMs === null ? null : e.endMs + shiftMs,
      snapshotPath: snap ? path.relative(process.cwd(), path.join(dir, snap)) : null,
      snapshotStatus: snap ? ("ok" as const) : ("missing" as const),
    };
  });

  const meta: ReplayMeta = {
    recordedAt: manifest.recordedAt,
    synthetic: manifest.synthetic,
    source: manifest.source,
    shiftMs,
    coverageStartMs: manifest.coverageStartMs ? manifest.coverageStartMs + shiftMs : (events.length ? Math.min(...events.map((e) => e.startMs)) : null),
    eventCount: events.length,
    notes: manifest.notes ?? [],
  };
  return { devices, events, meta };
}
