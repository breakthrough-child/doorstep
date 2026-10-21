import { describe, expect, it } from "vitest";
import { loadReplay } from "@/lib/data/replay";

// Uses the real Ring Developer Playground recording in fixtures/playground.
describe("REPLAY loader", () => {
  it("loads the recorded device and events with real snapshots", () => {
    const r = loadReplay(Date.UTC(2026, 9, 22, 12));
    expect(r.meta.synthetic).toBe(false);
    expect(r.devices[0]?.name).toBe("Playground Device");
    expect(r.events.length).toBeGreaterThanOrEqual(1);
    for (const e of r.events) {
      expect(e.id.startsWith("rp:")).toBe(true);
      expect(e.snapshotStatus).toBe("ok");
    }
  });

  it("shifts the newest event to 10 minutes before now, keeping spacing", () => {
    const now = Date.UTC(2026, 9, 22, 12);
    const r = loadReplay(now);
    const starts = r.events.map((e) => e.startMs);
    expect(Math.max(...starts)).toBe(now - 10 * 60_000);
    expect(r.meta.coverageStartMs).toBeLessThanOrEqual(Math.min(...starts));
  });

  it("just after midnight, keeps the whole recording inside today without going into the future", () => {
    const dayStart = Date.UTC(2026, 9, 22, 0);
    const now = dayStart + 40 * 60_000; // 00:40 — the recording spans ~27 minutes
    const r = loadReplay(now, undefined, dayStart);
    const starts = r.events.map((e) => e.startMs);
    expect(Math.min(...starts)).toBeGreaterThanOrEqual(dayStart);
    expect(Math.max(...starts)).toBeLessThan(now);
  });
});
