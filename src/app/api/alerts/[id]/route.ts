import { NextResponse } from "next/server";
import { actionSchema, alertDetail, performAlertAction } from "@/lib/alerts";
import { tick } from "@/lib/pipeline";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  await tick();
  const detail = alertDetail(decodeURIComponent(id));
  if (!detail) return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  return NextResponse.json(detail);
}

/** Caretaker actions: call, that was expected, remind me, resolve, reopen. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const parsed = actionSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  const res = performAlertAction(decodeURIComponent(id), parsed.data);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, detail: alertDetail(decodeURIComponent(id)) });
}
