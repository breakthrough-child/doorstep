"use client";

import Link from "next/link";
import type { AppState } from "@/lib/view";

/** Always-visible honesty badge: where the data on screen comes from. */
export function ModeBadge({ state, compact = false }: { state: AppState; compact?: boolean }) {
  const { mode } = state;
  const info =
    mode === "LIVE"
      ? { label: "Live", detail: "Ring Developer Playground", cls: "bg-sage-soft text-sage", dot: "bg-sage" }
      : mode === "REPLAY"
        ? {
            label: "Replay",
            detail: state.replay?.synthetic ? "Placeholder fixtures" : "Recorded Playground data",
            cls: "bg-sky-soft text-sky",
            dot: "bg-sky",
          }
        : {
            label: "Simulated",
            detail: state.scenario ? `${state.scenario.title} · ${state.nowLabel}` : "No scenario running",
            cls: "bg-sky-soft text-sky",
            dot: "bg-sky",
          };
  return (
    <Link
      href="/demo"
      className={`inline-flex max-w-full items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ${info.cls}`}
      title={`Data source: ${info.detail}. Open the demo panel.`}
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${info.dot} ${mode === "LIVE" ? "animate-breathe" : ""}`} aria-hidden />
      <span className="uppercase tracking-wide">{info.label}</span>
      {!compact && <span className="truncate font-normal">{info.detail}</span>}
      <span className="sr-only">data mode. {info.detail}</span>
    </Link>
  );
}
