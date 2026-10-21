"use client";

import Link from "next/link";
import { AlertCard } from "@/components/AlertCard";
import { CheckIcon, ClockIcon, NoteIcon, SparkIcon } from "@/components/icons";
import { useAppState } from "@/components/state";
import { Timeline } from "@/components/Timeline";
import type { AppState, VisitStatus } from "@/lib/view";

export default function TodayPage() {
  const { state } = useAppState();
  if (!state) return <Loading />;
  const pinned = state.alerts.filter((a) => a.status !== "resolved" && a.clearedAt === null);
  const settled = state.alerts.filter((a) => !(a.status !== "resolved" && a.clearedAt === null));

  return (
    <div className="space-y-8">
      <StatusHero state={state} />

      {pinned.length > 0 && (
        <section aria-labelledby="needs-title" className="space-y-3">
          <h2 id="needs-title" className="sr-only">
            Needs your attention
          </h2>
          {pinned.map((a) => (
            <AlertCard key={a.id} alert={a} timeZone={state.timeZone} />
          ))}
        </section>
      )}

      {state.visits.length > 0 && <Visits visits={state.visits} />}

      <section aria-labelledby="timeline-title">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="timeline-title" className="font-display text-2xl">
            At the door today
          </h2>
          {state.digestReady && (
            <Link href="/digest" className="inline-flex items-center gap-1.5 text-sm font-bold text-sage underline-offset-2 hover:underline">
              <NoteIcon className="h-4 w-4" /> Today&rsquo;s digest
            </Link>
          )}
        </div>
        {state.sampleCaptions && <SampleCaptionNote state={state} />}
        <Timeline items={state.timeline} parentName={state.parentName} />
      </section>

      {settled.length > 0 && (
        <section aria-labelledby="settled-title" className="space-y-3">
          <h2 id="settled-title" className="font-display text-xl text-ink-soft">
            Settled today
          </h2>
          {settled.map((a) => (
            <AlertCard key={a.id} alert={a} timeZone={state.timeZone} compact />
          ))}
        </section>
      )}

      <PrivacyNote />
    </div>
  );
}

function StatusHero({ state }: { state: AppState }) {
  const { level, headline, sub } = state.status;
  const ring = level === "calm" ? "bg-sage" : level === "urgent" ? "bg-rose" : "bg-amber";
  const text = level === "calm" ? "text-sage" : level === "urgent" ? "text-rose" : "text-amber";
  return (
    <section aria-live="polite" aria-atomic="true" className="pt-2">
      <p className="flex items-center gap-2 text-sm text-ink-soft">
        <span className="relative inline-flex h-3 w-3">
          <span className={`absolute inset-0 rounded-full ${ring} ${level === "calm" ? "animate-breathe" : ""}`} aria-hidden />
          <span className={`relative h-3 w-3 rounded-full ${ring}`} aria-hidden />
        </span>
        {state.dateLabel} · {state.mode === "SCENARIO" ? `simulated time ${state.nowLabel}` : state.nowLabel}
      </p>
      <h1 className={`font-display mt-2 text-[2.1rem] leading-[1.1] sm:text-5xl ${level === "calm" ? "text-ink" : text}`}>{headline}</h1>
      <p className="mt-3 text-ink-soft">{sub}</p>
      {state.mode === "SCENARIO" && !state.scenario && (
        <p className="mt-3 text-sm text-ink-soft">
          Simulation mode is on but no scenario is running. <Link href="/demo" className="font-bold text-sky underline">Open the demo panel</Link>.
        </p>
      )}
    </section>
  );
}

function Visits({ visits }: { visits: VisitStatus[] }) {
  return (
    <section aria-labelledby="visits-title">
      <h2 id="visits-title" className="mb-3 font-display text-2xl">
        Visits today
      </h2>
      <ul className="grid gap-3 sm:grid-cols-2">
        {visits.map((v) => {
          const label =
            v.state === "seen"
              ? `Someone came at ${v.seenAt}`
              : v.state === "missed"
                ? "Nobody seen in the window"
                : v.state === "not_watched"
                  ? "Before Doorstep was watching"
                : v.state === "in_window"
                  ? "Expected now"
                  : "Later today";
          const tone =
            v.state === "seen" ? "text-sage" : v.state === "missed" ? "text-amber" : "text-ink-soft";
          return (
            <li key={v.id} className="flex items-center gap-3 rounded-2xl border border-line bg-card p-3.5">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full bg-paper ${tone}`}>
                {v.state === "seen" ? <CheckIcon /> : <ClockIcon />}
              </span>
              <div className="min-w-0">
                <p className="font-bold leading-tight">{v.name}</p>
                <p className="text-sm text-ink-soft">
                  {v.window} · <span className={tone}>{label}</span>
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function SampleCaptionNote({ state }: { state: AppState }) {
  const forced = state.bedrock.status === "mock";
  return (
    <p role="note" className="mb-3 flex gap-2 rounded-2xl border border-sky/25 bg-sky-soft px-4 py-3 text-sm text-ink">
      <SparkIcon className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
      <span>
        <b>Sample captions.</b>{" "}
        {forced
          ? "Amazon Bedrock isn’t configured here (no AWS credentials, or BEDROCK_MOCK=1), so these sentences are pre-written samples, not AI output."
          : "Amazon Bedrock isn’t available on this account yet, so these sentences are pre-written samples. Doorstep keeps retrying and switches to Nova Lite captions automatically."}
      </span>
    </p>
  );
}

function PrivacyNote() {
  return (
    <p className="border-t border-line pt-5 text-sm text-ink-soft">
      Doorstep describes what happens at the door. It never recognises faces or identifies anyone — &ldquo;someone came&rdquo; means
      any person, by design.
    </p>
  );
}

function Loading() {
  return (
    <div className="space-y-4 pt-2" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading today&rsquo;s status</span>
      <div className="h-4 w-48 rounded bg-line/60" />
      <div className="h-12 w-3/4 rounded bg-line/60" />
      <div className="h-24 rounded-2xl bg-line/40" />
      <div className="h-24 rounded-2xl bg-line/40" />
    </div>
  );
}
