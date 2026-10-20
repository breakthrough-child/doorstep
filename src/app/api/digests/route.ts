import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/config";
import { generateDigest, listDigests } from "@/lib/digest";
import { currentNow, effectivePlan, ORIGIN_FOR_MODE } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET() {
  const mode = getDataMode();
  return NextResponse.json({ mode, digests: listDigests(ORIGIN_FOR_MODE[mode]) });
}

/** Write (or rewrite) today's digest with Bedrock. */
export async function POST() {
  const mode = getDataMode();
  try {
    const digest = await generateDigest(ORIGIN_FOR_MODE[mode], effectivePlan(mode), currentNow(mode));
    return NextResponse.json({ digest });
  } catch (e) {
    return NextResponse.json({ error: `Couldn't write the digest: ${e instanceof Error ? e.message : e}` }, { status: 502 });
  }
}
