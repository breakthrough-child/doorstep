"use client";

import { useState } from "react";
import { AlertCard } from "@/components/AlertCard";
import { useAppState } from "@/components/state";

const FILTERS = [
  { id: "active", label: "Needs attention" },
  { id: "all", label: "All today" },
] as const;

export default function AlertsPage() {
  const { state } = useAppState();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("active");
  if (!state) return null;
  const active = state.alerts.filter((a) => a.status !== "resolved" && a.clearedAt === null);
  const shown = filter === "active" ? active : state.alerts;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-4xl">Alerts</h1>
        <p className="mt-2 text-ink-soft">
          Doorstep stays quiet unless something looks off. Mark an alert &ldquo;I&rsquo;m on it&rdquo; while you check, and &ldquo;All
          sorted&rdquo; when it&rsquo;s handled.
        </p>
      </header>

      <div role="tablist" aria-label="Filter alerts" className="inline-flex rounded-full border border-line bg-card p-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold ${filter === f.id ? "bg-ink text-paper" : "text-ink-soft"}`}
          >
            {f.label}
            {f.id === "active" ? ` (${active.length})` : ` (${state.alerts.length})`}
          </button>
        ))}
      </div>

      <section className="space-y-3" aria-live="polite">
        {shown.length ? (
          shown.map((a) => <AlertCard key={a.id} alert={a} timeZone={state.timeZone} />)
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">
            {filter === "active" ? `Nothing needs you right now. ${state.parentName}'s day looks normal.` : "No alerts today."}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-line bg-card p-5 text-sm text-ink-soft">
        <h2 className="mb-2 font-bold text-ink">What Doorstep watches for</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li><b className="text-ink">Quiet morning</b> — no door activity by the time you set.</li>
          <li><b className="text-ink">Missed visit</b> — nobody came during a scheduled visitor&rsquo;s window.</li>
          <li><b className="text-ink">Package left out</b> — still on the porch after a few hours, or after dark.</li>
          <li><b className="text-ink">Late-night activity</b> — someone at the door during the night hours you set.</li>
          <li><b className="text-ink">Unanswered doorbell</b> — the bell rang and the door didn&rsquo;t seem to open (a best-effort guess from the camera).</li>
        </ul>
      </section>
    </div>
  );
}
