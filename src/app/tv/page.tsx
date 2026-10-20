"use client";

// Web preview of the Fire TV "visual doorbell" (the Vega app in /tv mirrors this screen).
// 10-foot UI: huge type, high contrast, safe-area margins; OK/Enter dismisses; auto-clears after 60 s.
import { useCallback, useEffect, useRef, useState } from "react";

type TvFeed = {
  parentName: string;
  mode: string;
  nowLabel: string;
  dateLabel: string;
  status: { level: "calm" | "attention" | "urgent"; headline: string; sub: string };
  atDoor: null | { id: string; kind: string; time: string; sentence: string | null; simulated: boolean; snapshotUrl: string | null };
};

const KIND_TITLE: Record<string, string> = {
  ding: "Someone rang the doorbell",
  person: "Someone is at the door",
  package: "A package is at the door",
};

export default function TvScreen() {
  const [feed, setFeed] = useState<TvFeed | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [shownAt, setShownAt] = useState<number | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/tv", { cache: "no-store" });
      if (r.ok) setFeed(await r.json());
    } catch {
      /* keep last state */
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 1000);
    return () => clearInterval(t);
  }, [load]);

  const alert = feed?.atDoor && !dismissed.has(feed.atDoor.id) ? feed.atDoor : null;

  useEffect(() => {
    if (alert) {
      setShownAt(Date.now());
      btn.current?.focus();
    }
  }, [alert?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const dismiss = useCallback(() => {
    if (alert) setDismissed((d) => new Set(d).add(alert.id));
  }, [alert]);

  // Auto-clear after 60 seconds.
  useEffect(() => {
    if (!alert || !shownAt) return;
    const t = setTimeout(dismiss, Math.max(0, 60_000 - (Date.now() - shownAt)));
    return () => clearTimeout(t);
  }, [alert, shownAt, dismiss]);

  return (
    <main
      id="main"
      className="fixed inset-0 overflow-hidden bg-[#14120f] text-[#f6efe3]"
      style={{ fontFamily: "var(--font-sans)" }}
      onKeyDown={(e) => (e.key === "Enter" || e.key === "Escape" || e.key === " ") && dismiss()}
    >
      <div className="absolute inset-0 flex flex-col p-[5vh_5vw]">
        {!alert ? (
          <Idle feed={feed} />
        ) : (
          <section role="alertdialog" aria-labelledby="tv-title" aria-describedby="tv-desc" className="flex flex-1 items-center gap-[4vw]">
            <div className="flex-1">
              <p className="flex items-center gap-[1vw] text-[2.2vw] font-bold uppercase tracking-[0.2em] text-[#ffd27a]">
                <span className="inline-block h-[1.6vw] w-[1.6vw] animate-pulse rounded-full bg-[#ffd27a]" aria-hidden />
                Front door · {alert.time}
                {alert.simulated && <span className="rounded-full bg-[#2c3e4c] px-[1vw] text-[1.4vw] tracking-normal text-[#bcd9ee]">simulated</span>}
              </p>
              <h1 id="tv-title" className="mt-[2vh] font-display text-[6vw] leading-[1.05]">
                {KIND_TITLE[alert.kind] ?? "Activity at the door"}
              </h1>
              <p id="tv-desc" className="mt-[3vh] max-w-[46vw] text-[2.8vw] leading-snug text-[#e9dfcf]">
                {alert.sentence ?? "Looking at the camera…"}
              </p>
              <button
                ref={btn}
                onClick={dismiss}
                className="mt-[5vh] rounded-[1.2vw] bg-[#f6efe3] px-[3vw] py-[1.6vh] text-[2.4vw] font-bold text-[#14120f] outline-none ring-[#ffd27a] ring-offset-4 ring-offset-[#14120f] focus:ring-[0.5vw]"
              >
                OK — got it
              </button>
              <p className="mt-[2vh] text-[1.6vw] text-[#b9ad9b]">Press OK on the remote to dismiss · clears by itself in a minute</p>
            </div>
            {alert.snapshotUrl && (
              // Uncropped: keeps Ring's watermark visible.
              <img src={alert.snapshotUrl} alt="" className="aspect-video w-[40vw] rounded-[1.5vw] bg-black object-contain ring-[0.3vw] ring-[#ffd27a]" />
            )}
          </section>
        )}
      </div>
    </main>
  );
}

function Idle({ feed }: { feed: TvFeed | null }) {
  const calm = feed?.status.level === "calm";
  return (
    <section className="flex flex-1 flex-col justify-between">
      <p className="text-[2vw] text-[#b9ad9b]">Doorstep · {feed?.parentName ?? ""}&rsquo;s front door</p>
      <div>
        <p className="font-display text-[9vw] leading-none tabular-nums">{feed?.nowLabel ?? "--:--"}</p>
        <p className="mt-[1vh] text-[2.6vw] text-[#e9dfcf]">{feed?.dateLabel}</p>
      </div>
      <p className="flex items-center gap-[1vw] text-[2.2vw]">
        <span className={`inline-block h-[1.4vw] w-[1.4vw] rounded-full ${calm ? "bg-[#a5c9a7]" : "bg-[#eab676]"}`} aria-hidden />
        {calm ? "All quiet at the door" : "Doorstep has a note for the family"}
        {feed?.mode === "SCENARIO" && <span className="text-[1.6vw] text-[#b9ad9b]">· simulated day</span>}
      </p>
    </section>
  );
}
