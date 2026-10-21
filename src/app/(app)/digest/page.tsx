"use client";

import { useCallback, useEffect, useState } from "react";
import { SparkIcon } from "@/components/icons";
import { postJson, useAppState } from "@/components/state";
import type { Digest } from "@/lib/digest";

export default function DigestPage() {
  const { state } = useAppState();
  const [digests, setDigests] = useState<Digest[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/digests", { cache: "no-store" });
    setDigests(((await res.json()) as { digests: Digest[] }).digests);
  }, []);

  useEffect(() => {
    load();
  }, [load, state?.mode, state?.digestReady]);

  const write = async () => {
    setBusy(true);
    setError(null);
    try {
      await postJson("/api/digests");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const [today, ...past] = digests ?? [];
  const todayKey = state ? new Intl.DateTimeFormat("en-CA", { timeZone: state.timeZone }).format(state.now) : null;
  const hasToday = today && today.dateKey === todayKey;

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl">Daily digest</h1>
          <p className="mt-2 text-ink-soft">A short note on {state?.parentName ?? "your parent"}&rsquo;s day at the door, written by Amazon Bedrock from the day&rsquo;s events.</p>
        </div>
        <button onClick={write} disabled={busy} className="inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 font-bold text-paper disabled:opacity-50">
          <SparkIcon className="h-4 w-4" />
          {busy ? "Writing…" : hasToday ? "Rewrite today’s digest" : "Write today’s digest"}
        </button>
      </header>
      {error && (
        <p role="alert" className="rounded-xl bg-rose-soft px-4 py-2 text-rose">
          {error}
        </p>
      )}

      {digests === null ? (
        <div className="h-40 rounded-3xl bg-line/40" aria-busy="true" />
      ) : !digests.length ? (
        <p className="rounded-2xl border border-dashed border-line px-5 py-10 text-center text-ink-soft">
          No digests yet. They&rsquo;re written at the end of each day — or tap the button for one now.
        </p>
      ) : (
        <>
          {today && <DigestCard d={today} featured timeZone={state?.timeZone ?? "UTC"} />}
          {past.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-display text-xl text-ink-soft">Earlier</h2>
              {past.map((d) => (
                <DigestCard key={d.id} d={d} timeZone={state?.timeZone ?? "UTC"} />
              ))}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function DigestCard({ d, featured = false, timeZone }: { d: Digest; featured?: boolean; timeZone: string }) {
  const [y, m, day] = d.dateKey.split("-").map(Number) as [number, number, number];
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(Date.UTC(y, m - 1, day));
  return (
    <article className={`animate-rise rounded-3xl border border-line bg-card ${featured ? "p-6 sm:p-8" : "p-5"}`}>
      <p className="text-sm text-ink-soft">
        {date}
        {d.origin === "simulated" && " · simulated day"}
        {d.origin === "replay" && " · replayed data"}
      </p>
      <h2 className={`font-display mt-1 ${featured ? "text-3xl" : "text-xl"}`}>{d.headline}</h2>
      <p className={`mt-3 ${featured ? "text-lg" : ""} leading-relaxed`}>{d.summary}</p>
      {featured && d.highlights.length > 0 && (
        <ul className="mt-5 space-y-1.5 border-t border-line pt-4 text-ink-soft">
          {d.highlights.map((h, i) => (
            <li key={i} className="flex gap-2">
              <span aria-hidden className="text-sage">•</span>
              {h}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 inline-flex items-center gap-1 text-xs text-ink-soft">
        <SparkIcon className="h-3 w-3" />
        {!d.mock
          ? `Written by Amazon Bedrock · ${d.model}`
          : d.model === "sample"
            ? "Sample digest from a template — Amazon Bedrock not available yet"
            : "Sample digest from a template — Bedrock mock mode"}{" "}
        ·{" "}
        {new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", timeZone }).format(d.createdAt)}
      </p>
    </article>
  );
}
