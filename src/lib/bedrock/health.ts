// Bedrock availability tracking. Real Bedrock is always the default path; when calls fail
// (e.g. an account quota provisioned at 0), Doorstep shows clearly labelled sample captions and
// retries Bedrock after a cooldown. The first successful call flips everything back to real
// captions, and sample captions are re-described in the background.

import { bedrockMock } from "../config";
import { getSetting, setSetting } from "../db";

export type BedrockStatus = "mock" | "unknown" | "ok" | "unavailable";

export interface BedrockHealth {
  status: Exclude<BedrockStatus, "mock">;
  lastError: string | null;
  lastErrorName: string | null;
  lastFailureAt: number | null;
  lastOkAt: number | null;
  nextRetryAt: number;
}

const KEY = "bedrock_health";
const INITIAL: BedrockHealth = {
  status: "unknown",
  lastError: null,
  lastErrorName: null,
  lastFailureAt: null,
  lastOkAt: null,
  nextRetryAt: 0,
};

/** Errors that won't fix themselves in seconds: wait longer before probing again. */
const SLOW_RETRY = new Set([
  "AccessDeniedException",
  "ServiceQuotaExceededException",
  "ValidationException",
  "ResourceNotFoundException",
  "UnrecognizedClientException",
  "ExpiredTokenException",
  "CredentialsProviderError",
]);

export function getBedrockHealth(): BedrockHealth {
  return { ...INITIAL, ...getSetting<Partial<BedrockHealth>>(KEY, {}) };
}

/** Which path the next caption should take. */
export function bedrockStatus(now = Date.now()): BedrockStatus {
  if (bedrockMock()) return "mock";
  const h = getBedrockHealth();
  if (h.status === "unavailable" && now < h.nextRetryAt) return "unavailable";
  return h.status === "unavailable" ? "unknown" : h.status; // cooldown over → probe
}

export function recordBedrockSuccess(): void {
  const h = getBedrockHealth();
  setSetting(KEY, { ...h, status: "ok", lastOkAt: Date.now(), nextRetryAt: 0 });
}

export function recordBedrockFailure(err: unknown): BedrockHealth {
  const name = errorName(err);
  const message = errorMessage(err);
  // "Too many tokens per day" is a daily quota (we hit it at 0 provisioned) — back off for longer.
  const daily = /per day/i.test(message);
  const cooldown = daily ? 10 * 60_000 : SLOW_RETRY.has(name) ? 5 * 60_000 : name === "ThrottlingException" ? 2 * 60_000 : 60_000;
  const next: BedrockHealth = {
    ...getBedrockHealth(),
    status: "unavailable",
    lastError: message,
    lastErrorName: name,
    lastFailureAt: Date.now(),
    nextRetryAt: Date.now() + cooldown,
  };
  setSetting(KEY, next);
  return next;
}

/** Force an immediate re-probe (used by the demo panel). */
export function resetBedrockHealth(): void {
  setSetting(KEY, INITIAL);
}

export function errorName(err: unknown): string {
  if (err && typeof err === "object" && "name" in err && typeof err.name === "string") return err.name;
  return "Error";
}

export function errorMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const meta = (err as { $metadata?: { httpStatusCode?: number; requestId?: string } }).$metadata;
  const bits = [`${err.name}: ${err.message}`];
  if (meta?.httpStatusCode) bits.push(`HTTP ${meta.httpStatusCode}`);
  if (meta?.requestId) bits.push(`request ${meta.requestId}`);
  return bits.join(" · ");
}
