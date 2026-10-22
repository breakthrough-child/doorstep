"use client";

import Link from "next/link";
import type { TimelineView } from "@/lib/view";
import { OriginChip } from "./EventFigure";
import { ChevronRightIcon, KIND_ICON, KIND_LABEL, SparkIcon } from "./icons";

export function Timeline({ items, parentName, emptyHint }: { items: TimelineView[]; parentName: string; emptyHint?: string }) {
  if (!items.length)
    return (
      <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-ink-soft">
        <p>Nothing at {parentName}&rsquo;s door yet today.</p>
        {emptyHint && <p className="mt-1 text-sm">{emptyHint}</p>}
      </div>
    );
  return (
    <ol className="space-y-3">
      {items.map((e) => (
        <TimelineRow key={e.id} e={e} />
      ))}
    </ol>
  );
}

function TimelineRow({ e }: { e: TimelineView }) {
  const Icon = KIND_ICON[e.kind] ?? KIND_ICON.motion!;
  return (
    <li className="animate-rise grid grid-cols-[3rem_1fr] gap-2.5 sm:grid-cols-[3.5rem_1fr] sm:gap-4">
      <div className="pt-3.5 text-right">
        <time className="font-display text-[1.05rem] font-semibold tabular-nums text-ink" dateTime={new Date(e.startMs).toISOString()}>
          {e.time}
        </time>
      </div>
      <Link
        href={`/events/${encodeURIComponent(e.id)}`}
        className="group flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 transition-colors hover:border-ink-soft sm:flex-row sm:items-start sm:p-3.5"
        aria-label={`${KIND_LABEL[e.kind] ?? e.kind} at ${e.time}: ${e.sentence ?? "being described"}. Open details.`}
      >
        {e.hasSnapshot ? (
          // object-contain: never crop — the Ring watermark must stay fully visible.
          <img
            src={`/api/snapshots/${encodeURIComponent(e.id)}`}
            alt=""
            loading="lazy"
            className="aspect-video w-full shrink-0 rounded-xl bg-black object-contain ring-1 ring-line sm:w-40"
          />
        ) : (
          <div
            className="grid aspect-[4/1] w-full shrink-0 place-items-center rounded-xl bg-paper text-center text-xs leading-tight text-ink-soft ring-1 ring-line sm:aspect-video sm:w-40"
            title={e.snapshotNote ?? undefined}
          >
            <span className="px-2">No image from Ring</span>
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
            <span className="inline-flex items-center gap-1 font-bold uppercase tracking-wide">
              <Icon className="h-3.5 w-3.5" />
              {KIND_LABEL[e.kind] ?? e.kind}
            </span>
            <OriginChip origin={e.origin} />
          </p>
          <p className="mt-1 leading-snug text-ink">
            {e.sentence ?? <span className="italic text-ink-soft">Describing what the camera saw…</span>}
          </p>
          {e.captionSource && (
            <p className={`mt-1.5 inline-flex items-center gap-1 text-[0.72rem] ${e.captionIsSample ? "font-bold text-sky" : "text-ink-soft"}`}>
              <SparkIcon className="h-3 w-3" /> {e.captionSource}
            </p>
          )}
        </div>
        <ChevronRightIcon className="hidden h-5 w-5 shrink-0 self-center text-ink-soft transition-transform group-hover:translate-x-0.5 sm:block" />
      </Link>
    </li>
  );
}
