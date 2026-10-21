// Record real Ring Developer Playground responses into fixtures/playground for REPLAY mode.
import "./env";
// Captures device discovery, event history pages and one snapshot per event, plus a request log.
// The token is never written to disk; output is scanned for it before saving.
//
// Usage: RING_ACCESS_TOKEN=... npm run record          (or: npm run record -- --token <token>)
//        options: --max-events 30  --max-pages 5  --out fixtures/playground

import fs from "node:fs";
import path from "node:path";
import { RingApiError, RingClient, RingTokenExpiredError } from "../src/lib/ring/client";
import { normalizeHistoryEvents } from "../src/lib/ring/normalize";
import { tokenIssuedAtMs } from "../src/lib/ring/token";
import type { Document } from "../src/lib/ring/jsonapi";

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

function tokenFromEnvFile(): string | undefined {
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const m = /^RING_ACCESS_TOKEN=(.+)$/m.exec(fs.readFileSync(f, "utf8"));
    if (m?.[1]?.trim()) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const token = arg("token") ?? process.env.RING_ACCESS_TOKEN ?? tokenFromEnvFile();
if (!token) {
  console.error("No token. Generate one in the Ring Developer Playground and pass --token or set RING_ACCESS_TOKEN.");
  process.exit(1);
}
const outDir = path.resolve(arg("out", "fixtures/playground")!);
const maxEvents = Number(arg("max-events", "30"));
const maxPages = Number(arg("max-pages", "5"));

const log: Array<{ method: string; path: string; status: number; ms: number; note?: string }> = [];
const client = new RingClient({ token, onRequest: (r) => log.push(r) });

function save(rel: string, data: unknown) {
  const text = JSON.stringify(data, null, 2);
  if (text.includes(token!)) throw new Error(`Refusing to write ${rel}: it contains the access token`);
  fs.mkdirSync(path.dirname(path.join(outDir, rel)), { recursive: true });
  fs.writeFileSync(path.join(outDir, rel), text + "\n");
}

async function main() {
  console.log("→ GET /v1/devices?include=status,capabilities,configurations");
  const devicesDoc = await client.getDevicesRaw();
  const deviceList = Array.isArray(devicesDoc.data) ? devicesDoc.data : devicesDoc.data ? [devicesDoc.data] : [];
  console.log(`  ${deviceList.length} device(s): ${deviceList.map((d) => `${d.attributes?.name ?? "?"} (${d.id})`).join(", ")}`);

  fs.rmSync(outDir, { recursive: true, force: true });
  save("devices.json", devicesDoc);

  const history: Array<{ deviceId: string; pages: string[] }> = [];
  const snapshots: Record<string, string | null> = {};
  const snapshotErrors: Record<string, string> = {};
  const notes: string[] = [];

  for (const [di, d] of deviceList.entries()) {
    const pages: string[] = [];
    let pageKey: string | null = null;
    const events: ReturnType<typeof normalizeHistoryEvents> = [];
    for (let p = 0; p < maxPages; p++) {
      let doc: Document;
      try {
        doc = await client.getEventHistoryPage(d.id, { pageKey });
      } catch (e) {
        if (e instanceof RingTokenExpiredError) throw e;
        const msg = e instanceof Error ? e.message : String(e);
        notes.push(`history ${d.id} page ${p}: ${msg}`);
        console.warn(`  ! history page ${p}: ${msg}`);
        break;
      }
      const rel = `history-${di}-${p}.json`;
      save(rel, doc);
      pages.push(rel);
      events.push(...normalizeHistoryEvents(doc as never, d.id, "replay"));
      const next = doc.links?.next ? new URL(doc.links.next, "https://x").searchParams.get("page[key]") : null;
      console.log(`  history page ${p}: ${Array.isArray(doc.data) ? doc.data.length : 0} event(s)${next ? " (more)" : ""}`);
      if (!next) break;
      pageKey = next;
    }
    history.push({ deviceId: d.id, pages });

    const kinds = events.reduce<Record<string, number>>((m, e) => ((m[`${e.rawType}/${e.rawSubType ?? "-"}`] = (m[`${e.rawType}/${e.rawSubType ?? "-"}`] ?? 0) + 1), m), {});
    console.log(`  event types seen: ${JSON.stringify(kinds)}`);
    notes.push(`event types for ${d.id}: ${JSON.stringify(kinds)}`);

    for (const e of events.slice(0, maxEvents)) {
      try {
        const snap = await client.getSnapshot(d.id, e.startMs + 1000);
        const rel = `snapshots/${e.id.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 100)}.jpg`;
        fs.mkdirSync(path.join(outDir, "snapshots"), { recursive: true });
        fs.writeFileSync(path.join(outDir, rel), snap.bytes);
        snapshots[e.id] = rel;
        console.log(`  snapshot ${e.id}: ${snap.bytes.length} bytes origin=${snap.mediaOrigin ?? "?"}`);
      } catch (err) {
        if (err instanceof RingTokenExpiredError) throw err;
        const msg = err instanceof RingApiError ? `${err.status} ${err.code ?? ""} ${err.message}` : String(err);
        snapshots[e.id] = null;
        snapshotErrors[e.id] = msg;
        console.warn(`  ! snapshot ${e.id}: ${msg}`);
      }
    }
  }

  save("manifest.json", {
    recordedAt: Date.now(),
    // Where the API's authorized window starts (token issue time for Playground JWTs, F-09).
    coverageStartMs: tokenIssuedAtMs(token!) ?? null,
    synthetic: false,
    source: "Recorded from the Ring Developer Playground via scripts/record-fixtures.ts (token stripped).",
    devices: "devices.json",
    history,
    snapshots,
    snapshotErrors,
    notes,
  });
  save("recording-log.json", log);
  const ok = Object.values(snapshots).filter(Boolean).length;
  console.log(`\n✓ Recorded ${deviceList.length} device(s), ${Object.keys(snapshots).length} event(s), ${ok} snapshot(s) → ${path.relative(process.cwd(), outDir)}`);
  console.log("  Run `npm run setup` (or switch to REPLAY in /demo) to load them.");
}

main().catch((e) => {
  if (e instanceof RingTokenExpiredError) console.error("✗ Token rejected (401). Playground tokens last ~30 minutes — generate a new one.");
  else console.error("✗", e instanceof Error ? e.message : e);
  console.error("Request log:", JSON.stringify(log, null, 1));
  process.exit(1);
});
