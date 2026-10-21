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
  // Two attempts max: a throttled account shouldn't stall the pipeline for 15 s per call.
  client ??= new BedrockRuntimeClient({ region: BEDROCK_REGION, maxAttempts: 2 });
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
  scheduledVisits: Array<{ name: string; window: string; seen: boolean }>;
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

/** Deterministic digest used in mock mode and as the fallback when model output won't parse. */
export function templateDigest(f: DigestFacts): DigestOutput {
  const people = f.events.filter((e) => e.kind === "person" || e.kind === "ding");
  const packages = f.events.filter((e) => e.kind === "package");
  const open = f.alerts.filter((a) => !a.cleared && a.status !== "resolved");
  const parts: string[] = [];
  for (const v of f.scheduledVisits) parts.push(v.seen ? `${v.name} came during ${v.window}` : `${v.name} wasn't seen (${v.window})`);
  if (packages.length) parts.push(`${packages.length === 1 ? "a package arrived" : `${packages.length} packages arrived`} at ${packages.map((p) => p.time).join(", ")}`);
  if (!people.length && !packages.length) parts.push("it was a quiet day at the door");
  const summary = `${f.parentName}'s day: ${parts.join("; ")}.${
    open.length ? ` ${open.length === 1 ? "One thing" : `${open.length} things`} may need a look: ${open.map((a) => a.title.toLowerCase()).join("; ")}.` : " Nothing needs your attention."
  }`;
  return {
    headline: open.length ? `${f.parentName}'s day — ${open.length} thing${open.length > 1 ? "s" : ""} to check` : `${f.parentName}'s day looked normal`,
    summary: capitalize(summary),
    highlights: f.events.slice(0, 4).map((e) => `${e.time} — ${e.sentence}`),
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
