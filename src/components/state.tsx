"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AppState } from "@/lib/view";

type Ctx = {
  state: (AppState & { tickError: string | null }) | null;
  error: string | null;
  refresh: () => Promise<void>;
};

const StateContext = createContext<Ctx>({ state: null, error: null, refresh: async () => {} });

/** Polls /api/state: every second while a scenario plays, every 4 s otherwise; pauses in background tabs. */
export function StateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<Ctx["state"]>(null);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/state", { cache: "no-store" });
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setState(await res.json());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const loop = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!alive) return;
      const fast = stateRef.current?.scenario?.playing;
      timer.current = setTimeout(loop, fast ? 1000 : 4000);
    };
    loop();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      if (timer.current) clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  return <StateContext.Provider value={{ state, error, refresh }}>{children}</StateContext.Provider>;
}

export const useAppState = () => useContext(StateContext);

export async function postJson<T = unknown>(url: string, body?: unknown, method = "POST"): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error((data as { error?: string }).error ?? `Request failed (${res.status})`), { data });
  return data as T;
}
