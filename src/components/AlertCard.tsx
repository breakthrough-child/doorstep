"use client";

import { useState } from "react";
import type { Alert } from "@/lib/types";
import { AlertIcon, BellIcon, CheckIcon, ClockIcon, MoonIcon, PackageIcon, SunIcon } from "./icons";
import { postJson, useAppState } from "./state";

const RULE_ICON = {
  quiet_morning: SunIcon,
  missed_visit: ClockIcon,
  package_left_out: PackageIcon,
  late_night_activity: MoonIcon,
  unanswered_doorbell: BellIcon,
} as const;

const RULE_LABEL = {
  quiet_morning: "Quiet morning",
  missed_visit: "Missed visit",
  package_left_out: "Package left out",
  late_night_activity: "Late-night activity",
  unanswered_doorbell: "Unanswered doorbell",
} as const;

export function AlertCard({ alert, timeZone, compact = false }: { alert: Alert; timeZone: string; compact?: boolean }) {
  const { refresh } = useAppState();
  const [busy, setBusy] = useState(false);
  const Icon = RULE_ICON[alert.rule] ?? AlertIcon;
  const cleared = alert.clearedAt !== null;
  const resolved = alert.status === "resolved";
  const quiet = cleared || resolved;
  const tone = quiet
    ? "border-line bg-card"
    : alert.severity === "urgent"
      ? "border-rose/40 bg-rose-soft"
      : "border-amber/30 bg-amber-soft";
  const accent = quiet ? "text-ink-soft" : alert.severity === "urgent" ? "text-rose" : "text-amber";
  const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone }).format(alert.triggeredAt);

  const set = async (status: Alert["status"]) => {
    setBusy(true);
    try {
      await postJson(`/api/alerts/${encodeURIComponent(alert.id)}`, { status });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`animate-rise rounded-2xl border p-4 ${tone}`}
      aria-labelledby={`alert-${alert.id}`}
    >
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${accent}`}>
            {RULE_LABEL[alert.rule]} · {time}
            {alert.bestEffort && <span className="ml-1 font-normal normal-case tracking-normal">(best-effort guess)</span>}
            {alert.origin === "simulated" && <span className="ml-1 font-normal normal-case tracking-normal">· simulated</span>}
          </p>
          <h3 id={`alert-${alert.id}`} className={`mt-0.5 text-lg font-bold leading-snug ${quiet ? "text-ink-soft" : "text-ink"}`}>
            {alert.title}
          </h3>
          {!compact && <p className="mt-1 text-ink-soft">{alert.detail}</p>}
          {cleared && (
            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-0.5 text-sm text-sage">
              <CheckIcon className="h-4 w-4" /> {alert.clearedReason}
            </p>
          )}
          {!cleared && (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {alert.status === "open" && (
                <button
                  onClick={() => set("acknowledged")}
                  disabled={busy}
                  className="rounded-full border border-line bg-card px-4 py-1.5 text-sm font-bold text-ink hover:border-ink-soft disabled:opacity-50"
                >
                  I&rsquo;m on it
                </button>
              )}
              {!resolved && (
                <button
                  onClick={() => set("resolved")}
                  disabled={busy}
                  className="rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-paper disabled:opacity-50"
                >
                  All sorted
                </button>
              )}
              {alert.status === "acknowledged" && <span className="text-sm text-ink-soft">You&rsquo;re on it</span>}
              {resolved && (
                <button onClick={() => set("open")} disabled={busy} className="text-sm text-ink-soft underline underline-offset-2">
                  Reopen
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
