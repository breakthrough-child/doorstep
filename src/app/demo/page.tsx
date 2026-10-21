"use client";

import { useCallback, useEffect, useState } from "react";
import { PauseIcon, PlayIcon } from "@/components/icons";
import { postJson } from "@/components/state";
import type { AppState } from "@/lib/view";

type Scenario = { id: string; title: string; summary: string; startTime: string; endTime: string; events: number };
type ApiLog = { method: string; path: string; status: number; ms: number; note: string | null; created_at: number };
type DemoData = { scenarios: Scenario[]; apiLog: ApiLog[]; state: AppState };

const SPEEDS = [1, 10, 60, 300];

/** Hidden demo control panel: drive data modes and scenarios while recording. */
export default function DemoPanel() {
  const [data, setData] = useState<DemoData | null>(null);
  const [speed, setSpeed] = useState(60);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [frame, setFrame] = useState<"phone" | "tv" | "none">("phone");

  const load = useCallback(async () => {
    const res = await fetch("/api/demo", { cache: "no-store" });
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [load]);

  const act = async (label: string, body: Record<string, unknown>) => {
    setBusy(label);
    setError(null);
    try {
      await postJson("/api/demo", body);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const s = data?.state;
  return (
    <main id="main" className="min-h-dvh bg-paper px-4 py-6 lg:px-8">
      <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[minmax(0,1fr)_auto]">
        <div className="space-y-6">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-ink-soft">Doorstep · demo control panel</p>
              <h1 className="font-display text-3xl">Drive the demo</h1>
            </div>
            <a href="/" className="rounded-full border border-line bg-card px-4 py-2 text-sm font-bold">
              Open app ↗
            </a>
          </header>

          {error && <p role="alert" className="rounded-xl bg-rose-soft px-4 py-2 text-rose">{error}</p>}

          <Panel title="1 · Data mode" note="Shown as a badge on every screen so the demo stays honest.">
            <div className="grid gap-2 sm:grid-cols-3">
              {(["LIVE", "REPLAY", "SCENARIO"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => act(`mode-${m}`, { action: "mode", mode: m })}
                  aria-pressed={s?.mode === m}
                  className={`rounded-2xl border p-3 text-left ${s?.mode === m ? "border-ink bg-ink text-paper" : "border-line bg-card"}`}
                >
                  <span className="block font-bold">{m}</span>
                  <span className={`text-xs ${s?.mode === m ? "text-paper/80" : "text-ink-soft"}`}>
                    {m === "LIVE" ? "Real Ring Playground API" : m === "REPLAY" ? "Recorded Playground responses" : "Timed synthetic events"}
                  </span>
                </button>
              ))}
            </div>
            {s && (
              <dl className="mt-3 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                <Row k="Ring token" v={s.ring.hasToken ? `${s.ring.tokenSource}${s.ring.expired ? " · EXPIRED" : ""}${s.ring.pastedAt ? ` · pasted ${ago(s.ring.pastedAt)}` : ""}` : "none"} />
                <Row
                  k="Bedrock"
                  v={`${
                    s.bedrock.status === "ok"
                      ? "REAL · working"
                      : s.bedrock.status === "mock"
                        ? "OFF · no AWS credentials or BEDROCK_MOCK=1 · sample captions"
                        : s.bedrock.status === "unavailable"
                          ? `UNAVAILABLE · sample captions · retry ${s.bedrock.nextRetryAt ? new Date(s.bedrock.nextRetryAt).toLocaleTimeString() : "soon"}`
                          : "REAL · not called yet"
                  } · ${s.bedrock.model} @ ${s.bedrock.region}`}
                />
                <Row k="Bedrock usage" v={`${s.bedrock.calls} calls · ${s.bedrock.inputTokens.toLocaleString()} in / ${s.bedrock.outputTokens.toLocaleString()} out tokens`} />
                {s.replay && <Row k="Replay data" v={`${s.replay.synthetic ? "placeholder" : "recorded"} ${new Date(s.replay.recordedAt).toLocaleString()} · ${s.replay.eventCount} events`} />}
                {s.bedrock.lastError && s.bedrock.status !== "ok" && <Row k="Last Bedrock error" v={s.bedrock.lastError} />}
              </dl>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              {s?.mode === "LIVE" && <Small onClick={() => act("poll", { action: "poll-live" })}>Poll Ring now</Small>}
              {s?.mode === "REPLAY" && <Small onClick={() => act("reload", { action: "reload-replay" })}>Reload fixtures</Small>}
              {s?.bedrock.status === "unavailable" && <Small onClick={() => act("bedrock", { action: "retry-bedrock" })}>Retry Bedrock now</Small>}
              <Small onClick={() => act("reset", { action: "reset" })}>Reset all state</Small>
            </div>
          </Panel>

          <Panel title="2 · Scenarios" note="The Playground doesn't deliver webhooks, so scenarios inject labelled, simulated events on a fast clock.">
            <div className="mb-3 flex flex-wrap items-center gap-2" role="group" aria-label="Playback speed">
              <span className="text-sm text-ink-soft">Speed</span>
              {SPEEDS.map((x) => (
                <button
                  key={x}
                  onClick={() => {
                    setSpeed(x);
                    if (s?.scenario) act("speed", { action: "speed", speed: x });
                  }}
                  aria-pressed={speed === x}
                  className={`rounded-full px-3 py-1 text-sm font-bold ${speed === x ? "bg-ink text-paper" : "border border-line bg-card"}`}
                >
                  {x}×
                </button>
              ))}
            </div>
            <ul className="grid gap-3 md:grid-cols-2">
              {data?.scenarios.map((sc) => {
                const running = s?.scenario?.id === sc.id;
                return (
                  <li key={sc.id} className={`rounded-2xl border p-4 ${running ? "border-sky bg-sky-soft" : "border-line bg-card"}`}>
                    <p className="font-bold">{sc.title}</p>
                    <p className="mt-1 text-sm text-ink-soft">{sc.summary}</p>
                    <p className="mt-1 text-xs text-ink-soft">
                      <code>{sc.id}</code> · {sc.startTime}–{sc.endTime} · {sc.events} events
                    </p>
                    <button
                      onClick={() => act(`start-${sc.id}`, { action: "start", scenarioId: sc.id, speed })}
                      disabled={!!busy}
                      className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-1.5 text-sm font-bold text-paper disabled:opacity-50"
                    >
                      <PlayIcon className="h-4 w-4" /> {running ? "Restart" : "Play"} at {speed}×
                    </button>
                  </li>
                );
              })}
            </ul>
          </Panel>

          {s?.scenario && (
            <Panel title={`Now playing · ${s.scenario.title}`}>
              <div className="flex flex-wrap items-center gap-4">
                <p className="font-display text-4xl tabular-nums">{s.nowLabel}</p>
                <p className="text-sm text-ink-soft">
                  simulated · {s.scenario.speed}× · {s.scenario.playing ? "playing" : s.scenario.progress >= 1 ? "finished" : "paused"}
                </p>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(s.scenario.progress * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Scenario progress">
                <div className="h-full bg-sky transition-all" style={{ width: `${s.scenario.progress * 100}%` }} />
              </div>
              <p className="mt-1 flex justify-between text-xs text-ink-soft">
                <span>{s.scenario.startLabel}</span>
                <span>{s.scenario.endLabel}</span>
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {s.scenario.playing ? (
                  <Small onClick={() => act("pause", { action: "pause" })}>
                    <PauseIcon className="h-4 w-4" /> Pause
                  </Small>
                ) : (
                  <Small onClick={() => act("resume", { action: "resume" })}>
                    <PlayIcon className="h-4 w-4" /> Resume
                  </Small>
                )}
                <Small onClick={() => act("skip30", { action: "skip", minutes: 30 })}>+30 min</Small>
                <Small onClick={() => act("skip120", { action: "skip", minutes: 120 })}>+2 h</Small>
                <Small onClick={() => act("stop", { action: "stop" })}>Stop &amp; clear</Small>
              </div>
              <p className="mt-3 text-sm">
                <b>{s.status.headline}</b> · {s.timeline.length} events · {s.activeAlertCount} active alerts
                {s.digestReady && " · digest written"}
              </p>
            </Panel>
          )}

          <Panel title="Ring API log" note="Most recent Partner API calls made by the server (token never logged).">
            {data?.apiLog.length ? (
              <ul className="max-h-56 space-y-1 overflow-auto font-mono text-xs">
                {data.apiLog.map((l, i) => (
                  <li key={i} className={l.status >= 400 || l.status === 0 ? "text-rose" : "text-ink-soft"}>
                    {new Date(l.created_at).toLocaleTimeString()} {l.method} {l.path} → {l.status} ({l.ms} ms){l.note ? ` · ${l.note}` : ""}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-soft">No live calls yet.</p>
            )}
          </Panel>
        </div>

        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="mb-3 flex gap-2" role="group" aria-label="Preview">
            {(["phone", "tv", "none"] as const).map((f) => (
              <button key={f} onClick={() => setFrame(f)} aria-pressed={frame === f} className={`rounded-full px-3 py-1 text-sm font-bold ${frame === f ? "bg-ink text-paper" : "border border-line bg-card"}`}>
                {f === "phone" ? "Ada’s phone" : f === "tv" ? "Grace’s TV" : "Hide"}
              </button>
            ))}
          </div>
          {frame === "phone" && (
            <div className="rounded-[2.6rem] border-[10px] border-ink bg-ink shadow-2xl">
              <iframe src="/" title="Doorstep on a phone" className="h-[780px] w-[375px] rounded-[1.9rem] bg-paper" />
            </div>
          )}
          {frame === "tv" && (
            <div className="rounded-xl border-[10px] border-ink bg-ink shadow-2xl">
              <iframe src="/tv" title="Doorstep visual doorbell on TV" className="aspect-video w-[min(720px,90vw)] bg-black" />
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-card p-5">
      <h2 className="font-bold">{title}</h2>
      {note && <p className="mb-3 text-sm text-ink-soft">{note}</p>}
      <div className={note ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

function Small({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-sm font-bold">
      {children}
    </button>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <dt className="shrink-0 text-ink-soft">{k}:</dt>
      <dd className="min-w-0 break-words">{v}</dd>
    </div>
  );
}

function ago(ms: number) {
  const m = Math.round((Date.now() - ms) / 60000);
  return m < 1 ? "just now" : `${m} min ago`;
}
