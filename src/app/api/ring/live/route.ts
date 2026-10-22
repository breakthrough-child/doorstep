import { NextResponse } from "next/server";
import { isPublicDemo } from "@/lib/config";

const DISABLED = () => NextResponse.json({ error: "Disabled in the public demo." }, { status: 403 });
import { getCarePlan, getRingToken, markRingTokenExpired } from "@/lib/config";
import { RingApiError, RingClient, RingTokenExpiredError } from "@/lib/ring/client";
import { listDevices, logApi } from "@/lib/store";

export const dynamic = "force-dynamic";

function client(): RingClient {
  const { token } = getRingToken();
  if (!token) throw new RingTokenExpiredError("(no token)");
  return new RingClient({ token, maxRetries: 0, onRequest: (r) => logApi(r.method, r.path, r.status, r.ms, "live view") });
}

function deviceId(): string | null {
  return getCarePlan().deviceId ?? listDevices("live")[0]?.id ?? listDevices("replay")[0]?.id ?? null;
}

function fail(e: unknown) {
  if (e instanceof RingTokenExpiredError) {
    markRingTokenExpired(true);
    return NextResponse.json({ error: "Connect Ring first: paste a fresh Developer Playground token." }, { status: 401 });
  }
  const status = e instanceof RingApiError ? e.status : 502;
  return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: status >= 400 && status < 600 ? status : 502 });
}

/** Live view: browser SDP offer in, Ring SDP answer out (WHEP, proxied so the token stays server-side). */
export async function POST(req: Request) {
  if (isPublicDemo()) return DISABLED();
  const offer = await req.text();
  if (!offer.startsWith("v=0")) return NextResponse.json({ error: "Expected an SDP offer" }, { status: 400 });
  const id = deviceId();
  if (!id) return NextResponse.json({ error: "No Ring device known yet" }, { status: 404 });
  try {
    const s = await client().startLiveView(id, offer);
    return new Response(s.answerSdp, {
      status: 201,
      // The Location (with its query string) is what Ring needs to close the session later.
      headers: { "Content-Type": "application/sdp", "X-Session-Id": s.location ?? s.sessionId ?? "", "X-Device-Id": id },
    });
  } catch (e) {
    return fail(e);
  }
}

export async function DELETE(req: Request) {
  if (isPublicDemo()) return DISABLED();
  const session = new URL(req.url).searchParams.get("session");
  const id = deviceId();
  if (!session || !id) return NextResponse.json({ ok: true });
  try {
    await client().endLiveView(id, session);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
