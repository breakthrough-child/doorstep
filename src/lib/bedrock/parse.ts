// Strict-then-lenient parsing of model output. Pure; unit-tested.
import { z } from "zod";
import type { DescriptionTags } from "../types";

const describeSchema = z.object({
  sentence: z.string().min(3).max(400),
  people: z.coerce.number().int().min(0).max(50).catch(0),
  package_visible: z.boolean().nullable().catch(null),
  door_open: z.boolean().nullable().catch(null),
  vehicle: z.boolean().catch(false),
  roles: z.array(z.string().max(40)).max(6).catch([]),
});

export const digestSchema = z.object({
  headline: z.string().min(3).max(160),
  summary: z.string().min(3).max(1200),
  highlights: z.array(z.string().max(200)).max(8).catch([]),
});

export type DigestOutput = z.infer<typeof digestSchema>;

/** Find the first balanced JSON object in text (handles ```json fences and chatter). */
export function extractJsonObject(text: string): unknown | null {
  const cleaned = text.replace(/```(?:json)?/gi, "");
  const start = cleaned.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(cleaned.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/** Words we never want in a description: identity, biometrics, protected traits. */
const IDENTITY_PATTERNS = [/\b(?:is|was|looks like|appears to be)\s+(?:mr|mrs|ms|dr)\.?\s+[A-Z][a-z]+/g];

export function tidySentence(s: string): string {
  let out = s.replace(/\s+/g, " ").trim().replace(/^["']|["']$/g, "");
  for (const p of IDENTITY_PATTERNS) out = out.replace(p, "someone");
  if (out && !/[.!?]$/.test(out)) out += ".";
  return out.charAt(0).toUpperCase() + out.slice(1);
}

export function parseDescription(
  text: string,
  fallbackSentence: string,
): { sentence: string; tags: DescriptionTags; strict: boolean } {
  const obj = extractJsonObject(text);
  const parsed = obj ? describeSchema.safeParse(obj) : null;
  if (parsed?.success) {
    const d = parsed.data;
    return {
      sentence: tidySentence(d.sentence),
      tags: {
        people: d.people,
        packageVisible: d.package_visible,
        doorOpen: d.door_open,
        vehicle: d.vehicle,
        roles: d.roles.map((r) => r.toLowerCase().trim()).filter(Boolean),
      },
      strict: true,
    };
  }
  // Lenient fallback: take the first sentence of prose, unknown tags.
  const prose = text.replace(/```[\s\S]*?```/g, "").trim();
  const first = /[^.!?]+[.!?]/.exec(prose)?.[0] ?? prose.slice(0, 200);
  return {
    sentence: tidySentence(first || fallbackSentence),
    tags: { people: 0, packageVisible: null, doorOpen: null, vehicle: false, roles: [] },
    strict: false,
  };
}

export function parseDigest(text: string): DigestOutput | null {
  const obj = extractJsonObject(text);
  const parsed = obj ? digestSchema.safeParse(obj) : null;
  return parsed?.success ? parsed.data : null;
}
