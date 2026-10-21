// One-time setup: create the SQLite database, seed the default care plan and load REPLAY fixtures.
import "./env";
// Safe to re-run; pass --reset to wipe ./data first.
import fs from "node:fs";
import { DATA_DIR, db, getSetting, setSetting } from "../src/lib/db";
import { DEFAULT_PLAN, DEFAULT_VISITORS, getCarePlan, listVisitors, replaceVisitors } from "../src/lib/config";
import { loadReplay, fixtureDir } from "../src/lib/data/replay";
import { clearOrigin, insertEvents, upsertDevices } from "../src/lib/store";
import { localDateKey, startOfLocalDay } from "../src/lib/time";

if (process.argv.includes("--reset") && fs.existsSync(DATA_DIR)) {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  console.log("• Removed ./data");
}

db();
console.log("• Database ready at data/doorstep.db");

if (!getSetting("care_plan", null)) {
  setSetting("care_plan", DEFAULT_PLAN);
  console.log(`• Default care plan: ${DEFAULT_PLAN.parentName}, ${DEFAULT_PLAN.timeZone}`);
}
if (!listVisitors().length) {
  replaceVisitors(DEFAULT_VISITORS);
  console.log(`• Default visitors: ${DEFAULT_VISITORS.map((v) => v.name).join(", ")}`);
}

const replay = loadReplay(Date.now(), undefined, startOfLocalDay(Date.now(), getCarePlan().timeZone));
clearOrigin("replay");
upsertDevices(replay.devices, "replay");
const n = insertEvents(replay.events);
setSetting("replay_meta", replay.meta);
setSetting("replay_loaded_for", localDateKey(Date.now(), DEFAULT_PLAN.timeZone));
console.log(
  `• Loaded ${n} replay events from ${fixtureDir().replace(process.cwd() + "/", "")}${replay.meta.synthetic ? " (hand-written fixtures)" : ` (recorded from the Ring Developer Playground ${new Date(replay.meta.recordedAt).toISOString().slice(0, 16).replace("T", " ")} UTC)`}`,
);
console.log("\nDone. Next: npm run dev → http://localhost:3000");
