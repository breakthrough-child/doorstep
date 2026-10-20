// Background poller: advances the scenario clock / polls Ring (LIVE) and runs
// description → rules → alerts even when nobody has the app open.
declare global {
  // eslint-disable-next-line no-var
  var __doorstepPoller: NodeJS.Timeout | undefined;
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.DOORSTEP_POLLER === "0") return;
  if (globalThis.__doorstepPoller) return;
  const { tick } = await import("./lib/pipeline");
  const every = Number(process.env.POLLER_INTERVAL_MS ?? 1500);
  globalThis.__doorstepPoller = setInterval(() => {
    tick().catch((e) => console.warn("[poller]", e instanceof Error ? e.message : e));
  }, every);
  console.info(`[poller] running every ${every} ms`);
}
