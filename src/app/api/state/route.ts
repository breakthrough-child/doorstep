import { NextResponse } from "next/server";
import { tick } from "@/lib/pipeline";
import { buildState } from "@/lib/view";

export const dynamic = "force-dynamic";

/** Everything the family-facing screens render. Also nudges the pipeline (works without the poller). */
export async function GET() {
  const t = await tick();
  return NextResponse.json({ ...buildState(), tickError: t.error });
}
