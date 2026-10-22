"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CarePlanForm } from "@/components/CarePlanForm";
import { CheckIcon, DoorIcon, HeartIcon } from "@/components/icons";
import { postJson } from "@/components/state";

type Device = { id: string; name: string; online: boolean | null };
const STEPS = ["Welcome", "Connect Ring", "Care plan"] as const;

export default function Onboarding() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [token, setToken] = useState("");
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [publicDemo, setPublicDemo] = useState(false);
  useEffect(() => {
    fetch("/api/state")
      .then((r) => r.json())
      .then((d: { publicDemo?: boolean }) => setPublicDemo(!!d.publicDemo))
      .catch(() => undefined);
  }, []);

  const connect = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await postJson<{ devices: Device[] }>("/api/ring/token", { token });
      setDevices(res.devices);
      setToken("");
      await postJson("/api/demo", { action: "mode", mode: "LIVE" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    await postJson("/api/onboarding");
    router.replace("/");
  };

  return (
    <main id="main" className="mx-auto min-h-dvh max-w-2xl px-4 py-8 sm:py-14">
      <div className="flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-hero text-accent ring-1 ring-line">
          <DoorIcon className="h-5 w-5" />
        </span>
        <span className="font-display text-2xl">Doorstep</span>
      </div>

      <ol className="mt-8 flex gap-2" aria-label="Setup progress">
        {STEPS.map((s, i) => (
          <li key={s} className="flex-1" aria-current={i === step ? "step" : undefined}>
            <div className={`h-1.5 rounded-full ${i <= step ? "bg-brand" : "bg-line"}`} />
            <p className={`mt-1.5 text-xs ${i === step ? "font-bold text-ink" : "text-ink-soft"}`}>{s}</p>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <section className="animate-rise mt-10 space-y-6">
          <h1 className="font-display text-4xl leading-tight sm:text-5xl">Know your mum or dad&rsquo;s day is going normally — without watching a camera.</h1>
          <p className="text-lg text-ink-soft">
            Doorstep turns their Ring doorbell&rsquo;s events into calm, plain sentences, and only speaks up when something doesn&rsquo;t fit
            the day you&rsquo;d expect: a quiet morning, a missed carer visit, a parcel left out, a ring at midnight.
          </p>
          <ul className="space-y-3">
            {[
              "No face recognition, ever. Doorstep says “someone came”, never who.",
              "Ring snapshots are shown whole, with Ring’s watermark intact.",
              "Your Ring token stays on the server; your browser never sees it.",
            ].map((t) => (
              <li key={t} className="flex gap-3">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-sage-soft text-sage">
                  <CheckIcon className="h-4 w-4" />
                </span>
                {t}
              </li>
            ))}
          </ul>
          <button onClick={() => setStep(1)} className="rounded-full bg-ink px-6 py-3 font-bold text-paper">
            Get started
          </button>
        </section>
      )}

      {step === 1 && (
        <section className="animate-rise mt-10 space-y-6">
          <h1 className="font-display text-4xl">Connect Ring</h1>
          <div className="rounded-2xl border border-line bg-card p-5 sm:p-6">
            <h2 className="font-bold">Developer Playground token</h2>
            <p className="mt-1 text-ink-soft">
              For this hackathon build, paste a token from the Ring Developer Playground. It lasts about 30 minutes; Doorstep checks it
              against <code className="rounded bg-paper px-1">GET /v1/devices</code> and keeps it on the server.
            </p>
            {publicDemo ? (
              <p className="mt-4 rounded-xl bg-sky-soft px-4 py-3 text-sm">
                Connecting a Ring account is turned off in this public demo. It uses recorded Ring data and example days instead.
              </p>
            ) : !devices ? (
              <form onSubmit={connect} className="mt-4 flex flex-col gap-2 sm:flex-row">
                <label htmlFor="ob-token" className="sr-only">
                  Ring access token
                </label>
                <input
                  id="ob-token"
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Paste access token"
                  className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2.5"
                />
                <button disabled={busy || token.length < 20} className="rounded-xl bg-ink px-5 py-2.5 font-bold text-paper disabled:opacity-50">
                  {busy ? "Checking…" : "Connect"}
                </button>
              </form>
            ) : (
              <div className="mt-4">
                <p className="flex items-center gap-2 font-bold text-sage">
                  <CheckIcon /> Connected — {devices.length} camera{devices.length === 1 ? "" : "s"} found
                </p>
                <ul className="mt-2 space-y-1 text-ink-soft">
                  {devices.map((d) => (
                    <li key={d.id}>
                      {d.name} {d.online === false ? "(offline)" : ""}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-sm text-ink-soft">You can pick which one is the front door in the next step.</p>
              </div>
            )}
            {error && (
              <p role="alert" className="mt-3 text-rose">
                {error}
              </p>
            )}
          </div>

          <details className="rounded-2xl border border-line bg-card p-5 sm:p-6">
            <summary className="cursor-pointer font-bold">How this works in production</summary>
            <p className="mt-2 text-ink-soft">
              A shipped Doorstep would use Ring&rsquo;s OAuth account linking: the family member taps &ldquo;Log in with Ring&rdquo;, signs
              in to the parent&rsquo;s Ring account (with their permission), and Ring redirects back with a code that our server exchanges
              for an access token and a 30-day refresh token. Events would then arrive by signed webhooks instead of polling.
            </p>
          </details>

          <div className="flex flex-wrap items-center gap-3">
            <button onClick={() => setStep(2)} className="rounded-full bg-ink px-6 py-3 font-bold text-paper">
              {devices ? "Continue" : "Skip — use demo data"}
            </button>
            {!devices && <p className="text-sm text-ink-soft">You&rsquo;ll start on recorded Ring data; switch any time in the demo panel.</p>}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="animate-rise mt-10 space-y-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-sage-soft text-sage">
              <HeartIcon />
            </span>
            <h1 className="font-display text-4xl">Their normal day</h1>
          </div>
          <CarePlanForm submitLabel="Save and finish" onSaved={finish} />
          <p className="text-sm text-ink-soft">
            Or <button onClick={finish} className="font-bold underline">keep the defaults and finish</button>. You can change this later under{" "}
            <Link href="/care-plan" className="underline">Care plan</Link>.
          </p>
        </section>
      )}
    </main>
  );
}
