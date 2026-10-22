// Amazon Bedrock (Converse API) — two uses:
//   1. describeSnapshot: a Ring snapshot (JPEG) → one plain sentence + structured tags
//   2. writeDigest: the day's facts → a short, warm daily summary
// Results are cached by the caller (descriptions by event id, digests by day), so we never pay twice.
// BEDROCK_MOCK=1 returns canned outputs with the same shape for offline development.

import "../net";
import {
  BedrockRuntimeClient,
  ConverseCommand,
  type ContentBlock,
  type ConverseCommandOutput,
} from "@aws-sdk/client-bedrock-runtime";
import type { DescriptionTags, EventKind } from "../types";
import { parseDescription, parseDigest, type DigestOutput } from "./parse";

// Default: Amazon Nova Lite through the EU cross-region inference profile, called from Stockholm.
export const BEDROCK_MODEL_ID = process.env.BEDROCK_MODEL_ID || "eu.amazon.nova-lite-v1:0";
export const BEDROCK_REGION = process.env.BEDROCK_REGION || process.env.AWS_REGION || "eu-north-1";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  ms: number;
  model: string;
  mock: boolean;
}

let client: BedrockRuntimeClient | null = null;
function bedrock(): BedrockRuntimeClient {
  // Two attempts max and a hard per-request timeout: a throttled account mustn't stall anything.
  client ??= new BedrockRuntimeClient({
    region: BEDROCK_REGION,
    maxAttempts: 2,
    requestHandler: { requestTimeout: 8_000, connectionTimeout: 4_000 },
  });
  return client;
}

const KIND_HINT: Record<EventKind, string> = {
  person: "a person detected",
  ding: "a doorbell press",
  package: "a package delivery",
  vehicle: "a vehicle detected",
  motion: "general motion",
  animal: "an animal detected",
  on_demand: "a live view opened by the family",
};

/** Plain sentences used when there's no model output (sample/mock mode, or no image). */
const FALLBACK_SENTENCE: Record<EventKind, (t: string) => string> = {
  person: (t) => `Someone was at the front door at ${t}.`,
  ding: (t) => `Someone rang the doorbell at ${t}.`,
  package: (t) => `A package delivery was detected at ${t}.`,
  vehicle: (t) => `A vehicle was detected near the door at ${t}.`,
  motion: (t) => `Movement at the front door at ${t}.`,
  animal: (t) => `An animal was at the front door at ${t}.`,
  on_demand: (t) => `The camera was checked with a live view at ${t}.`,
};

const DESCRIBE_SYSTEM = `You write captions for a front-door camera used by a family caring for an elderly parent who lives alone.
Rules:
- Describe what is happening in ONE calm, plain-English sentence of at most 22 words. Present tense.
- Describe actions and objects only. NEVER identify, name or recognise anyone, and never guess age, race, gender identity or other personal traits. You may say a role only when it is obvious from context (e.g. "a courier" carrying a parcel, "a visitor").
- Mention a parcel/package if one is visible, and whether it is still on the porch.
- Ignore the Ring watermark, logo, device ID and timestamp overlay — they are not part of the scene.
- If the image is dark or unclear, say so plainly rather than guessing.
Return ONLY a JSON object, no prose:
{"sentence": string, "people": integer, "package_visible": boolean|null, "door_open": boolean|null, "vehicle": boolean, "roles": string[]}`;

export interface DescribeInput {
  eventId: string;
  kind: EventKind;
  timeLabel: string;
  image: { bytes: Uint8Array; format: "jpeg" | "png" } | null;
  /** Canned output used only in mock mode (scenario files ship one per event). */
  mockHint?: { sentence: string; tags?: Partial<DescriptionTags> } | null;
}

export interface DescribeResult {
  sentence: string;
  tags: DescriptionTags;
  usage: Usage;
  strict: boolean;
}

export async function describeSnapshot(input: DescribeInput, mock: boolean): Promise<DescribeResult> {
  const fallback = FALLBACK_SENTENCE[input.kind](input.timeLabel);
  if (mock || !input.image) {
    return {
      ...mockDescription(input, fallback),
      usage: { inputTokens: 0, outputTokens: 0, ms: 0, model: input.image ? "mock" : "metadata-only", mock: true },
      strict: true,
    };
  }

  const content: ContentBlock[] = [
    { image: { format: input.image.format, source: { bytes: input.image.bytes } } },
    {
      text: `Ring classified this event as ${KIND_HINT[input.kind]} at ${input.timeLabel} local time. Describe the frame.`,
    },
  ];
  const started = Date.now();
  const res = await bedrock().send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: DESCRIBE_SYSTEM }],
      messages: [{ role: "user", content }],
      inferenceConfig: { maxTokens: 220, temperature: 0.2 },
    }),
  );
  const text = outputText(res);
  const parsed = parseDescription(text, fallback);
  const usage = usageOf(res, Date.now() - started);
  console.info(
    `[bedrock] describe ${input.eventId} model=${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ${usage.ms}ms strict=${parsed.strict}`,
  );
  return { ...parsed, usage };
}

function mockDescription(input: DescribeInput, fallback: string): { sentence: string; tags: DescriptionTags } {
  const base: DescriptionTags = {
    people: input.kind === "person" || input.kind === "ding" ? 1 : 0,
    packageVisible: input.kind === "package" ? true : null,
    doorOpen: null,
    vehicle: input.kind === "vehicle",
    roles: input.kind === "package" ? ["courier"] : [],
  };
  if (input.mockHint) return { sentence: input.mockHint.sentence, tags: { ...base, ...input.mockHint.tags } };
  return { sentence: fallback, tags: base };
}

// ---------------------------------------------------------------------------

const DIGEST_SYSTEM = `You write a short daily note for an adult child about their elderly parent's day, based only on front-door camera events and caretaking alerts.
Tone: warm, calm, matter-of-fact, like a kind neighbour. No alarmism, no medical claims, no speculation about identity — say "someone" or a role ("the aide's visit window", "a courier"), never guess who a person was.
Use the 24-hour times given. Don't invent events. If nothing happened, say it was a quiet day at the door.
Return ONLY JSON: {"headline": string (max 12 words), "summary": string (2–4 sentences, max 70 words), "highlights": string[] (max 4 short bullet phrases)}`;

export interface DigestFacts {
  parentName: string;
  dateLabel: string;
  events: Array<{ time: string; kind: EventKind; sentence: string }>;
  alerts: Array<{ title: string; detail: string; status: string; cleared: string | null }>;
  scheduledVisits: Array<{ name: string; window: string; seen: boolean; seenAt?: string | null }>;
}

export async function writeDigest(
  facts: DigestFacts,
  mock: boolean,
): Promise<{ digest: DigestOutput; usage: Usage; strict: boolean }> {
  const fallback = templateDigest(facts);
  if (mock) return { digest: fallback, usage: { inputTokens: 0, outputTokens: 0, ms: 0, model: "mock", mock: true }, strict: true };
  const started = Date.now();
  const res = await bedrock().send(
    new ConverseCommand({
      modelId: BEDROCK_MODEL_ID,
      system: [{ text: DIGEST_SYSTEM }],
      messages: [{ role: "user", content: [{ text: JSON.stringify(facts) }] }],
      inferenceConfig: { maxTokens: 400, temperature: 0.4 },
    }),
  );
  const usage = usageOf(res, Date.now() - started);
  const parsed = parseDigest(outputText(res));
  console.info(`[bedrock] digest model=${usage.model} in=${usage.inputTokens} out=${usage.outputTokens} ${usage.ms}ms strict=${!!parsed}`);
  return { digest: parsed ?? fallback, usage, strict: !!parsed };
}

/** Deterministic digest used in sample/mock mode and when model output won't parse. */
export function templateDigest(f: DigestFacts): DigestOutput {
  const packages = f.events.filter((e) => e.kind === "package");
  const people = f.events.filter((e) => e.kind === "person" || e.kind === "ding");
  const open = f.alerts.filter((a) => !a.cleared && a.status !== "resolved");
  const packageOut = open.some((a) => /package/i.test(a.title));
  const lower = (name: string) => (/^[A-Z][a-z]/.test(name) ? name.charAt(0).toLowerCase() + name.slice(1) : name);

  const sentences: string[] = [];
  const seen = f.scheduledVisits.filter((v) => v.seen);
  const missed = f.scheduledVisits.filter((v) => !v.seen);
  if (seen.length)
    sentences.push(
      `The ${seen.map((v) => `${lower(v.name)} came${v.seenAt ? ` at ${v.seenAt}` : ""}`).join(" and the ")}`,
    );
  if (missed.length) sentences.push(`Nobody came during the ${missed.map((v) => `${lower(v.name)}'s ${v.window} window`).join(" or the ")}`);
  if (packages.length) {
    const first = packages[0]!.time;
    sentences.push(packageOut ? `A package arrived at ${first} and still seems to be on the porch` : `A package arrived at ${first} and was brought in`);
  }
  if (!people.length && !packages.length) sentences.push("It was a quiet day at the door");
  const others = open.filter((a) => !/package/i.test(a.title));
  if (others.length) sentences.push(`Worth a look: ${others.map((a) => a.title.charAt(0).toLowerCase() + a.title.slice(1)).join("; ")}`);
  if (!open.length) sentences.push("Nothing needs your attention");

  const highlights = [
    ...open.map((a) => `${a.title}${a.detail ? ` — ${a.detail}` : ""}`),
    ...f.events.filter((e) => e.kind === "person" || e.kind === "ding" || e.kind === "package").map((e) => `${e.time} — ${e.sentence}`),
  ].slice(0, 4);

  return {
    headline: open.length
      ? `${f.parentName}'s day — ${open.length === 1 ? "1 thing" : `${open.length} things`} to check`
      : `A normal day for ${f.parentName}`,
    summary: sentences.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(". ") + ".",
    highlights,
  };
}

function outputText(res: ConverseCommandOutput): string {
  return (res.output?.message?.content ?? []).map((c) => ("text" in c && c.text ? c.text : "")).join("\n");
}

function usageOf(res: ConverseCommandOutput, ms: number): Usage {
  return {
    inputTokens: res.usage?.inputTokens ?? 0,
    outputTokens: res.usage?.outputTokens ?? 0,
    ms,
    model: BEDROCK_MODEL_ID,
    mock: false,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
