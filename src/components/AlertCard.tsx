"use client";

import Link from "next/link";
import type { Alert, Contact } from "@/lib/types";
import { CaretakerActions } from "./CaretakerActions";
import { AlertIcon, BellIcon, CheckIcon, ChevronRightIcon, ClockIcon, MoonIcon, PackageIcon, SunIcon } from "./icons";
import { useAppState } from "./state";

export const RULE_ICON = {
  quiet_morning: SunIcon,
  missed_visit: ClockIcon,
  package_left_out: PackageIcon,
  late_night_activity: MoonIcon,
  unanswered_doorbell: BellIcon,
} as const;

export const RULE_LABEL = {
  quiet_morning: "Quiet morning",
  missed_visit: "Missed visit",
  package_left_out: "Package left out",
  late_night_activity: "Late-night activity",
  unanswered_doorbell: "Unanswered doorbell",
} as const;

export function alertTone(alert: Alert) {
  const quiet = alert.clearedAt !== null || alert.status === "resolved";
  return {
    quiet,
    box: quiet ? "border-line bg-card" : alert.severity === "urgent" ? "border-rose/40 bg-rose-soft" : "border-amber/30 bg-amber-soft",
    accent: quiet ? "text-ink-soft" : alert.severity === "urgent" ? "text-rose" : "text-amber",
  };
}

export function AlertCard({
  alert,
  timeZone,
  contacts,
  compact = false,
}: {
  alert: Alert;
  timeZone: string;
  contacts: Contact[];
  compact?: boolean;
}) {
  const { refresh } = useAppState();
  const Icon = RULE_ICON[alert.rule] ?? AlertIcon;
  const cleared = alert.clearedAt !== null;
  const { quiet, box, accent } = alertTone(alert);
  const fmt = (ms: number) => new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone }).format(ms);
  const href = `/alerts/${encodeURIComponent(alert.id)}`;

  return (
    <article className={`animate-rise rounded-2xl border p-4 ${box}`} aria-labelledby={`alert-${alert.id}`}>
      <div className="flex items-start gap-3">
        <span className={`mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full bg-card ${accent}`}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-xs font-bold uppercase tracking-wide ${accent}`}>
            {RULE_LABEL[alert.rule]} · {fmt(alert.triggeredAt)}
            {alert.bestEffort && <span className="ml-1 font-normal normal-case tracking-normal">(best-effort guess)</span>}
            {alert.origin === "simulated" && <span className="ml-1 font-normal normal-case tracking-normal">· simulated</span>}
          </p>
          <h3 id={`alert-${alert.id}`} className={`mt-0.5 text-lg font-bold leading-snug ${quiet ? "text-ink-soft" : "text-ink"}`}>
            <Link href={href} className="rounded hover:underline underline-offset-4">
              {alert.title}
            </Link>
          </h3>
          {!compact && <p className="mt-1 text-ink-soft">{alert.detail}</p>}

          <div className="mt-2 flex flex-wrap gap-1.5">
            {alert.escalatedAt && !quiet && (
              <span className="inline-flex items-center gap-1 rounded-full bg-rose px-2.5 py-0.5 text-xs font-bold text-card">
                {alert.escalatedTo ? `Escalated to ${alert.escalatedTo}` : "Unacknowledged 15 min"} · {fmt(alert.escalatedAt)}
              </span>
            )}
            {alert.snoozedUntil && !quiet && (
              <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-0.5 text-xs font-bold text-ink-soft ring-1 ring-line">
                <ClockIcon className="h-3.5 w-3.5" /> Reminder at {fmt(alert.snoozedUntil)}
              </span>
            )}
            {alert.status === "acknowledged" && !alert.snoozedUntil && !quiet && (
              <span className="rounded-full bg-card px-2.5 py-0.5 text-xs font-bold text-ink-soft ring-1 ring-line">You&rsquo;re on it</span>
            )}
            {cleared && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-0.5 text-sm text-sage">
                <CheckIcon className="h-4 w-4" /> {alert.clearedReason}
              </span>
            )}
          </div>

          {!cleared && !compact && (
            <div className="mt-3">
              <CaretakerActions alert={alert} contacts={contacts} compact onDone={refresh} />
            </div>
          )}
          <Link href={href} className={`mt-3 inline-flex items-center gap-1 text-sm font-bold ${accent} hover:underline underline-offset-4`}>
            See what happened <ChevronRightIcon className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </article>
  );
}
