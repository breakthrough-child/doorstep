# Doorstep: Devpost submission answers

Ready-to-paste answers for "Build, Ship, Shape: Amazon Developer Hackathon".

> **If Amazon Bedrock is still blocked on Thursday evening:** delete every block between `<!-- AWS-BUILDER:START -->` and `<!-- AWS-BUILDER:END -->` (there are 6), delete the one table row tagged `<!-- AWS-BUILDER -->`, and un-comment the "without AWS" variant marked `<!-- NO-AWS -->`. Or run `npm run submission:no-aws`, which does exactly that into `SUBMISSION-no-aws.md`. Nothing else references the AWS Builder track. The Bedrock friction entry (F-08) stays in the friction log either way: it's genuine product feedback.

---

## Project name

Doorstep

## Tagline

Calm, plain-language updates from a parent's front door. Doorstep tells you when something's off and leaves you alone when it isn't.

## Tracks

- **Ring** (primary)
<!-- AWS-BUILDER:START -->
- **AWS Builder mini challenge**: Amazon Bedrock (Nova Lite)
<!-- AWS-BUILDER:END -->

## Inspiration

Millions of adult children look after a parent who lives alone, often from another city. A doorbell camera gives them footage and a stream of motion pings, but no answer to the question they actually have: *is Mum's day going normally?* The signals that matter are absences and timing. The carer didn't come. Nobody opened the door all morning. A parcel has sat on the step since lunch. The bell rang at midnight. Those are invisible in a clip feed. We wanted a companion that watches for those, describes the day in plain words, and otherwise stays quiet.

## What it does

<!-- AWS-BUILDER:START -->
- **AI event descriptions.** Each Ring event's snapshot is described by Amazon Bedrock (Nova Lite) in one plain sentence, e.g. *"A courier in a high-visibility vest leaves a package on the step."* It describes what happens and never identifies anyone.
<!-- AWS-BUILDER:END -->
<!-- NO-AWS -->
<!-- - **Plain-language event descriptions.** Each Ring event becomes one plain sentence ("A package delivery at the front door at 14:05"), designed to be written by a vision model; descriptions describe what happens and never identify anyone. -->
- **Caretaking alerts**, from a deterministic rules engine rather than AI:
  - **Quiet morning**: no door activity by 10:30 (configurable).
  - **Missed visit**: a scheduled visitor (home aide, nurse, meal delivery) didn't appear in their window.
  - **Package left out**: still on the porch after 3 hours, or after dark.
  - **Late-night door activity**: someone at the door between 23:00 and 05:00.
  - **Unanswered doorbell**: a best-effort heuristic, labelled as such.
- **Daily digest**: a short, warm note on the parent's day at the door.
- **A care plan** where the family describes a normal day: visitors' windows, quiet-morning time, night hours, package threshold.
- **Visual doorbell for the living room**: a full-screen, high-contrast "someone is at the door" web page for a TV or tablet, with the description. Dismiss with OK/Enter; it clears itself after a minute. Built for residents who can't hear the chime.
- **Honest demo modes.** LIVE (real Ring Developer Playground), REPLAY (recorded Playground responses), SCENARIO (timed synthetic events, labelled "Simulated"). A badge on every screen shows which is active.

## How we built it

- **Next.js 15 (App Router) + TypeScript (strict) + Tailwind 4**, with server route handlers for every external API call. Secrets never reach the browser.
- **Ring Partner API client** (`src/lib/ring/`), used at runtime by the poller, the onboarding token check and the fixture recorder:
  - `GET /v1/devices?include=status,capabilities,configurations` with typed JSON:API normalization (`included` resolved by type + id).
  - `GET /v1/history/devices/{id}/events`, paginated newest-first via `links.next` `page[key]`.
  - `POST /v1/devices/{id}/media/image/download` (`at_timestamp`). It follows the 303 to the pre-signed URL manually, without forwarding the Bearer token.
  - Exponential backoff honouring `Retry-After` on 429/5xx. A 401 becomes a "token expired — paste a new Playground token" flow in the UI.
- **Polling instead of webhooks.** The Playground doesn't deliver webhooks, so a background poller reads Event History in LIVE mode, or advances a simulated clock in SCENARIO mode. It then runs snapshot → description → rules → alerts.
- **A pure rules engine** (`src/lib/rules/engine.ts`) evaluated in the parent's time zone, with deterministic alert ids so "I'm on it" survives re-evaluation. It's covered by Vitest, including DST spring-forward and fall-back days.
- **SQLite** (better-sqlite3) for local-first, zero-setup storage: `npm install && npm run setup && npm run dev`.
- **A fixture recorder** (`npm run record`) captures real Playground responses and snapshots for REPLAY. It refuses to write any file containing the token.
<!-- AWS-BUILDER:START -->
- **Amazon Bedrock** (Converse API, Amazon Nova Lite via the EU cross-region inference profile) for snapshot captions (image in, JSON out) and the daily digest. Results are cached per event and per day, token usage is logged per call, and there's a one-command health check (`npm run check:bedrock`). See "AWS services" below.
<!-- AWS-BUILDER:END -->

## Privacy

No face recognition, no biometric matching, no identification of anyone. This is a deliberate design decision, not a limitation. "Missed visit" means *nobody* came to the door in the window; visitor names are labels for the family only. Ring snapshots are always shown uncropped, so Ring's mandatory watermark stays intact. Tokens and credentials stay on the server, and data stays in a local SQLite file.

## Challenges we ran into

- **The Ring Developer Playground doesn't deliver webhooks**, and its tokens last ~30 minutes. We designed three explicit data modes (live / replayed / simulated) and label them on screen, so the demo never pretends.
- **Event History has no documented time-range filter**, so "today's events" means paginating backwards until we pass the window (friction F-01).
- **Event-type vocabulary differs between webhooks and history**, especially for packages (F-02). In the Playground every simulated event came through as `on_demand` (F-12).
- **Playground data access starts at each token's issue time.** Fresh tokens see empty history and get undocumented 403s for earlier media (F-09). That led to a real product insight: Doorstep never claims "nobody came" for time it couldn't see. Absence-based alerts respect when coverage began, and the app says "watching since 23:43".
- **The official sample app's device normalization doesn't match the documented schema** (F-03, F-04).
<!-- AWS-BUILDER:START -->
- **Amazon Bedrock was blocked by account quotas.** Every Nova Lite quota in eu-north-1 was applied at 0 (tokens per day: 0 vs a 5.76B default), and most are "Not adjustable". The runtime error is a retryable `ThrottlingException: Too many tokens per day` on the very first call. We built a fallback: real Bedrock stays the default, failures show clearly labelled sample captions, and the app switches to Nova Lite automatically the moment a call succeeds (F-08).
<!-- AWS-BUILDER:END -->

## Accomplishments we're proud of

- It feels like a calm product, not a security dashboard: warm palette, large type, Atkinson Hyperlegible for low-vision readers, and rose red only for genuine late-night concerns.
- Honest by construction: every caption and event is labelled with where it came from.
- The rules are pure, tested, time-zone-correct functions, so judges can trust the alerts.

## What we learned

The most valuable caretaking signals are absences and timing, and those need rules plus context (a care plan), not more AI. AI is best spent turning pixels into one human sentence.

## What's next

- Ring OAuth account linking and signed webhooks (HMAC-SHA256) instead of polling, in production.
- Push notifications and SMS for alerts, with quiet hours.
- Shared family circles (siblings splitting check-ins), and a weekly "how Mum's been" summary.
- Sensor support (Ring Alarm contact sensors) to tell "door opened" from "someone walked past".

---

## Product feedback (required)

### Ring Partner API

- **What we used it for:** device discovery with `include=status,capabilities,configurations`, Event History polling, image snapshots for AI descriptions, privacy-zone and E2EE settings from device configurations.
- **What worked well:** A clean JSON:API design with predictable `included` resolution, and clear error codes for media (`MEDIA_NOT_FOUND`, `RECORDING_NOT_READY`, `CORRUPT_RECORDING`) that made graceful degradation easy. The snapshot `at_timestamp` / `latest_in_range` options are exactly what an AI-description pipeline needs. The `X-Media-Origin` header is a thoughtful touch.
- **What needs work:**
  - Event History needs documented time-range and page-size parameters (F-01).
  - One canonical event type/subtype table across webhooks and history, with packages especially (F-02).
  - Say whether the snapshot's pre-signed URL should be fetched without auth, and how long it lives (F-07).
  - The reference is one ~370k-character page; an OpenAPI spec would let partners generate typed clients (F-06).
  - Real responses carry fields the reference doesn't mention. Notably, `users/me` returns name and email, which a privacy review needs to know (F-13).
  - Omitting snapshot `resolution` returns 640×360, not full size as documented, so the watermark covers much more of the frame (F-10).
- **Onboarding (zero → hello world):** With a Playground token, the first successful `GET /v1/devices` took minutes; our typed client worked first time against the real API. Getting *data* took longer. A fresh token sees no history and no media until you simulate events (F-09), and that cost a full 30-minute token to work out. The other time sink was reconciling the sample app with the reference.
- **Would we build with it again?** Yes. The API surface is small, sensible and well suited to "ambient" products that don't stream video. We'd want webhooks in the Playground first.

### Ring Developer Playground

- **What we used it for:** A real token without hardware, account linking or a subscription; live API calls in LIVE mode, and recording fixtures for REPLAY.
- **What worked well:** One-click tokens and the interactive API explorer with curl commands. It removed the hardware barrier entirely, and there's no way we could have built this without it.
- **What needs work:**
  - No webhook delivery, so any event-driven app needs a simulation layer.
  - 30-minute tokens with no refresh, so long demo sessions break mid-flow.
  - A fresh token sees an empty history, and every earlier media request fails with an undocumented `403 TIME_RANGE_NOT_AUTHORIZED`. The authorized window starts at the token's issue time (F-09).
  - Simulated events arrive in Event History as `on_demand` with no subtype, even when the clip shows a package (F-12), so category logic can't be tested against it.
  - `latest_in_range` snapshots fail on the pre-signed host with `422 GRECO_NO_VALID_KEY` (F-11). `subscriptions` returns 422 for the Playground user (F-13).
- **Would we use it again?** Absolutely. We'd love a "simulate event → webhook to my URL" button.

### Ring sample app (`ring-api-helloworld`)

- **Useful for:** auth modes and the overall shape of a Next.js integration.
- **Needs work:**
  - Device normalization reads `attributes.online`, which lives on the separate `device-status` resource (F-03).
  - The events route says there's no polling API although Event History exists, and the webhook types invent fields (F-04).
  - `/api/ring/token` hands the access token to the browser (F-05).

<!-- AWS-BUILDER:START -->
### Amazon Bedrock + Amazon Nova Lite

- **What we used it for:** Converse API with image + text in and strict JSON out: a one-sentence, privacy-preserving description of each Ring snapshot, plus a short daily digest.
- **What worked well:**
  - The Converse API's single request shape across models; swapping models is an env-var change.
  - Passing JPEG bytes directly in an `image` block, with no S3 staging.
  - The JS SDK's typed errors with request ids.
- **What needs work:** See F-08. A new account had every Nova Lite quota in eu-north-1 applied at 0, mostly "Not adjustable". The runtime signal is a retryable `ThrottlingException: Too many tokens per day` on the very first call. That reads as "slow down", and SDKs retry it automatically, when it really means "this account can't use this model".
  - Return a non-retryable, explicit error for zero quotas.
  - Surface zero-quota state in the console.
  - Give new accounts a self-service path that doesn't need a support case.
- **Onboarding:** IAM user and keys took minutes. Diagnosing the 0 quota took most of an evening, because nothing pointed at Service Quotas.
- **Would we build with it again?** Yes. Nova Lite is the right price/capability point for captioning. But we'd verify account quotas on day one.

### AWS services description (AWS Builder mini challenge)

Doorstep uses **Amazon Bedrock Runtime (Converse API)** with **Amazon Nova Lite** (`eu.amazon.nova-lite-v1:0`, EU cross-region inference profile, called from eu-north-1):

1. **Snapshot description.** For each Ring event, the server downloads the watermarked JPEG from the Ring Partner API and sends it to Nova Lite with a system prompt that forbids identifying people. It gets back JSON: a one-sentence description plus tags (people count, package visible, door open, vehicle). The tags feed the caretaking rules: was the package brought in, was the door answered.
2. **Daily digest.** At the end of the day the server sends the day's descriptions and alerts as JSON. Nova Lite writes a warm 2–4 sentence summary for the family.

All calls are server-side, cached by event id / day so nothing is paid for twice, and token usage is logged per call. A busy day costs well under one US cent. Full data flow, IAM policy and cost table: `docs/AWS.md`.
<!-- AWS-BUILDER:END -->


### Next.js, Node.js, better-sqlite3 (supporting tools)

- Next.js App Router route handlers kept every secret server-side. `instrumentation.ts` hosts the background poller. One gotcha: native modules imported from instrumentation must be behind a `NEXT_RUNTIME === "nodejs"` dynamic import, or the edge bundle fails.
- Node 20+'s 250 ms happy-eyeballs connect timeout broke every `fetch` (including npm) on our high-latency connection. We fixed it with `net.setDefaultAutoSelectFamilyAttemptTimeout`.

## Feature requests

| Priority | Product | Request |
|---|---|---|
| **Critical** | Ring Playground | Deliver webhooks (or a "send test webhook to my URL" button) for simulated events. |
| **Critical** | Amazon Bedrock | Explicit, non-retryable error and console banner when an account's on-demand quota for a model is 0; self-service path for new accounts. | <!-- AWS-BUILDER -->
| **Important** | Ring Partner API | Time-range (`filter[start]`/`filter[end]`) and `page[size]` on Event History. |
| **Important** | Ring Partner API | One canonical event type/subtype table shared by webhooks and history (packages!). |
| **Important** | Ring Playground | Longer-lived or refreshable tokens for demo sessions. |
| **Important** | Ring Playground | Emit simulated events with their real type/subtype (`motion` + `package_delivery` / `human` / `vehicle`), not `on_demand`, and seed a little sample history. |
| **Important** | Ring Partner API | Document `TIME_RANGE_NOT_AUTHORIZED` and the consent boundary; make omitted snapshot `resolution` return full size as documented. |
| **Important** | Ring docs | OpenAPI spec and per-resource pages. |
| **Nice-to-have** | Ring sample app | Align normalization and webhook types with the published schema; don't expose the token to the browser. |
| **Nice-to-have** | Ring Partner API | Document pre-signed snapshot URL auth expectations and lifetime. |
| **Nice-to-have** | Ring Partner API | A lightweight "door opened" signal (e.g. from video doorbells with door sensors) for caretaking use cases. |

## Links

- Repository: [fill in]
- Demo video: [fill in]
- Friction log: `FRICTION_LOG.md` in the repo
