"use client";

import { useEffect, useRef, useState } from "react";
import { EyeIcon } from "./icons";

type Phase = "idle" | "connecting" | "live" | "error";

/**
 * "Look now": a WebRTC live view of the Ring camera via WHEP. The browser makes a receive-only
 * offer; our server forwards it to Ring with the token and returns the answer. Video only shows
 * when Ring actually streams — nothing is simulated here.
 */
export function LookNow() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const pc = useRef<RTCPeerConnection | null>(null);
  const session = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = async () => {
    if (timer.current) clearTimeout(timer.current);
    pc.current?.close();
    pc.current = null;
    if (video.current) video.current.srcObject = null;
    if (session.current) {
      const s = session.current;
      session.current = null;
      await fetch(`/api/ring/live?session=${encodeURIComponent(s)}`, { method: "DELETE" }).catch(() => undefined);
    }
    setPhase("idle");
  };

  useEffect(() => () => void stop(), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async () => {
    setError(null);
    setPhase("connecting");
    // Whatever happens, give up cleanly after 20 s.
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (!video.current?.srcObject || !video.current.videoWidth) {
        pc.current?.close();
        pc.current = null;
        setError("Couldn’t open the live view within 20 seconds. The camera or the Ring token may be unavailable. Try again later.");
        setPhase("error");
      }
    }, 20_000);
    // Let React paint the loading state before any WebRTC setup work.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    try {
      const conn = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pc.current = conn;
      conn.addTransceiver("video", { direction: "recvonly" });
      conn.addTransceiver("audio", { direction: "recvonly" });
      const stream = new MediaStream();
      conn.ontrack = (ev) => {
        stream.addTrack(ev.track);
        if (video.current) {
          video.current.srcObject = stream;
          void video.current.play().catch(() => undefined);
        }
        setPhase("live");
        if (timer.current) clearTimeout(timer.current);
      };
      conn.onconnectionstatechange = () => {
        if (conn.connectionState === "failed") {
          setError("The live view connection failed (network or Ring ended the session).");
          setPhase("error");
        }
      };
      await conn.setLocalDescription(await conn.createOffer());
      // Non-trickle WHEP: wait briefly for ICE gathering so the offer carries candidates.
      await new Promise<void>((resolve) => {
        if (conn.iceGatheringState === "complete") return resolve();
        const t = setTimeout(resolve, 2500);
        conn.onicegatheringstatechange = () => {
          if (conn.iceGatheringState === "complete") {
            clearTimeout(t);
            resolve();
          }
        };
      });
      const res = await fetch("/api/ring/live", {
        method: "POST",
        headers: { "Content-Type": "application/sdp" },
        body: conn.localDescription!.sdp,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Ring refused the live view (${res.status})`);
      }
      session.current = res.headers.get("X-Session-Id") || null;
      await conn.setRemoteDescription({ type: "answer", sdp: await res.text() });
    } catch (e) {
      if (timer.current) clearTimeout(timer.current);
      const msg = e instanceof Error ? e.message : String(e);
      setError(/abort|timeout/i.test(msg) ? "Ring didn’t answer in time. Try again in a moment." : msg);
      setPhase("error");
      pc.current?.close();
      pc.current = null;
    }
  };

  return (
    <section aria-labelledby="look-title" className="rounded-3xl border border-line bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="look-title" className="font-display text-xl">
            Look now
          </h2>
          <p className="text-sm text-ink-soft">Open a live view from the Ring camera to check the door right now.</p>
        </div>
        {phase === "idle" || phase === "error" ? (
          <button onClick={start} className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper">
            <EyeIcon className="h-4 w-4" /> {phase === "error" ? "Try again" : "Look now"}
          </button>
        ) : (
          <button onClick={stop} className="rounded-full border border-line bg-card px-4 py-2 text-sm font-bold">
            {phase === "connecting" ? "Cancel" : "Close live view"}
          </button>
        )}
      </div>
      {(phase === "connecting" || phase === "live") && (
        <div className="relative mt-3">
          {/* Uncropped: Ring watermarks live video too. */}
          <video ref={video} muted autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black object-contain" aria-label="Live view from the Ring camera" />
          {phase === "connecting" && (
            <p role="status" className="absolute inset-0 grid place-items-center text-sm text-white">
              Connecting to Ring…
            </p>
          )}
        </div>
      )}
      {phase === "live" && (
        // Outside the frame, so it never covers Ring's watermark.
        <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-rose">
          <span className="h-2 w-2 animate-pulse rounded-full bg-rose" aria-hidden /> Live from the Ring camera
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-rose">
          {error}
        </p>
      )}
    </section>
  );
}
