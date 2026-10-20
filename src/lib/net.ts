// Node 20+ races IPv6/IPv4 with a 250 ms per-address connect timeout ("happy eyeballs").
// On slow or high-latency links (we hit this on a Lagos connection) every attempt times out and
// fetch fails with ETIMEDOUT even though the host is reachable. Give each attempt more time.
import net from "node:net";

const ms = Number(process.env.NET_FAMILY_ATTEMPT_TIMEOUT_MS ?? 2500);
if (typeof net.setDefaultAutoSelectFamilyAttemptTimeout === "function" && ms > 0) {
  net.setDefaultAutoSelectFamilyAttemptTimeout(ms);
}

export {};
