import { NextResponse } from "next/server";
import { z } from "zod";
import { carePlanSchema, getCarePlan, replaceVisitors, saveCarePlan, visitorSchema } from "@/lib/config";
import { listDevices } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const devices = [...listDevices("live"), ...listDevices("replay")];
  return NextResponse.json({ plan: getCarePlan(), devices });
}

const body = carePlanSchema.extend({ visitors: z.array(visitorSchema).max(12) });

export async function PUT(req: Request) {
  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Please check the highlighted fields", issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
      { status: 400 },
    );
  }
  const { visitors, ...plan } = parsed.data;
  saveCarePlan(plan);
  replaceVisitors(visitors);
  return NextResponse.json({ plan: getCarePlan() });
}
