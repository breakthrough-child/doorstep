import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { checkImagePath, loadCheckImage, tinyPng } from "../scripts/check-image";
import { listScenarios, scenarioImagePath } from "@/lib/data/scenarios";

describe("npm run check:bedrock image", () => {
  it("uses a committed real Ring frame that exists in a fresh clone", () => {
    const p = checkImagePath();
    expect(p, "no recorded Ring snapshot in fixtures/playground/snapshots").not.toBeNull();
    expect(fs.existsSync(p!)).toBe(true);
    // Must be tracked by git, or a fresh clone won't have it.
    const tracked = execFileSync("git", ["ls-files", "--error-unmatch", p!], { encoding: "utf8" }).trim();
    expect(tracked).toBe(p);
    const img = loadCheckImage();
    expect(img.format).toBe("jpeg");
    expect(img.bytes.length).toBeGreaterThan(1000);
  });

  it("falls back to a valid generated PNG when no frame exists", () => {
    const img = loadCheckImage(fs.mkdtempSync(path.join(process.env.TMPDIR ?? "/tmp", "no-fixtures-")));
    expect(img.path).toBeNull();
    expect(img.format).toBe("png");
    expect(Buffer.from(img.bytes.subarray(0, 8)).toString("hex")).toBe("89504e470d0a1a0a");
    expect(tinyPng(2, 2).length).toBeGreaterThan(40);
  });
});

/**
 * Every repo-relative file path mentioned in tracked code and docs must exist. This catches
 * references left behind when files are renamed or deleted (e.g. a removed illustration).
 */
describe("repository references", () => {
  const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
  const textFiles = tracked.filter((f) => /\.(md|ts|tsx|mjs|js|json|py|ya?ml|example)$/.test(f) && !f.startsWith("fixtures/"));
  // Paths into these folders, ending in a file extension.
  const ref = /(?<![\w./-])((?:scenarios|fixtures|docs|assets|scripts|src|tests|public)\/[A-Za-z0-9_./\-[\]]+\.(?:jpg|jpeg|png|svg|json|md|ts|tsx|mjs|py|yaml))\b/g;

  it("all referenced files exist", () => {
    const missing: string[] = [];
    for (const f of textFiles) {
      const text = fs.readFileSync(f, "utf8");
      for (const m of text.matchAll(ref)) {
        const p = m[1]!;
        if (p.includes("<") || p.includes("*") || p.includes("${")) continue; // templates and globs
        if (p.startsWith("scenarios/images/stock/") && !p.endsWith(".jpg")) continue;
        if (!fs.existsSync(p)) missing.push(`${f} → ${p}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("every scenario frame resolves to a tracked file", () => {
    for (const s of listScenarios())
      for (const e of s.events) {
        const p = scenarioImagePath(e.image);
        expect(tracked.includes(p.split(path.sep).join("/")), `${s.id} ${e.at} → ${p}`).toBe(true);
      }
  });
});
