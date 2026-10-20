import { NextResponse } from "next/server";
import { setSetting } from "@/lib/db";

export async function POST() {
  setSetting("onboarded", true);
  return NextResponse.json({ ok: true });
}
