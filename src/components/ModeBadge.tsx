"use client";

import Link from "next/link";
import type { AppState } from "@/lib/view";

/** Always-visible honesty badge in plain words: where the events on screen come from. */
export function sourceLabel(state: AppState): { label: string; detail: string } {
  if (state.mode === "LIVE") return { label: "Live from Ring", detail: "Events from a connected Ring camera" };
  if (state.mode === "REPLAY") return { label: "Recorded from a Ring camera", detail: "Real Ring events, recorded earlier and replayed" };
  return { label: "Example day", detail: state.scenario ? `${state.scenario.title} · ${state.nowLabel}` : "No example day loaded" };
}

export function ModeBadge({ state, compact = false }: { state: AppState; compact?: boolean }) {
  const { label, detail } = sourceLabel(state);
  const live = state.mode === "LIVE";
  return (
    <Link
      href="/demo"
      className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${live ? "bg-sage-soft text-sage" : "bg-sky-soft text-sky"}`}
      title={`${detail}. Open the demo controls.`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${live ? "bg-sage animate-breathe" : "bg-sky"}`} aria-hidden />
      <span>{label}</span>
      {!compact && state.mode === "SCENARIO" && state.scenario && <span className="truncate font-normal">{state.nowLabel}</span>}
      <span className="sr-only">. {detail}</span>
    </Link>
  );
}
