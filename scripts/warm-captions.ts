// Pre-caption every recorded (REPLAY) and example (SCENARIO) event with real Bedrock, so the demo
// shows Nova Lite captions instantly. Captions are cached by event id; already-real ones are skipped.
// Usage: npm run warm:captions
import "./env";
import fs from "node:fs";
import path from "node:path";
import { describeSnapshot, BEDROCK_MODEL_ID } from "../src/lib/bedrock";
import { recordBedrockSuccess } from "../src/lib/bedrock/health";
import { getCarePlan } from "../src/lib/config";
import { listScenarios, materialize, scenarioImagePath } from "../src/lib/data/scenarios";
import { loadReplay } from "../src/lib/data/replay";
import { descriptionsFor, logBedrockUsage, saveDescription } from "../src/lib/store";
import { clockLabel, localDateKey } from "../src/lib/time";
import type { DescriptionTags, DoorEvent } from "../src/lib/types";

type Job = { event: DoorEvent; image: string; hintTags?: Partial<DescriptionTags> };

async function main() {
  const plan = getCarePlan();
  const today = localDateKey(Date.now(), plan.timeZone);
  const jobs: Job[] = [];
  for (const s of listScenarios())
    for (const m of materialize(s, today, plan.timeZone, "warm")) jobs.push({ event: m.event, image: scenarioImagePath(m.image), hintTags: m.hint.tags });
  for (const e of loadReplay(Date.now()).events) if (e.snapshotPath) jobs.push({ event: e, image: e.snapshotPath });

  const existing = descriptionsFor(jobs.map((j) => j.event.id));
  // --refresh re-captions example (scenario) events too, e.g. after new stock photos replaced illustrations.
  const refresh = process.argv.includes("--refresh");
  const todo = jobs.filter((j) => existing.get(j.event.id)?.mock !== false || (refresh && j.event.origin === "simulated"));
  console.log(`${jobs.length} events, ${todo.length} need a real caption (model ${BEDROCK_MODEL_ID})`);
  let ok = 0, fail = 0, tin = 0, tout = 0;
  const queue = [...todo];
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      for (let j = queue.shift(); j; j = queue.shift()) {
        const abs = path.resolve(j.image);
        try {
          const r = await describeSnapshot(
            { eventId: j.event.id, kind: j.event.kind, timeLabel: clockLabel(j.event.startMs, plan.timeZone), image: { bytes: fs.readFileSync(abs), format: "jpeg" } },
            false,
          );
          const tags = j.hintTags ? { ...r.tags, ...j.hintTags } : r.tags;
          saveDescription({ eventId: j.event.id, sentence: r.sentence, tags, model: r.usage.model, mock: false, inputTokens: r.usage.inputTokens, outputTokens: r.usage.outputTokens, createdAt: Date.now() });
          logBedrockUsage({ purpose: "describe", ref: j.event.id, ...r.usage });
          recordBedrockSuccess();
          ok++; tin += r.usage.inputTokens; tout += r.usage.outputTokens;
          console.log(`  ✓ ${j.event.id.slice(0, 40)} — ${r.sentence}`);
        } catch (e) {
          fail++;
          console.log(`  ✗ ${j.event.id.slice(0, 40)} — ${e instanceof Error ? `${e.name}: ${e.message}` : e}`);
        }
      }
    }),
  );
  console.log(`\nDone: ${ok} captioned, ${fail} failed · ${tin} input / ${tout} output tokens`);
}
main();
