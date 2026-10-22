"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { alertTone, RULE_ICON, RULE_LABEL } from "@/components/AlertCard";
import { CaretakerActions } from "@/components/CaretakerActions";
import { LookNow } from "@/components/LookNow";
import { CaptionSource, MiniTimeline, OriginChip, Snapshot, SnapshotNote } from "@/components/EventFigure";
import { ArrowLeftIcon, CheckIcon, ClockIcon, KIND_LABEL } from "@/components/icons";
import { postJson, useAppState } from "@/components/state";
import type { AlertDetail } from "@/lib/alerts";

export default function AlertDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { state: appState, refresh: refreshState } = useAppState();
  const [d, setD] = useState<AlertDetail | null>(null);
  const [missing, setMissing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/alerts/${encodeURIComponent(id)}`, { cache: "no-store" });
    if (res.status === 404) return setMissing(true);
    if (res.ok) setD(await res.json());
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  const done = async () => {
    await Promise.all([load(), refreshState()]);
  };

  if (missing)
    return (
      <div className="space-y-4 pt-4">
        <BackLink />
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">
          This alert isn&rsquo;t here any more. It may have been cleared when the demo was reset.
        </p>
      </div>
    );
  if (!d)
    return (
      <div className="space-y-4 pt-2" aria-busy="true">
        <span className="sr-only">Loading alert</span>
        <div className="h-4 w-40 rounded bg-line/60" />
        <div className="h-10 w-3/4 rounded bg-line/60" />
        <div className="aspect-video rounded-2xl bg-line/40" />
      </div>
    );

  const { alert } = d;
  const Icon = RULE_ICON[alert.rule];
  const { quiet, box, accent } = alertTone(alert);
  // The first cited event (e.g. the first ring) is the one the family should see.
  const main = [...d.events].reverse().find((e) => e.hasSnapshot) ?? d.events[0] ?? null;
  const citedIds = new Set(alert.eventIds);

  return (
    <article className="space-y-6" aria-labelledby="alert-title">
      <BackLink />

      <header>
        <p className={`flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wide ${accent}`}>
          <Icon className="h-4 w-4" /> {RULE_LABEL[alert.rule]} · {d.timeLabel}
          <OriginChip origin={alert.origin} />
          {alert.bestEffort && <span className="font-normal normal-case tracking-normal">best-effort guess</span>}
        </p>
        <h1 id="alert-title" className={`font-display mt-2 text-3xl leading-tight sm:text-4xl ${quiet ? "text-ink-soft" : "text-ink"}`}>
          {alert.title}
        </h1>
        <p className="mt-2 text-ink-soft">What Doorstep noticed, why it flagged it, and what you can do now.</p>
      </header>

      {alert.escalatedAt && !quiet && (
        <p role="status" className="rounded-2xl bg-rose px-4 py-3 font-bold text-card">
          {alert.escalatedTo
            ? `Escalated to ${alert.escalatedTo}: nobody acknowledged this for 15 minutes.`
            : "Nobody acknowledged this for 15 minutes. Add a second family contact in the Care plan so Doorstep can escalate."}
        </p>
      )}

      <section aria-label="Why this alert fired" className={`rounded-2xl border p-4 ${box}`}>
        <h2 className={`text-xs font-bold uppercase tracking-wide ${accent}`}>Why Doorstep flagged this</h2>
        <p className="mt-1 text-lg leading-snug text-ink">{d.why}</p>
        {alert.clearedAt && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-sage-soft px-2.5 py-0.5 text-sm text-sage">
            <CheckIcon className="h-4 w-4" /> {alert.clearedReason}
          </p>
        )}
        <p className="mt-2 text-sm">
          <Link href="/care-plan" className="text-ink-soft underline underline-offset-2">
            Adjust this in the care plan
          </Link>
        </p>
      </section>

      {main ? (
        <section aria-label="What the camera saw" className="space-y-2">
          <Snapshot e={main} priority />
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-soft">
            <span className="font-display text-base font-semibold text-ink">{main.time}</span>
            <span>{KIND_LABEL[main.kind] ?? main.kind}</span>
            <OriginChip origin={main.origin} realFrame={main.realRingFrame} />
          </div>
          <p className="text-lg leading-snug">{main.sentence ?? "Describing what the camera saw…"}</p>
          <CaptionSource e={main} />
          <SnapshotNote origin={main.origin} realFrame={main.realRingFrame} />
          {d.events.length > 1 && (
            <p className="text-sm text-ink-soft">
              {d.events.length} events are part of this alert; they&rsquo;re highlighted below.
            </p>
          )}
        </section>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-ink-soft">
          There&rsquo;s no camera event for this alert: it&rsquo;s about something that <em>didn&rsquo;t</em> happen at the door. Nearby activity is
          listed below.
        </p>
      )}

      <section aria-labelledby="act-title" className="rounded-2xl border border-line bg-card p-5">
        <h2 id="act-title" className="font-display text-xl">
          What would you like to do?
        </h2>
        <div className="mt-3">
          {alert.clearedAt ? (
            <p className="text-ink-soft">This settled on its own, so there&rsquo;s nothing to do.</p>
          ) : (
            <CaretakerActions alert={alert} contacts={d.contacts} suggestedVisitor={d.suggestedVisitor} onDone={done} />
          )}
          {!alert.clearedAt && alert.status !== "resolved" && (
            <button
              onClick={async () => {
                await postJson(`/api/alerts/${encodeURIComponent(alert.id)}`, { action: "resolve" });
                await done();
              }}
              className="mt-3 text-sm text-ink-soft underline underline-offset-2"
            >
              It&rsquo;s sorted, close this alert
            </button>
          )}
        </div>
        {alert.snoozedUntil && alert.status !== "resolved" && (
          <p className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-soft">
            <ClockIcon className="h-4 w-4" /> Doorstep will remind you at {d.snoozeLabel}
            {alert.origin === "simulated" ? " (example-day time)" : ""}.
          </p>
        )}

        <h3 className="mt-5 text-sm font-bold text-ink">History</h3>
        <ol className="mt-2 space-y-1.5 border-l-2 border-line pl-4 text-sm">
          <li>
            <span className="font-display font-semibold tabular-nums">{d.timeLabel}</span> <span className="text-ink-soft">Alert raised</span>
          </li>
          {d.actions.map((a) => (
            <li key={a.id} className={a.action === "escalated" ? "font-bold text-rose" : ""}>
              <span className="font-display font-semibold tabular-nums">{a.timeLabel}</span>{" "}
              <span className={a.action === "escalated" ? "" : "text-ink-soft"}>{a.label}</span>
            </li>
          ))}
        </ol>
      </section>

      {appState?.ring.hasToken && !appState.ring.expired && <LookNow />}

      <section aria-labelledby="rel-title">
        <h2 id="rel-title" className="font-display mb-3 text-xl">
          At the door around then
        </h2>
        <p className="-mt-2 mb-3 text-sm text-ink-soft">Events within 10 minutes either side.</p>
        <MiniTimeline items={[...d.events.filter((e) => e !== main), ...d.related].sort((a, b) => a.startMs - b.startMs)} highlight={citedIds} />
      </section>

      {d.contacts.length === 0 && (
        <p className="text-sm text-ink-soft">
          Tip: add phone numbers under <Link href="/care-plan" className="underline">Care plan → Contacts</Link> to call from here.
        </p>
      )}
    </article>
  );
}

function BackLink() {
  return (
    <Link href="/alerts" className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-ink">
      <ArrowLeftIcon className="h-4 w-4" /> All alerts
    </Link>
  );
}
