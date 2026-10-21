"use client";

import { useEffect, useRef, useState } from "react";
import type { TimelineView } from "@/lib/view";
import { CloseIcon, KIND_ICON, KIND_LABEL, SparkIcon } from "./icons";

export function Timeline({ items, parentName }: { items: TimelineView[]; parentName: string }) {
  const [open, setOpen] = useState<TimelineView | null>(null);
  if (!items.length)
    return (
      <p className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-ink-soft">
        Nothing at {parentName}&rsquo;s door yet today.
      </p>
    );
  return (
    <>
      <ol className="space-y-3">
        {items.map((e) => (
          <TimelineRow key={e.id} e={e} onOpen={() => setOpen(e)} />
        ))}
      </ol>
      {open && <SnapshotDialog e={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function TimelineRow({ e, onOpen }: { e: TimelineView; onOpen: () => void }) {
  const Icon = KIND_ICON[e.kind] ?? KIND_ICON.motion!;
  return (
    <li className="animate-rise grid grid-cols-[3rem_1fr] gap-2.5 sm:grid-cols-[3.5rem_1fr] sm:gap-4">
      <div className="pt-3.5 text-right">
        <time className="font-display text-[1.05rem] font-semibold tabular-nums text-ink" dateTime={new Date(e.startMs).toISOString()}>
          {e.time}
        </time>
      </div>
      <div className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3 sm:flex-row sm:items-start sm:p-3.5">
        {e.hasSnapshot ? (
          <button
            onClick={onOpen}
            className="group relative aspect-video w-full shrink-0 overflow-hidden rounded-xl bg-paper ring-1 ring-line sm:w-40"
            aria-label={`Open snapshot from ${e.time}`}
          >
            {/* object-contain: never crop — the Ring watermark must stay fully visible. */}
            <img
              src={`/api/snapshots/${encodeURIComponent(e.id)}`}
              alt={e.sentence ? `Snapshot: ${e.sentence}` : `Front door snapshot at ${e.time}`}
              loading="lazy"
              className="h-full w-full object-contain transition-transform group-hover:scale-[1.02]"
            />
          </button>
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
            {e.origin !== "live" && (
              <span className="rounded-full bg-sky-soft px-2 py-px font-bold text-sky">{e.origin === "simulated" ? "Simulated" : "Replayed"}</span>
            )}
          </p>
          <p className="mt-1 leading-snug text-ink">
            {e.sentence ?? <span className="text-ink-soft italic">Describing what the camera saw…</span>}
          </p>
          {e.captionSource && (
            <p className={`mt-1.5 inline-flex items-center gap-1 text-[0.72rem] ${e.captionSource.startsWith("Sample") ? "font-bold text-sky" : "text-ink-soft"}`}>
              <SparkIcon className="h-3 w-3" /> {e.captionSource}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

function SnapshotDialog({ e, onClose }: { e: TimelineView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(ev) => ev.target === ref.current && onClose()}
      className="m-auto w-[min(960px,94vw)] rounded-2xl bg-card p-0 text-ink backdrop:bg-black/60"
      aria-labelledby="snap-title"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <h2 id="snap-title" className="font-bold">
          {KIND_LABEL[e.kind]} at {e.time}
        </h2>
        <button onClick={onClose} className="rounded-full p-1.5 hover:bg-paper" aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      <img
        src={`/api/snapshots/${encodeURIComponent(e.id)}`}
        alt={e.sentence ?? "Front door snapshot"}
        className="block max-h-[70vh] w-full bg-black object-contain"
      />
      <div className="px-4 py-3">
        <p>{e.sentence}</p>
        <p className="mt-1 text-xs text-ink-soft">
          {e.origin === "simulated"
            ? "Simulated scene for the demo — an illustration, not a Ring camera image."
            : "Ring snapshot shown uncropped with its mandatory watermark."}{" "}
          Doorstep describes what happens; it never identifies people.
        </p>
      </div>
    </dialog>
  );
}
