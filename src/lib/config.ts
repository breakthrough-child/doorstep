// Runtime configuration: data mode, Ring token, care plan. Server-side only.
import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { db, getSetting, setSetting } from "./db";
import type { CarePlan, DataMode, Visitor } from "./types";
import { parseHHMM } from "./time";

export function envDataMode(): DataMode {
  const m = (process.env.DATA_MODE ?? "REPLAY").toUpperCase();
  return m === "LIVE" || m === "SCENARIO" ? m : "REPLAY";
}

/** The /demo panel can override the env default at runtime. */
export function getDataMode(): DataMode {
  return getSetting<DataMode | null>("data_mode", null) ?? envDataMode();
}

export function setDataMode(mode: DataMode): void {
  setSetting("data_mode", mode);
}

/** A token pasted in onboarding wins over RING_ACCESS_TOKEN (Playground tokens rotate every ~30 min). */
export function getRingToken(): { token: string | null; source: "pasted" | "env" | null; pastedAt: number | null } {
  const pasted = getSetting<{ token: string; at: number } | null>("ring_token", null);
  if (pasted?.token) return { token: pasted.token, source: "pasted", pastedAt: pasted.at };
  const env = process.env.RING_ACCESS_TOKEN?.trim();
  return env ? { token: env, source: "env", pastedAt: null } : { token: null, source: null, pastedAt: null };
}

export function setRingToken(token: string | null): void {
  setSetting("ring_token", token ? { token: token.trim(), at: Date.now() } : null);
  setSetting("ring_token_expired", false);
}

export function markRingTokenExpired(expired: boolean): void {
  setSetting("ring_token_expired", expired);
}

export function isRingTokenExpired(): boolean {
  return getSetting("ring_token_expired", false);
}

const hhmm = z.string().refine((v) => {
  try {
    parseHHMM(v);
    return true;
  } catch {
    return false;
  }
}, "Use HH:MM (24-hour)");

export const visitorSchema = z
  .object({
    id: z.string().min(1).max(64),
    name: z.string().trim().min(1).max(60),
    days: z.array(z.number().int().min(0).max(6)).min(1, "Pick at least one day"),
    windowStart: hhmm,
    windowEnd: hhmm,
  })
  .refine((v) => parseHHMM(v.windowEnd) > parseHHMM(v.windowStart), {
    message: "The window must end after it starts",
    path: ["windowEnd"],
  });

export const contactSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, "Add a name").max(60),
  role: z.enum(["parent", "aide", "neighbour", "family", "other"]),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 ()-]{6,24}$/, "Use a phone number like +44 7700 900123"),
  escalation: z.boolean(),
});

export const carePlanSchema = z.object({
  parentName: z.string().trim().min(1).max(40),
  familyName: z.string().trim().min(1).max(40),
  timeZone: z.string().refine((tz) => {
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Unknown time zone"),
  quietMorningBy: hhmm,
  lateNightStart: hhmm,
  lateNightEnd: hhmm,
  packageHours: z.number().min(0.5).max(24),
  darkAt: hhmm,
  doorbellAnswerMinutes: z.number().int().min(1).max(30),
  visitGraceMinutes: z.number().int().min(0).max(120),
  deviceId: z.string().nullable(),
  contacts: z
    .array(contactSchema)
    .max(10)
    .refine((cs) => cs.filter((c) => c.escalation).length <= 1, "Choose at most one second family contact")
    .default([]),
});

export type CarePlanInput = z.infer<typeof carePlanSchema>;

export const DEFAULT_PLAN: Omit<CarePlan, "visitors"> = {
  parentName: "Grace",
  familyName: "Ada",
  timeZone: process.env.DEFAULT_TIME_ZONE ?? "Africa/Lagos",
  quietMorningBy: "10:30",
  lateNightStart: "23:00",
  lateNightEnd: "05:00",
  packageHours: 3,
  darkAt: "18:30",
  doorbellAnswerMinutes: 3,
  visitGraceMinutes: 15,
  deviceId: null,
  // Phone numbers are from Ofcom's range reserved for drama (+44 7700 900xxx): clearly fictional.
  contacts: [
    { id: "grace", name: "Grace", role: "parent", phone: "+44 7700 900461", escalation: false },
    { id: "ngozi", name: "Ngozi (home aide)", role: "aide", phone: "+44 7700 900118", escalation: false },
    { id: "bello", name: "Mr Bello (neighbour)", role: "neighbour", phone: "+44 7700 900275", escalation: false },
    { id: "chidi", name: "Chidi (Ada's brother)", role: "family", phone: "+44 7700 900389", escalation: true },
  ],
};

export const DEFAULT_VISITORS: Visitor[] = [
  { id: "aide", name: "Home aide", days: [0, 1, 2, 3, 4, 5, 6], windowStart: "09:00", windowEnd: "10:30" },
  { id: "meals", name: "Meal delivery", days: [1, 2, 3, 4, 5], windowStart: "12:00", windowEnd: "13:00" },
];

export function getCarePlan(): CarePlan {
  const base = { ...DEFAULT_PLAN, ...getSetting<Partial<CarePlan>>("care_plan", {}) };
  return { ...base, visitors: listVisitors() };
}

export function saveCarePlan(input: CarePlanInput): void {
  setSetting("care_plan", carePlanSchema.parse(input));
}

export function listVisitors(): Visitor[] {
  const rows = db().prepare("SELECT * FROM visitors ORDER BY sort, name").all() as Array<{
    id: string;
    name: string;
    days: string;
    window_start: string;
    window_end: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    days: JSON.parse(r.days) as number[],
    windowStart: r.window_start,
    windowEnd: r.window_end,
  }));
}

export function replaceVisitors(visitors: Visitor[]): void {
  const parsed = visitors.map((v) => visitorSchema.parse(v));
  const conn = db();
  conn.transaction(() => {
    conn.prepare("DELETE FROM visitors").run();
    const ins = conn.prepare(
      "INSERT INTO visitors (id, name, days, window_start, window_end, sort) VALUES (?, ?, ?, ?, ?, ?)",
    );
    parsed.forEach((v, i) => ins.run(v.id, v.name, JSON.stringify([...v.days].sort()), v.windowStart, v.windowEnd, i));
  })();
}

export function isOnboarded(): boolean {
  return getSetting("onboarded", false);
}

/**
 * BEDROCK_MOCK=1 forces canned outputs, BEDROCK_MOCK=0 forces real calls. Unset: real Bedrock when
 * AWS credentials are discoverable, otherwise mock — so a fresh clone works with zero setup.
 */
export function bedrockMock(): boolean {
  const v = process.env.BEDROCK_MOCK?.toLowerCase();
  if (v === "1" || v === "true") return true;
  if (v === "0" || v === "false") return false;
  return !hasAwsCredentials();
}

let credsCache: boolean | null = null;
function hasAwsCredentials(): boolean {
  if (credsCache !== null) return credsCache;
  const env = process.env;
  const home = env.HOME ?? env.USERPROFILE ?? "";
  credsCache =
    !!(env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY) ||
    !!env.AWS_PROFILE ||
    !!env.AWS_WEB_IDENTITY_TOKEN_FILE ||
    !!env.AWS_CONTAINER_CREDENTIALS_FULL_URI ||
    (!!home && (fs.existsSync(path.join(home, ".aws", "credentials")) || fs.existsSync(path.join(home, ".aws", "config"))));
  return credsCache;
}
