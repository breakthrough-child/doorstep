"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RULE_LABEL } from "@/components/AlertCard";
import { CaptionSource, OriginChip, Snapshot, SnapshotNote } from "@/components/EventFigure";
import { ArrowLeftIcon, ChevronRightIcon, KIND_ICON, KIND_LABEL } from "@/components/icons";
import type { TimelineView } from "@/lib/view";

type EventDetail = {
  event: TimelineView;
  dateLabel: string;
  endLabel: string | null;
  originLabel: string;
  rawType: string;
  rawSubType: string | null;
  model: string | null;
  alerts: Array<{ id: string; title: string; rule: keyof typeof RULE_LABEL; severity: string; status: string }>;
};

export default function EventDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const router = useRouter();
  const [d, setD] = useState<EventDetail | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch(`/api/events/${encodeURIComponent(id)}`, { cache: "no-store" }).then(async (r) => {
      if (!alive) return;
      if (r.status === 404) setMissing(true);
      else if (r.ok) setD(await r.json());
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const back = (
    <button onClick={() => (history.length > 1 ? router.back() : router.push("/"))} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink">
      <ArrowLeftIcon className="h-4 w-4" /> Back
    </button>
  );

  if (missing)
    return (
      <div className="space-y-4 pt-4">
        {back}
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">This event isn&rsquo;t here any more.</p>
      </div>
    );
  if (!d)
    return (
      <div className="space-y-4 pt-2" aria-busy="true">
        <span className="sr-only">Loading event</span>
        <div className="h-10 w-2/3 rounded bg-line/60" />
        <div className="aspect-video rounded-2xl bg-line/40" />
      </div>
    );

  const e = d.event;
  const Icon = KIND_ICON[e.kind] ?? KIND_ICON.motion!;
  return (
    <article className="space-y-5" aria-labelledby="ev-title">
      {back}
      <header>
        <p className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          {d.dateLabel} <OriginChip origin={e.origin} realFrame={e.realRingFrame} />
        </p>
        <h1 id="ev-title" className="font-display mt-1 flex items-center gap-3 text-3xl sm:text-4xl">
          <span className="tabular-nums">{e.time}</span>
          <span className="inline-flex items-center gap-2 text-2xl text-ink-soft sm:text-3xl">
            <Icon className="h-6 w-6" /> {KIND_LABEL[e.kind] ?? e.kind}
          </span>
        </h1>
        <p className="mt-2 text-ink-soft">One moment at the front door, as the camera saw it.</p>
      </header>

      <Snapshot e={e} priority />
      <p className="text-xl leading-snug">{e.sentence ?? "Describing what the camera saw…"}</p>
      <CaptionSource e={e} />
      <SnapshotNote origin={e.origin} realFrame={e.realRingFrame} />

      {d.alerts.length > 0 && (
        <section aria-label="Alerts about this event" className="space-y-2">
          {d.alerts.map((a) => (
            <Link
              key={a.id}
              href={`/alerts/${encodeURIComponent(a.id)}`}
              className={`flex items-center justify-between gap-3 rounded-2xl border p-3 ${a.severity === "urgent" ? "border-rose/40 bg-rose-soft" : "border-amber/30 bg-amber-soft"}`}
            >
              <span>
                <span className="block text-xs font-bold uppercase tracking-wide text-ink-soft">{RULE_LABEL[a.rule]}</span>
                <span className="font-bold">{a.title}</span>
              </span>
              <ChevronRightIcon className="h-5 w-5 shrink-0" />
            </Link>
          ))}
        </section>
      )}

      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-2xl border border-line bg-card p-4 text-sm">
        <dt className="text-ink-soft">Where this is from</dt>
        <dd>{d.originLabel}</dd>
        <dt className="text-ink-soft">Time</dt>
        <dd>
          {e.time}
          {d.endLabel && d.endLabel !== e.time ? `–${d.endLabel}` : ""}
        </dd>
        <dt className="text-ink-soft">Description</dt>
        <dd>{e.captionSource ?? "Not described yet"}</dd>
      </dl>
      <details className="rounded-2xl border border-line bg-card p-4 text-sm text-ink-soft">
        <summary className="cursor-pointer font-bold text-ink">Technical details</summary>
        <p className="mt-2">
          {e.origin === "simulated" ? "Event type (example)" : "Ring event type"}: <code>{d.rawType}</code>
          {d.rawSubType ? (
            <>
              {" "}
              / <code>{d.rawSubType}</code>
            </>
          ) : null}
        </p>
        {d.model && <p className="mt-1">Caption model: <code>{d.model}</code></p>}
      </details>
    </article>
  );
}
