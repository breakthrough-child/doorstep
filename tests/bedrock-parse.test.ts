import { describe, expect, it } from "vitest";
import { extractJsonObject, parseDescription, parseDigest, tidySentence } from "@/lib/bedrock/parse";
import { templateDigest } from "@/lib/bedrock";

describe("extractJsonObject", () => {
  it("handles fenced JSON and surrounding chatter", () => {
    expect(extractJsonObject('Sure!\n```json\n{"a": 1, "b": "}"}\n```')).toEqual({ a: 1, b: "}" });
  });
  it("returns null when there's no object or it's malformed", () => {
    expect(extractJsonObject("no json here")).toBeNull();
    expect(extractJsonObject('{"a": }')).toBeNull();
  });
});

describe("parseDescription", () => {
  it("parses strict model output into tags", () => {
    const r = parseDescription(
      '{"sentence":"a courier leaves a package on the step","people":1,"package_visible":true,"door_open":false,"vehicle":false,"roles":["Courier"]}',
      "fallback",
    );
    expect(r.strict).toBe(true);
    expect(r.sentence).toBe("A courier leaves a package on the step.");
    expect(r.tags).toEqual({ people: 1, packageVisible: true, doorOpen: false, vehicle: false, roles: ["courier"] });
  });

  it("coerces sloppy fields instead of failing", () => {
    const r = parseDescription('{"sentence":"Someone waits at the door.","people":"2","package_visible":"maybe"}', "x");
    expect(r.strict).toBe(true);
    expect(r.tags.people).toBe(2);
    expect(r.tags.packageVisible).toBeNull();
    expect(r.tags.roles).toEqual([]);
  });

  it("falls back to the first prose sentence with unknown tags", () => {
    const r = parseDescription("A person stands at the door. They are holding a bag.", "fallback");
    expect(r.strict).toBe(false);
    expect(r.sentence).toBe("A person stands at the door.");
    expect(r.tags.packageVisible).toBeNull();
  });

  it("uses the fallback for empty output", () => {
    expect(parseDescription("", "Motion at the front door.").sentence).toBe("Motion at the front door.");
  });
});

describe("tidySentence", () => {
  it("strips quotes, collapses whitespace, adds a full stop", () => {
    expect(tidySentence('  "the porch   is empty"  ')).toBe("The porch is empty.");
  });
});

describe("digest", () => {
  it("parses strict digest JSON", () => {
    expect(parseDigest('{"headline":"A calm day","summary":"All fine.","highlights":["9:10 aide"]}')).toEqual({
      headline: "A calm day",
      summary: "All fine.",
      highlights: ["9:10 aide"],
    });
    expect(parseDigest("nope")).toBeNull();
  });

  it("template digest mentions visits, packages and open alerts", () => {
    const d = templateDigest({
      parentName: "Grace",
      dateLabel: "Tuesday 20 October",
      events: [{ time: "14:05", kind: "package", sentence: "A courier leaves a package." }],
      alerts: [{ title: "A package is still on the porch", detail: "", status: "open", cleared: null }],
      scheduledVisits: [{ name: "Home aide", window: "09:00–10:30", seen: false }],
    });
    expect(d.headline).toContain("1 thing");
    expect(d.summary).toContain("Home aide wasn't seen");
    expect(d.summary).toContain("a package arrived at 14:05");
  });

  it("template digest for a quiet, fine day", () => {
    const d = templateDigest({ parentName: "Grace", dateLabel: "", events: [], alerts: [], scheduledVisits: [] });
    expect(d.headline).toBe("Grace's day looked normal");
    expect(d.summary).toContain("quiet day");
  });
});
