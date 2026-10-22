// Export cached real Bedrock captions for recorded and example events to fixtures/captions.json,
// so a fresh clone (or the public demo) shows real Nova Lite output without calling AWS.
// Usage: npm run export:captions
import fs from "node:fs";
import { db } from "../src/lib/db";

type Row = { event_id: string; sentence: string; tags: string; model: string; input_tokens: number; output_tokens: number; created_at: number };
const rows = db()
  .prepare("SELECT * FROM descriptions WHERE mock = 0 AND (event_id LIKE 'sim:%' OR event_id LIKE 'rp:%') ORDER BY event_id")
  .all() as Row[];
const out = rows.map((r) => ({
  eventId: r.event_id,
  sentence: r.sentence,
  tags: JSON.parse(r.tags),
  model: r.model,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  createdAt: r.created_at,
}));
fs.writeFileSync("fixtures/captions.json", JSON.stringify({ note: "Real Amazon Bedrock (Nova Lite) captions, recorded Oct 22, 2026. Imported by npm run setup.", captions: out }, null, 2) + "\n");
console.log(`Exported ${out.length} real captions to fixtures/captions.json`);
