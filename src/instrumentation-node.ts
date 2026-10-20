// Background poller: advances the scenario clock / polls Ring (LIVE) and runs
// description → rules → alerts even when nobody has the app open.
import { tick } from "./lib/pipeline";

declare global {
  // eslint-disable-next-line no-var
  var __doorstepPoller: NodeJS.Timeout | undefined;
}

if (process.env.DOORSTEP_POLLER !== "0" && !globalThis.__doorstepPoller) {
  const every = Number(process.env.POLLER_INTERVAL_MS ?? 1500);
  globalThis.__doorstepPoller = setInterval(() => {
    tick().catch((e) => console.warn("[poller]", e instanceof Error ? e.message : e));
  }, every);
  console.info(`[poller] running every ${every} ms`);
}
