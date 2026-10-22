"use client";

import Link from "next/link";
import type { TimelineView } from "@/lib/view";
import { KIND_ICON, KIND_LABEL, SparkIcon } from "./icons";

const ORIGIN_CHIP: Record<string, string> = {
  live: "Live from Ring",
  replay: "Recorded from Ring Playground",
  simulated: "Simulated",
};

export function OriginChip({ origin }: { origin: string }) {
  return (
    <span className={`rounded-full px-2 py-px text-xs font-bold ${origin === "live" ? "bg-sage-soft text-sage" : "bg-sky-soft text-sky"}`}>
      {ORIGIN_CHIP[origin] ?? origin}
    </span>
  );
}

export function CaptionSource({ e }: { e: TimelineView }) {
  if (!e.captionSource) return null;
  return (
    <p className={`inline-flex items-center gap-1 text-xs ${e.captionIsSample ? "font-bold text-sky" : "text-ink-soft"}`}>
      <SparkIcon className="h-3.5 w-3.5" /> {e.captionSource}
    </p>
  );
}

/** Full-size snapshot, shown uncropped so the Ring watermark stays intact. */
export function Snapshot({ e, priority = false }: { e: TimelineView; priority?: boolean }) {
  if (!e.hasSnapshot)
    return (
      <div className="grid aspect-video w-full place-items-center rounded-2xl bg-paper text-center text-sm text-ink-soft ring-1 ring-line">
        <span className="max-w-xs px-4">No image from Ring for this event{e.snapshotNote ? ` (${e.snapshotNote})` : ""}.</span>
      </div>
    );
  return (
    <img
      src={`/api/snapshots/${encodeURIComponent(e.id)}`}
      alt={e.sentence ? `Front door at ${e.time}: ${e.sentence}` : `Front door snapshot at ${e.time}`}
      loading={priority ? "eager" : "lazy"}
      className="block aspect-video w-full rounded-2xl bg-black object-contain ring-1 ring-line"
    />
  );
}

export function SnapshotNote({ origin }: { origin: string }) {
  return (
    <p className="text-xs text-ink-soft">
      {origin === "simulated"
        ? "Simulated scene for the demo: an illustration, not a Ring camera image."
        : "Ring snapshot shown uncropped, with Ring’s mandatory watermark."}{" "}
      Doorstep describes what happens; it never identifies people.
    </p>
  );
}

/** Compact clickable rows with thumbnails (related events on an alert, etc.). */
export function MiniTimeline({ items, highlight }: { items: TimelineView[]; highlight?: Set<string> }) {
  if (!items.length) return <p className="text-sm text-ink-soft">No other door activity in that window.</p>;
  return (
    <ol className="space-y-2">
      {items.map((e) => {
        const Icon = KIND_ICON[e.kind] ?? KIND_ICON.motion!;
        const hot = highlight?.has(e.id);
        return (
          <li key={e.id}>
            <Link
              href={`/events/${encodeURIComponent(e.id)}`}
              className={`flex items-center gap-3 rounded-2xl border p-2 pr-3 transition-colors hover:border-ink-soft ${hot ? "border-amber/40 bg-amber-soft" : "border-line bg-card"}`}
            >
              {e.hasSnapshot ? (
                <img src={`/api/snapshots/${encodeURIComponent(e.id)}`} alt="" loading="lazy" className="aspect-video w-24 shrink-0 rounded-lg bg-black object-contain" />
              ) : (
                <span className="grid aspect-video w-24 shrink-0 place-items-center rounded-lg bg-paper text-ink-soft ring-1 ring-line">
                  <Icon className="h-5 w-5" />
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                  <span className="font-display text-sm font-semibold tabular-nums text-ink">{e.time}</span>
                  <Icon className="h-3.5 w-3.5" /> {KIND_LABEL[e.kind] ?? e.kind}
                </span>
                <span className="mt-0.5 line-clamp-2 block text-sm leading-snug text-ink">{e.sentence ?? "Describing…"}</span>
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
