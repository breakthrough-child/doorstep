import { NextResponse } from "next/server";
import { getCarePlan } from "@/lib/config";
import * as store from "@/lib/store";
import { clockLabel } from "@/lib/time";
import { ORIGIN_LABEL, toEventView } from "@/lib/view";

export const dynamic = "force-dynamic";

/** One door event: snapshot, time, type, data-source label, caption, and any alerts citing it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = store.getEvent(decodeURIComponent(id));
  if (!event) return NextResponse.json({ error: "Event not found" }, { status: 404 });
  const tz = getCarePlan().timeZone;
  const description = store.descriptionsFor([event.id]).get(event.id) ?? null;
  const alerts = store
    .listAlerts(event.origin, event.startMs - 24 * 3600_000, event.startMs + 24 * 3600_000)
    .filter((a) => a.eventIds.includes(event.id))
    .map((a) => ({ id: a.id, title: a.title, rule: a.rule, severity: a.severity, status: a.status }));
  return NextResponse.json({
    event: toEventView({ ...event, description }, tz),
    dateLabel: new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz }).format(event.startMs),
    endLabel: event.endMs ? clockLabel(event.endMs, tz) : null,
    originLabel: ORIGIN_LABEL[event.origin],
    rawType: event.rawType,
    rawSubType: event.rawSubType,
    model: description?.model ?? null,
    alerts,
  });
}
