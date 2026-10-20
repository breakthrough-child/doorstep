import { NextResponse } from "next/server";
import { tick } from "@/lib/pipeline";
import { buildState } from "@/lib/view";

export const dynamic = "force-dynamic";

/**
 * Feed for the Fire TV visual doorbell. "atDoor" is the most recent person/doorbell/package event
 * that reached Doorstep in the last 60 real seconds, with its AI description. Real time matters
 * here: at 60x a scenario minute lasts one second.
 */
export async function GET() {
  await tick();
  const s = buildState();
  const recent = s.timeline.find((e) => {
    if (e.kind !== "ding" && e.kind !== "person" && e.kind !== "package") return false;
    if (Date.now() - e.receivedAt > 60_000) return false;
    // Skip backfilled events: a scenario's pre-loaded morning, or a replay batch load.
    return s.mode === "SCENARIO" ? e.startMs >= (s.scenario?.startMs ?? 0) : s.now - e.startMs <= 5 * 60_000;
  });

  return NextResponse.json(
    {
      parentName: s.parentName,
      mode: s.mode,
      now: s.now,
      nowLabel: s.nowLabel,
      dateLabel: s.dateLabel,
      status: s.status,
      atDoor: recent
        ? { id: recent.id, kind: recent.kind, time: recent.time, sentence: recent.sentence, simulated: recent.origin === "simulated", snapshotUrl: recent.hasSnapshot ? `/api/snapshots/${encodeURIComponent(recent.id)}` : null }
        : null,
    },
    { headers: { "Access-Control-Allow-Origin": "*" } },
  );
}
