import { NextResponse } from "next/server";
import { isPublicDemo } from "@/lib/config";

const DISABLED = () => NextResponse.json({ error: "Disabled in the public demo." }, { status: 403 });
import { z } from "zod";
import { markRingTokenExpired, setRingToken } from "@/lib/config";
import { RingApiError, RingClient, RingTokenExpiredError } from "@/lib/ring/client";
import { forceLivePoll } from "@/lib/pipeline";
import { logApi, upsertDevices } from "@/lib/store";

const body = z.object({ token: z.string().trim().min(20).max(8192) });

/** Paste a Playground token: verify it against GET /v1/devices, then store it server-side. */
export async function POST(req: Request) {
  if (isPublicDemo()) return DISABLED();
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "That doesn't look like a Ring access token." }, { status: 400 });
  try {
    const client = new RingClient({ token: parsed.data.token, onRequest: (r) => logApi(r.method, r.path, r.status, r.ms) });
    const devices = await client.listDevices();
    setRingToken(parsed.data.token);
    upsertDevices(devices, "live");
    markRingTokenExpired(false);
    forceLivePoll();
    return NextResponse.json({ ok: true, devices });
  } catch (e) {
    if (e instanceof RingTokenExpiredError)
      return NextResponse.json({ error: "Ring rejected this token (401). Playground tokens last about 30 minutes — generate a fresh one." }, { status: 401 });
    const msg = e instanceof RingApiError ? `Ring API error ${e.status}: ${e.message}` : e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export async function DELETE() {
  if (isPublicDemo()) return DISABLED();
  setRingToken(null);
  return NextResponse.json({ ok: true });
}
