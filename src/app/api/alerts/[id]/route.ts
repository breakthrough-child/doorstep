import { NextResponse } from "next/server";
import { z } from "zod";
import { setAlertStatus } from "@/lib/store";

const body = z.object({ status: z.enum(["open", "acknowledged", "resolved"]) });

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "status must be open, acknowledged or resolved" }, { status: 400 });
  if (!setAlertStatus(decodeURIComponent(id), parsed.data.status)) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
