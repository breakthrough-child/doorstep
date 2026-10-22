// One real Amazon Bedrock call (Nova Lite, image + text via Converse) — reports success or the exact error.
// Usage: npm run check:bedrock            (reads .env.local; ignores BEDROCK_MOCK)
import "./env";
import fs from "node:fs";
import path from "node:path";
import { BEDROCK_MODEL_ID, BEDROCK_REGION, describeSnapshot } from "../src/lib/bedrock";
import { errorMessage, errorName } from "../src/lib/bedrock/health";
import { loadCheckImage } from "./check-image";

const HINTS: Record<string, string> = {
  ServiceQuotaExceededException:
    "Account quota for this model is exhausted or provisioned at 0. Check Service Quotas → Amazon Bedrock (tokens/requests per minute and per day for this model and inference profile) in this region.",
  ThrottlingException:
    "Throttled. If it happens on the very first call, the account's quota for this model is probably 0. Check Service Quotas → Amazon Bedrock in this region.",
  AccessDeniedException:
    "IAM denies bedrock:InvokeModel, or the model isn't enabled for this account. Allow InvokeModel on the inference profile AND the underlying foundation model in every region the profile routes to.",
  ValidationException: "The model id / inference profile isn't valid in this region. For eu-north-1 use eu.amazon.nova-lite-v1:0.",
  ResourceNotFoundException: "Model or inference profile not found in this region.",
  UnrecognizedClientException: "The access key id is invalid.",
  InvalidSignatureException: "The secret access key doesn't match the access key id.",
  ExpiredTokenException: "Temporary credentials have expired.",
  CredentialsProviderError: "No AWS credentials found. Put AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY in .env.local or set AWS_PROFILE.",
};

async function main() {
  const key = process.env.AWS_ACCESS_KEY_ID;
  console.log("Amazon Bedrock check");
  console.log(`  region:       ${BEDROCK_REGION}`);
  console.log(`  model:        ${BEDROCK_MODEL_ID}`);
  console.log(`  credentials:  ${key ? `access key …${key.slice(-4)}` : process.env.AWS_PROFILE ? `profile ${process.env.AWS_PROFILE}` : "default provider chain"}`);

  const img = loadCheckImage();
  console.log(`  image:        ${img.path ?? "generated 64×36 PNG (no recorded Ring frame found)"}`);
  const started = Date.now();
  try {
    const res = await describeSnapshot(
      { eventId: "check", kind: "package", timeLabel: "14:05", image: { bytes: img.bytes, format: img.format } },
      false,
    );
    console.log(`\n✓ Success in ${Date.now() - started} ms`);
    console.log(`  caption:  ${res.sentence}`);
    console.log(`  tags:     ${JSON.stringify(res.tags)}`);
    console.log(`  tokens:   ${res.usage.inputTokens} in / ${res.usage.outputTokens} out (strict JSON: ${res.strict})`);
    await markHealth(true);
  } catch (err) {
    const name = errorName(err);
    console.error(`\n✗ Failed after ${Date.now() - started} ms`);
    console.error(`  error:    ${errorMessage(err)}`);
    if (HINTS[name]) console.error(`  hint:     ${HINTS[name]}`);
    await markHealth(false, err);
    process.exitCode = 1;
  }
}

/** If the app's database exists, update its Bedrock health so a running app reacts immediately. */
async function markHealth(ok: boolean, err?: unknown) {
  if (!fs.existsSync(path.join("data", "doorstep.db"))) return;
  const h = await import("../src/lib/bedrock/health");
  if (ok) h.recordBedrockSuccess();
  else h.recordBedrockFailure(err);
}

main();
