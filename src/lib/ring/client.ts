// Ring Partner API client. Server-side only: the token never reaches the browser.
// - Bearer auth against https://api.amazonvision.com
// - Retry with exponential backoff on 429/5xx (respects Retry-After)
// - 401 → RingTokenExpiredError so the UI can ask for a fresh Playground token
// - JSON:API normalization via ./normalize
// - Snapshot download handles the documented 303 → pre-signed URL hop explicitly

import "../net";
import type { DoorEvent } from "../types";
import type { Document } from "./jsonapi";
import { nextPageKey } from "./jsonapi";
import {
  normalizeDevices,
  normalizeHistoryEvents,
  type Device,
  type RingDeviceAttributes,
  type RingHistoryEventAttributes,
} from "./normalize";

export const RING_API_BASE = "https://api.amazonvision.com";

export class RingApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null,
    readonly path: string,
  ) {
    super(message);
    this.name = "RingApiError";
  }
}

/** 401 from Ring. Playground tokens last ~30 minutes. */
export class RingTokenExpiredError extends RingApiError {
  constructor(path: string) {
    super("Ring token expired or invalid — paste a new Playground token.", 401, "UNAUTHORIZED", path);
    this.name = "RingTokenExpiredError";
  }
}

export interface RingClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
  /** Injected for tests so backoff doesn't actually sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Called for each request (method, path, status, ms) — used for the debug log / recorder. */
  onRequest?: (info: { method: string; path: string; status: number; ms: number }) => void;
}

export interface Snapshot {
  bytes: Buffer;
  contentType: string;
  /** X-Media-Timestamp: when the frame was actually captured. */
  mediaTimestamp: number | null;
  /** X-Media-Origin: "recording" or "snapshot". */
  mediaOrigin: string | null;
}

export class RingClient {
  private readonly token: string;
  private readonly base: string;
  private readonly fetchImpl: typeof fetch;
  private readonly maxRetries: number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onRequest?: RingClientOptions["onRequest"];

  constructor(opts: RingClientOptions) {
    if (!opts.token?.trim()) throw new RingTokenExpiredError("(no token)");
    this.token = opts.token.trim();
    // RING_API_BASE lets tests and the recorder target a fake server; never needed in normal use.
    this.base = opts.baseUrl ?? process.env.RING_API_BASE ?? RING_API_BASE;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.maxRetries = opts.maxRetries ?? 3;
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.onRequest = opts.onRequest;
  }

  /** Low-level request with retry/backoff. Returns the raw Response (caller reads the body). */
  async request(method: "GET" | "POST", path: string, body?: unknown, extra?: RequestInit): Promise<Response> {
    let attempt = 0;
    for (;;) {
      const started = Date.now();
      const res = await this.fetchImpl(`${this.base}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.api+json, application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        cache: "no-store",
        ...extra,
      });
      this.onRequest?.({ method, path, status: res.status, ms: Date.now() - started });

      if (res.status === 401) throw new RingTokenExpiredError(path);
      const retryable = res.status === 429 || res.status === 500 || res.status === 503;
      if (retryable && attempt < this.maxRetries) {
        const retryAfter = Number(res.headers.get("retry-after"));
        const backoff = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
        attempt++;
        await res.body?.cancel().catch(() => undefined);
        await this.sleep(Math.min(backoff, 15_000) + Math.floor(Math.random() * 250));
        continue;
      }
      return res;
    }
  }

  private async json<T>(path: string): Promise<T> {
    const res = await this.request("GET", path);
    if (!res.ok) throw await toError(res, path);
    return (await res.json()) as T;
  }

  /** Raw device discovery document (used by the fixture recorder). */
  async getDevicesRaw(): Promise<Document<RingDeviceAttributes>> {
    return this.json(`/v1/devices?include=status,capabilities,configurations`);
  }

  async listDevices(): Promise<Device[]> {
    return normalizeDevices(await this.getDevicesRaw());
  }

  /** One page of event history (newest first). */
  async getEventHistoryPage(
    deviceId: string,
    opts: { pageKey?: string | null; eventTypes?: string[] } = {},
  ): Promise<Document<RingHistoryEventAttributes>> {
    const q = new URLSearchParams();
    if (opts.eventTypes?.length) q.set("event_types", opts.eventTypes.join(","));
    if (opts.pageKey) q.set("page[key]", opts.pageKey);
    const qs = q.toString();
    return this.json(`/v1/history/devices/${encodeURIComponent(deviceId)}/events${qs ? `?${qs}` : ""}`);
  }

  /**
   * Events since `sinceMs`, paginating newest-first until we pass the window.
   * The history API has no documented time-range filter (FRICTION_LOG F-01).
   */
  async listEventsSince(
    deviceId: string,
    sinceMs: number,
    opts: { maxPages?: number; onPage?: (doc: Document<RingHistoryEventAttributes>) => void } = {},
  ): Promise<DoorEvent[]> {
    const maxPages = opts.maxPages ?? 10;
    const out: DoorEvent[] = [];
    let pageKey: string | null = null;
    for (let page = 0; page < maxPages; page++) {
      const doc = await this.getEventHistoryPage(deviceId, { pageKey });
      opts.onPage?.(doc);
      const events = normalizeHistoryEvents(doc, deviceId, "live");
      out.push(...events.filter((e) => e.startMs >= sinceMs));
      const oldest = events.reduce((m, e) => Math.min(m, e.startMs), Infinity);
      pageKey = nextPageKey(doc);
      if (!pageKey || oldest < sinceMs) break;
    }
    return out;
  }

  /**
   * Download a JPEG snapshot at (or near) a timestamp. The API answers 303 with a pre-signed
   * Location; we follow it manually and without the Bearer header (FRICTION_LOG F-07).
   */
  async getSnapshot(
    deviceId: string,
    timestampMs: number,
    opts: { componentId?: string } = {},
  ): Promise<Snapshot> {
    const path = `/v1/devices/${encodeURIComponent(deviceId)}/media/image/download`;
    const body = {
      type: "at_timestamp",
      timestamp: Math.min(Math.round(timestampMs), Date.now()),
      // Ask for 1920×1080 explicitly: the Playground returns 640×360 when resolution is omitted
      // (docs say omitting gives full size — FRICTION F-10). Full size keeps the fixed-size
      // watermark smallest relative to the frame.
      image_options: { format: "jpeg", resolution: { width: 1920, height: 1080 } },
      ...(opts.componentId ? { components: [{ component_id: opts.componentId }] } : {}),
    };
    const res = await this.request("POST", path, body, { redirect: "manual" });
    let media: Response;
    if (res.status === 303 || res.status === 302 || res.status === 307) {
      const location = res.headers.get("location");
      if (!location) throw new RingApiError("Snapshot redirect without Location header", res.status, null, path);
      media = await this.fetchImpl(location, { cache: "no-store" });
      // The pre-signed host can fail too (e.g. 416 no media, 422 GRECO_NO_VALID_KEY) with a JSON:API body.
      if (!media.ok) throw await toError(media, `${path} (pre-signed download)`);
    } else if (res.ok) {
      media = res; // Some environments may return the bytes directly.
    } else {
      throw await toError(res, path);
    }
    const ts = Number(media.headers.get("x-media-timestamp") ?? res.headers.get("x-media-timestamp"));
    return {
      bytes: Buffer.from(await media.arrayBuffer()),
      contentType: media.headers.get("content-type") ?? "image/jpeg",
      mediaTimestamp: Number.isFinite(ts) && ts > 0 ? ts : null,
      mediaOrigin: media.headers.get("x-media-origin") ?? res.headers.get("x-media-origin"),
    };
  }
}

async function toError(res: Response, path: string): Promise<RingApiError> {
  let code: string | null = null;
  let detail = res.statusText || `HTTP ${res.status}`;
  try {
    const body = (await res.json()) as Document;
    const e = body.errors?.[0];
    if (e) {
      code = e.code ?? null;
      detail = e.detail ?? e.title ?? detail;
    }
  } catch {
    /* non-JSON error body */
  }
  return new RingApiError(`Ring API ${res.status} on ${path}: ${detail}`, res.status, code, path);
}
