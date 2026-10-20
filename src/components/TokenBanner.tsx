"use client";

import { useState } from "react";
import { postJson, useAppState } from "./state";

/** "Token expired — paste a new Playground token" UX, shown in LIVE mode only. */
export function TokenBanner() {
  const { state, refresh } = useAppState();
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!state || state.mode !== "LIVE" || (state.ring.hasToken && !state.ring.expired)) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      await postJson("/api/ring/token", { token });
      setToken("");
      await refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-labelledby="token-title" className="mx-4 mt-4 rounded-2xl border border-amber/30 bg-amber-soft p-4 md:mx-10">
      <h2 id="token-title" className="font-bold text-amber">
        {state.ring.hasToken ? "Ring token expired — paste a new Playground token" : "Connect Ring to see live events"}
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Developer Playground tokens last about 30 minutes. Generate one in the Ring developer console, then paste it here. It stays on this
        server and is never sent to your browser again.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <label htmlFor="token-input" className="sr-only">
          Ring access token
        </label>
        <input
          id="token-input"
          type="password"
          autoComplete="off"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste access token"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2 text-ink"
        />
        <button disabled={busy || token.length < 20} className="rounded-xl bg-ink px-4 py-2 font-bold text-paper disabled:opacity-50">
          {busy ? "Checking…" : "Connect"}
        </button>
      </form>
      {msg && (
        <p role="alert" className="mt-2 text-sm text-rose">
          {msg}
        </p>
      )}
    </section>
  );
}
