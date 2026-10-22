"use client";

import { useEffect, useState } from "react";
import { postJson } from "./state";

const SEEN_KEY = "doorstep.intro.dismissed";
const BANNER_KEY = "doorstep.story.dismissed";

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}
function writeFlag(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    /* private mode: fine, it just shows again */
  }
}

/** First-visit explainer shown above the app: what Doorstep is, in five seconds. */
export function Explainer({ parentName, onLoaded }: { parentName: string; onLoaded: () => void | Promise<void> }) {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => setShow(!readFlag(SEEN_KEY)), []);
  if (!show) return null;

  const seeDay = async () => {
    setBusy(true);
    try {
      await postJson("/api/demo", { action: "showcase" });
      writeFlag(SEEN_KEY);
      await onLoaded();
      setShow(false);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setBusy(false);
    }
  };

  const steps = [
    { n: "1", title: "Ring sees the door", text: "Every visitor, delivery and doorbell press at the front door." },
    { n: "2", title: "Doorstep checks the care plan", text: `Was the carer on time? Is a parcel left out? Is it late at night?` },
    { n: "3", title: "You get a calm alert", text: "Only when something’s off, with the picture and what you can do about it." },
  ];

  return (
    <section aria-labelledby="intro-title" className="animate-rise mb-8 overflow-hidden rounded-2xl bg-hero text-on-hero">
      <div className="p-6 sm:p-8">
        <h2 id="intro-title" className="text-2xl font-bold leading-tight sm:text-3xl">
          Doorstep watches your parent&rsquo;s front door through Ring, and tells you only when something&rsquo;s wrong.
        </h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-3 sm:block">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">{s.n}</span>
              <span className="sm:mt-3 sm:block">
                <span className="block font-bold">{s.title}</span>
                <span className="block text-sm text-on-hero/80">{s.text}</span>
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={seeDay} disabled={busy} className="rounded-full bg-accent px-6 py-3 font-bold text-on-accent disabled:opacity-60">
            {busy ? "Loading…" : `See ${parentName}’s day`}
          </button>
          <button
            onClick={() => {
              writeFlag(SEEN_KEY);
              setShow(false);
            }}
            className="text-sm font-bold text-on-hero/85 underline underline-offset-2"
          >
            Skip intro
          </button>
          <a href="/onboarding" className="text-sm font-bold text-on-hero/85 underline underline-offset-2">
            Set it up for your family
          </a>
        </div>
      </div>
    </section>
  );
}

/** Slim, dismissible story banner shown inside the app. */
export function StoryBanner({ parentName, familyName }: { parentName: string; familyName: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!readFlag(BANNER_KEY)), []);
  if (!show) return null;
  return (
    <div role="note" className="flex items-start gap-3 border-b border-line bg-sky-soft px-4 py-2 text-sm text-ink md:px-10">
      <p className="flex-1">
        <b>Demo:</b> {familyName} looks after her mum {parentName}, who lives alone. These are {parentName}&rsquo;s front-door events.
      </p>
      <button
        onClick={() => {
          writeFlag(BANNER_KEY);
          setShow(false);
        }}
        className="shrink-0 rounded-full px-2 font-bold text-ink-soft hover:text-ink"
        aria-label="Dismiss the demo explanation"
      >
        ✕
      </button>
    </div>
  );
}

export function PageIntro({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <header>
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-2 text-ink-soft">{subtitle}</p>
    </header>
  );
}
