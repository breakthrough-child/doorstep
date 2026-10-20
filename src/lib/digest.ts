// Daily digest: gather the day's facts, ask Bedrock for a warm summary, cache per (origin, day).
import { writeDigest, type DigestFacts } from "./bedrock";
import { bedrockMock } from "./config";
import { db } from "./db";
import * as store from "./store";
import { clockLabel, localDateKey, parseHHMM, weekdayOf, zonedTimeToUtc } from "./time";
import type { CarePlan, EventOrigin } from "./types";

export interface Digest {
  id: string;
  origin: EventOrigin;
  dateKey: string;
  headline: string;
  summary: string;
  highlights: string[];
  model: string;
  mock: boolean;
  createdAt: number;
}

type Row = {
  id: string;
  origin: EventOrigin;
  date_key: string;
  headline: string;
  summary: string;
  highlights: string;
  model: string;
  mock: number;
  created_at: number;
};

const toDigest = (r: Row): Digest => ({
  id: r.id,
  origin: r.origin,
  dateKey: r.date_key,
  headline: r.headline,
  summary: r.summary,
  highlights: JSON.parse(r.highlights) as string[],
  model: r.model,
  mock: !!r.mock,
  createdAt: r.created_at,
});

export function listDigests(origin: EventOrigin): Digest[] {
  return (db().prepare("SELECT * FROM digests WHERE origin = ? ORDER BY date_key DESC").all(origin) as Row[]).map(toDigest);
}

export function getDigest(origin: EventOrigin, dateKey: string): Digest | null {
  const r = db().prepare("SELECT * FROM digests WHERE id = ?").get(`${origin}:${dateKey}`) as Row | undefined;
  return r ? toDigest(r) : null;
}

export function dayFacts(origin: EventOrigin, plan: CarePlan, now: number): DigestFacts {
  const tz = plan.timeZone;
  const dateKey = localDateKey(now, tz);
  const from = zonedTimeToUtc(dateKey, 0, tz);
  const items = store.timeline(origin, from, now).filter((e) => e.kind !== "on_demand");
  const alerts = store.listAlerts(origin, from, now);
  const weekday = weekdayOf(dateKey);
  const people = items.filter((e) => e.kind === "person" || e.kind === "ding");
  return {
    parentName: plan.parentName,
    dateLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(now),
    events: items.map((e) => ({
      time: clockLabel(e.startMs, tz),
      kind: e.kind,
      sentence: e.description?.sentence ?? `${e.kind} event`,
    })),
    alerts: alerts.map((a) => ({
      title: a.title,
      detail: a.detail,
      status: a.status,
      cleared: a.clearedReason,
    })),
    scheduledVisits: plan.visitors
      .filter((v) => v.days.includes(weekday))
      .filter((v) => zonedTimeToUtc(dateKey, parseHHMM(v.windowEnd), tz) <= now)
      .map((v) => {
        const ws = zonedTimeToUtc(dateKey, parseHHMM(v.windowStart), tz) - plan.visitGraceMinutes * 60_000;
        const we = zonedTimeToUtc(dateKey, parseHHMM(v.windowEnd), tz) + plan.visitGraceMinutes * 60_000;
        return {
          name: v.name,
          window: `${v.windowStart}–${v.windowEnd}`,
          seen: people.some((e) => e.startMs >= ws && e.startMs <= we),
        };
      }),
  };
}

export async function generateDigest(origin: EventOrigin, plan: CarePlan, now: number): Promise<Digest> {
  const dateKey = localDateKey(now, plan.timeZone);
  const facts = dayFacts(origin, plan, now);
  const { digest, usage } = await writeDigest(facts, bedrockMock());
  store.logBedrockUsage({ purpose: "digest", ref: `${origin}:${dateKey}`, ...usage });
  const row: Digest = {
    id: `${origin}:${dateKey}`,
    origin,
    dateKey,
    headline: digest.headline,
    summary: digest.summary,
    highlights: digest.highlights,
    model: usage.model,
    mock: usage.mock,
    createdAt: Date.now(),
  };
  db()
    .prepare(
      `INSERT OR REPLACE INTO digests (id, origin, date_key, headline, summary, highlights, model, mock, input_tokens, output_tokens, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(row.id, origin, dateKey, row.headline, row.summary, JSON.stringify(row.highlights), row.model, row.mock ? 1 : 0, usage.inputTokens, usage.outputTokens, row.createdAt);
  return row;
}
