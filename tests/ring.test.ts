import { describe, expect, it, vi } from "vitest";
import { indexIncluded, nextPageKey, resolveMany, resolveOne, type Document } from "@/lib/ring/jsonapi";
import { mapEventKind, normalizeDevices, normalizeHistoryEvents } from "@/lib/ring/normalize";
import { RingApiError, RingClient, RingTokenExpiredError } from "@/lib/ring/client";
import playgroundDevices from "../fixtures/playground/devices.json";
import playgroundHistory from "../fixtures/playground/history-0-0.json";

describe("JSON:API helpers", () => {
  const doc: Document = {
    data: [
      {
        type: "devices",
        id: "a",
        relationships: {
          status: { data: { type: "device-status", id: "a" } },
          tags: { data: [{ type: "tag", id: "1" }, { type: "tag", id: "missing" }] },
          location: { links: { related: "/v1/devices/a/location" } },
        },
      },
    ],
    included: [
      { type: "device-status", id: "a", attributes: { online: true } },
      { type: "tag", id: "1", attributes: {} },
      // Same id, different type must not collide.
      { type: "device-capabilities", id: "a", attributes: { video: {} } },
    ],
  };

  it("resolves to-one relationships by type + id", () => {
    const idx = indexIncluded(doc);
    const dev = (doc.data as NonNullable<Document["data"]> & unknown[])[0] as never;
    expect(resolveOne(dev, "status", idx)?.attributes).toEqual({ online: true });
  });

  it("returns null for unrequested relationships that only carry links", () => {
    const idx = indexIncluded(doc);
    const dev = (doc.data as unknown[])[0] as never;
    expect(resolveOne(dev, "location", idx)).toBeNull();
    expect(resolveOne(dev, "nope", idx)).toBeNull();
  });

  it("skips missing members in to-many relationships", () => {
    const idx = indexIncluded(doc);
    const dev = (doc.data as unknown[])[0] as never;
    expect(resolveMany(dev, "tags", idx).map((r) => r.id)).toEqual(["1"]);
  });

  it("extracts the page[key] cursor from links.next", () => {
    expect(nextPageKey({ links: { next: "/v1/history/devices/x/events?page[key]=2026-10-20T10:00:00Z" } })).toBe(
      "2026-10-20T10:00:00Z",
    );
    expect(nextPageKey({ links: {} })).toBeNull();
    expect(nextPageKey({})).toBeNull();
  });
});

describe("device normalization", () => {
  it("reads online/caps/config from included resources, not device attributes", () => {
    // Real Ring Developer Playground response: included resources have their own ids
    // (ava1.ring.device.status.…), resolved via the relationship's data.id.
    const [d] = normalizeDevices(playgroundDevices as never);
    expect(d).toMatchObject({
      name: "Playground Device",
      online: true,
      privacyZoneCount: 0,
      e2eEncrypted: false,
      maxResolution: 1080,
    });
    expect(d?.id).toMatch(/^ava1\.ring\.device\./);
  });

  it("leaves online null when status wasn't included", () => {
    const [d] = normalizeDevices({ data: [{ type: "devices", id: "x", attributes: { name: "  " } }] });
    expect(d?.online).toBeNull();
    expect(d?.name).toBe("Ring camera");
  });

  it("treats e2e_encryption.enabled as a JSON boolean only", () => {
    const mk = (enabled: unknown): Document =>
      ({
        data: [{ type: "devices", id: "x", relationships: { configurations: { data: { type: "device-configurations", id: "x" } } } }],
        included: [{ type: "device-configurations", id: "x", attributes: { e2e_encryption: { enabled } } }],
      }) as Document;
    expect(normalizeDevices(mk(true) as never)[0]?.e2eEncrypted).toBe(true);
    expect(normalizeDevices(mk("true") as never)[0]?.e2eEncrypted).toBe(false);
  });

  it("lists multi-camera components", () => {
    const doc = {
      data: [{ type: "devices", id: "x", relationships: { capabilities: { data: { type: "device-capabilities", id: "x" } } } }],
      included: [
        {
          type: "device-capabilities",
          id: "x",
          attributes: { components: { items: [{ component_id: "1", component_type: "lens", component_name: "View 1" }] } },
        },
      ],
    };
    expect(normalizeDevices(doc as never)[0]?.components).toEqual([{ id: "1", name: "View 1" }]);
  });
});

describe("event kind mapping", () => {
  it.each([
    ["ding", null, "ding"],
    ["button_press", null, "ding"],
    ["on_demand", null, "on_demand"],
    ["motion", "human", "person"],
    ["motion.human", null, "person"],
    ["motion", "vehicle", "vehicle"],
    ["motion.animal", null, "animal"],
    ["motion", "package_delivery", "package"],
    ["motion.package", null, "package"],
    ["package_delivery", null, "package"],
    ["motion", "other_motion", "motion"],
    ["motion", null, "motion"],
    ["something_new", null, "motion"],
  ] as const)("%s / %s → %s", (type, sub, kind) => {
    expect(mapEventKind(type, sub)).toBe(kind);
  });
});

describe("history normalization", () => {
  it("maps the recorded Playground history (on_demand, extra cv_detections relationship)", () => {
    const events = normalizeHistoryEvents(playgroundHistory as never, "fallback", "replay");
    expect(events.length).toBeGreaterThan(0);
    // Package, vehicle and motion simulations all arrive as on_demand (FRICTION F-12).
    expect(new Set(events.map((x) => x.kind))).toEqual(new Set(["on_demand"]));
    const e = events[0];
    expect(e).toMatchObject({ kind: "on_demand", rawType: "on_demand", origin: "replay" });
    expect(e!.endMs! - e!.startMs).toBeGreaterThan(0);
    expect(e!.deviceId).toMatch(/^ava1\.ring\.device\./);
  });

  it("maps documented history-events", () => {
    const doc = {
      data: [
        {
          type: "history-events",
          id: "ev1",
          attributes: { event_type: "on_demand", is_third_party_reviewed: true, start: 1699457230000, end: 1699457260000 },
          relationships: { source: { data: { type: "devices", id: "dev1" } } },
        },
        { type: "history-events", id: "ev2", attributes: { event_type: "motion.human", start: "1699457231000" } },
        { type: "history-events", id: "bad", attributes: { event_type: "motion" } },
      ],
    };
    const out = normalizeHistoryEvents(doc as never, "fallback", "live");
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ id: "ev1", deviceId: "dev1", kind: "on_demand", startMs: 1699457230000, endMs: 1699457260000 });
    expect(out[1]).toMatchObject({ id: "ev2", deviceId: "fallback", kind: "person", rawSubType: "human" });
  });

  it("tolerates epoch seconds and ISO strings", () => {
    const doc = {
      data: [
        { type: "history-events", id: "s", attributes: { event_type: "ding", start: 1699457230 } },
        { type: "history-events", id: "i", attributes: { event_type: "ding", start: "2026-10-20T09:00:00Z" } },
      ],
    };
    const [s, i] = normalizeHistoryEvents(doc as never, "d", "live");
    expect(s?.startMs).toBe(1699457230000);
    expect(i?.startMs).toBe(Date.parse("2026-10-20T09:00:00Z"));
  });
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

describe("RingClient", () => {
  it("sends the bearer token and include params", async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json(200, playgroundDevices));
    const c = new RingClient({ token: "tok", fetchImpl: fetchImpl as never });
    const devices = await c.listDevices();
    expect(devices[0]?.name).toBe("Playground Device");
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://api.amazonvision.com/v1/devices?include=status,capabilities,configurations");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("raises RingTokenExpiredError on 401 without retrying", async () => {
    const fetchImpl = vi.fn(async () => json(401, { errors: [{ code: "UNAUTHORIZED" }] }));
    const c = new RingClient({ token: "tok", fetchImpl: fetchImpl as never, sleep: async () => {} });
    await expect(c.listDevices()).rejects.toBeInstanceOf(RingTokenExpiredError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("refuses to construct without a token", () => {
    expect(() => new RingClient({ token: "  " })).toThrow(RingTokenExpiredError);
  });

  it("retries 429 honoring Retry-After, then succeeds", async () => {
    const sleeps: number[] = [];
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { "retry-after": "2" }))
      .mockResolvedValueOnce(json(503, {}))
      .mockResolvedValueOnce(json(200, { data: [] }));
    const c = new RingClient({ token: "t", fetchImpl, sleep: async (ms) => void sleeps.push(ms) });
    expect(await c.listDevices()).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(sleeps[0]).toBeGreaterThanOrEqual(2000);
    expect(sleeps[1]).toBeGreaterThanOrEqual(2000); // exponential: 1000 * 2^1
  });

  it("gives up after maxRetries and surfaces the JSON:API error detail", async () => {
    const fetchImpl = vi.fn(async () => json(503, { errors: [{ code: "SERVER_BUSY", detail: "Server overloaded" }] }));
    const c = new RingClient({ token: "t", fetchImpl: fetchImpl as never, maxRetries: 2, sleep: async () => {} });
    const err = await c.listDevices().catch((e) => e);
    expect(err).toBeInstanceOf(RingApiError);
    expect(err.code).toBe("SERVER_BUSY");
    expect(err.message).toContain("Server overloaded");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("paginates history newest-first and stops past the window", async () => {
    const T = 1_790_000_000_000; // realistic epoch ms (small numbers are treated as epoch seconds)
    const page = (ids: Array<[string, number]>, next?: string) => ({
      data: ids.map(([id, start]) => ({ type: "history-events", id, attributes: { event_type: "ding", start: T + start } })),
      links: next ? { next: `/v1/history/devices/d/events?page[key]=${next}` } : {},
    });
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(json(200, page([["a", 5000], ["b", 4000]], "k1")))
      .mockResolvedValueOnce(json(200, page([["c", 3000], ["d", 1000]], "k2")))
      .mockResolvedValueOnce(json(200, page([["e", 500]])));
    const c = new RingClient({ token: "t", fetchImpl });
    const events = await c.listEventsSince("d", T + 2000);
    expect(events.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(String(fetchImpl.mock.calls[1]![0])).toContain("page%5Bkey%5D=k1");
  });

  it("follows the snapshot 303 to the pre-signed URL without the bearer token", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: "https://media.example/presigned?sig=1" } }))
      .mockResolvedValueOnce(
        new Response(jpeg, { status: 200, headers: { "content-type": "image/jpeg", "x-media-timestamp": "1700000000000", "x-media-origin": "snapshot" } }),
      );
    const c = new RingClient({ token: "secret", fetchImpl });
    const snap = await c.getSnapshot("dev 1", 1699999999000);
    expect(snap.bytes.length).toBe(4);
    expect(snap.mediaTimestamp).toBe(1700000000000);
    expect(snap.mediaOrigin).toBe("snapshot");
    const [firstUrl, firstInit] = fetchImpl.mock.calls[0]!;
    expect(String(firstUrl)).toBe("https://api.amazonvision.com/v1/devices/dev%201/media/image/download");
    expect(firstInit.redirect).toBe("manual");
    expect(JSON.parse(firstInit.body)).toMatchObject({
      type: "at_timestamp",
      timestamp: 1699999999000,
      image_options: { format: "jpeg", resolution: { width: 1920, height: 1080 } },
    });
    const [secondUrl, secondInit] = fetchImpl.mock.calls[1]!;
    expect(secondUrl).toBe("https://media.example/presigned?sig=1");
    expect(JSON.stringify(secondInit ?? {})).not.toContain("secret");
  });

  it("surfaces JSON:API errors from the pre-signed host (Playground: 422 GRECO_NO_VALID_KEY)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 303, headers: { location: "https://media.example/x" } }))
      .mockResolvedValueOnce(json(422, { errors: [{ status: "422", code: "GRECO_NO_VALID_KEY", detail: "No valid Greco key available for decryption" }] }));
    const err = await new RingClient({ token: "t", fetchImpl }).getSnapshot("d", 1).catch((e) => e);
    expect(err).toBeInstanceOf(RingApiError);
    expect(err.status).toBe(422);
    expect(err.code).toBe("GRECO_NO_VALID_KEY");
  });

  it("maps snapshot 416 MEDIA_NOT_FOUND to a RingApiError", async () => {
    const fetchImpl = vi.fn(async () => json(416, { errors: [{ code: "MEDIA_NOT_FOUND", detail: "No media found in time range." }] }));
    const c = new RingClient({ token: "t", fetchImpl: fetchImpl as never });
    const err = await c.getSnapshot("d", 1).catch((e) => e);
    expect(err).toBeInstanceOf(RingApiError);
    expect(err.status).toBe(416);
    expect(err.code).toBe("MEDIA_NOT_FOUND");
  });
});
