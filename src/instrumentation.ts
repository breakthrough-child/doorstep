// Background poller entry. The node-only code lives in instrumentation-node.ts so the
// edge bundle never pulls in better-sqlite3 (NEXT_RUNTIME is inlined at build time).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
