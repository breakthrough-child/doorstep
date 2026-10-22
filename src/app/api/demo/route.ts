import { NextResponse } from "next/server";
import { z } from "zod";
import { resetBedrockHealth } from "@/lib/bedrock/health";
import { DEFAULT_PLAN, DEFAULT_VISITORS, replaceVisitors, setDataMode } from "@/lib/config";
import { db, setSetting } from "@/lib/db";
import { SCENARIO_IDS } from "@/lib/data/scenarios";
import { forceLivePoll, reloadReplay, startScenario, stopScenario, tick, updateScenario } from "@/lib/pipeline";
import { clearOrigin, recentApiLog } from "@/lib/store";
import { buildState, scenarioCatalog } from "@/lib/view";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ scenarios: scenarioCatalog(), apiLog: recentApiLog(20), state: buildState() });
}

const action = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mode"), mode: z.enum(["LIVE", "REPLAY", "SCENARIO"]) }),
  z.object({ action: z.literal("start"), scenarioId: z.enum(SCENARIO_IDS), speed: z.number().min(1).max(3600) }),
  z.object({ action: z.literal("speed"), speed: z.number().min(1).max(3600) }),
  z.object({ action: z.literal("pause") }),
  z.object({ action: z.literal("resume") }),
  z.object({ action: z.literal("skip"), minutes: z.number().min(1).max(24 * 60) }),
  z.object({ action: z.literal("stop") }),
  z.object({ action: z.literal("reset") }),
  z.object({ action: z.literal("reload-replay") }),
  z.object({ action: z.literal("poll-live") }),
  z.object({ action: z.literal("retry-bedrock") }),
  z.object({ action: z.literal("reset-recording") }),
]);

export async function POST(req: Request) {
  const parsed = action.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown demo action" }, { status: 400 });
  const a = parsed.data;
  switch (a.action) {
    case "mode":
      setDataMode(a.mode);
      if (a.mode === "REPLAY") reloadReplay();
      if (a.mode === "LIVE") forceLivePoll();
      break;
    case "start":
      setDataMode("SCENARIO");
      startScenario(a.scenarioId, a.speed);
      break;
    case "speed":
      updateScenario({ speed: a.speed });
      break;
    case "pause":
      updateScenario({ playing: false });
      break;
    case "resume":
      updateScenario({ playing: true });
      break;
    case "skip": {
      const s = updateScenario({});
      if (s) updateScenario({ simMs: s.simMs + a.minutes * 60_000, playing: true });
      break;
    }
    case "stop":
      stopScenario();
      break;
    case "reset":
      stopScenario();
      clearOrigin("replay");
      clearOrigin("live");
      db().prepare("DELETE FROM api_log").run();
      reloadReplay();
      break;
    case "reload-replay":
      reloadReplay();
      break;
    case "poll-live":
      forceLivePoll();
      break;
    case "retry-bedrock":
      resetBedrockHealth();
      break;
    case "reset-recording":
      // Known starting state for a take: default care plan and contacts, onboarded, SCENARIO mode
      // with nothing playing, replay data reloaded, no alerts/actions/digests, Bedrock re-probed.
      stopScenario();
      clearOrigin("replay");
      clearOrigin("live");
      db().prepare("DELETE FROM api_log").run();
      setSetting("care_plan", DEFAULT_PLAN);
      replaceVisitors(DEFAULT_VISITORS);
      setSetting("onboarded", true);
      setDataMode("SCENARIO");
      reloadReplay();
      resetBedrockHealth();
      break;
  }
  await tick();
  return NextResponse.json({ ok: true, state: buildState() });
}
