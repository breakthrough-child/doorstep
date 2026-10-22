# Doorstep: Devpost submission answers

Ready-to-paste answers for "Build, Ship, Shape: Amazon Developer Hackathon".

---

## Project name

Doorstep

## Tagline

Calm, plain-language updates from a parent's front door. Doorstep tells you when something's off and leaves you alone when it isn't.

## Tracks

- **Ring** (primary)
<!-- OPEN-SOURCE:START -->
- **Open Source mini challenge**: pull request https://github.com/AmazonAppDev/ring-api-helloworld/pull/45 (see "Open Source contribution" below)
<!-- OPEN-SOURCE:END -->

## Inspiration

Millions of adult children look after a parent who lives alone, often from another city. A doorbell camera gives them footage and a stream of motion pings, but no answer to the question they actually have: *is Mum's day going normally?* The signals that matter are absences and timing. The carer didn't come. Nobody opened the door all morning. A parcel has sat on the step since lunch. The bell rang at midnight. Those are invisible in a clip feed. We wanted a companion that watches for those, describes the day in plain words, and otherwise stays quiet.

## What it does

- **Plain-language event descriptions.** Each Ring event becomes one plain sentence ("A package delivery at the front door at 14:05"), designed to be written by a vision model; descriptions describe what happens and never identify anyone.
- **Caretaking alerts**, from a deterministic rules engine rather than AI:
  - **Quiet morning**: no door activity by 10:30 (configurable).
  - **Missed visit**: a scheduled visitor (home aide, nurse, meal delivery) didn't appear in their window.
  - **Package left out**: still on the porch after 3 hours, or after dark.
  - **Late-night door activity**: someone at the door between 23:00 and 05:00.
  - **Unanswered doorbell**: a best-effort heuristic, labelled as such.
- **Every alert explains itself.** Opening an alert shows:
  - the full-size snapshot, with Ring's watermark intact;
  - the caption;
  - a plain-language reason tied to the family's own care plan, e.g. "Doorbell at 23:41 — outside Grace's usual hours (05:00–23:00)";
  - what else happened at the door within ±10 minutes.
- **Caretaker actions, not just notifications.** **Call Grace** or **Call the aide/neighbour** (one tap, from the care plan's contacts), **That was expected** (and optionally add the visitor to the schedule), or **Remind me in 30 min**. Each alert keeps a history of what was done.
- **Look now.** From any alert, open a live WebRTC view of the Ring camera (WHEP), proxied by our server so the token stays private. Verified against the Developer Playground.
- **Gentle escalation.** An urgent late-night alert that nobody acknowledges for 15 minutes is marked as escalated to a second family member, in-app.
- **Daily digest**: a short, warm note on the parent's day at the door.
- **A care plan** where the family describes a normal day: visitors' windows, quiet-morning time, night hours, package threshold.
- **Visual doorbell for the living room**: a full-screen, high-contrast "someone is at the door" web page for a TV or tablet, with the description. Dismiss with OK/Enter; it clears itself after a minute. Built for residents who can't hear the chime.
- **Honest demo modes.** LIVE (real Ring Developer Playground), REPLAY (recorded Playground responses), SCENARIO (timed synthetic events, labelled "Simulated"). A badge on every screen shows which is active.

## How we built it

- **Next.js 15 (App Router) + TypeScript (strict) + Tailwind 4**, with server route handlers for every external API call. Secrets never reach the browser.
- **Ring Partner API client** (`src/lib/ring/`), used at runtime by the poller, the onboarding token check and the fixture recorder:
  - `GET /v1/devices?include=status,capabilities,configurations` with typed JSON:API normalization (`included` resolved by type + id).
  - `GET /v1/history/devices/{id}/events`, paginated newest-first via `links.next` `page[key]`.
  - `POST /v1/devices/{id}/media/image/download` (`at_timestamp`, 1920×1080 requested explicitly). It follows the 303 to the pre-signed URL manually, without forwarding the Bearer token.
  - `POST`/`DELETE /v1/devices/{id}/media/streaming/whep/sessions` for the "Look now" live view. The server relays the browser's SDP offer and closes the session via the returned `Location` (F-15).
  - Exponential backoff honouring `Retry-After` on 429/5xx. A 401 becomes a "token expired — paste a new Playground token" flow in the UI.
- **Polling instead of webhooks.** The Playground doesn't deliver webhooks, so a background poller reads Event History in LIVE mode, or advances a simulated clock in SCENARIO mode. It then runs snapshot → description → rules → alerts.
- **A pure rules engine** (`src/lib/rules/engine.ts`) evaluated in the parent's time zone, with deterministic alert ids so a family's actions survive re-evaluation. A pure `explainAlert` turns each alert into a care-plan-specific "why". It's covered by Vitest, including DST spring-forward and fall-back days.
- **SQLite** (better-sqlite3) for local-first, zero-setup storage: `npm install && npm run setup && npm run dev`.
- **A fixture recorder** (`npm run record`) captures real Playground responses and snapshots for REPLAY. It refuses to write any file containing the token.

## Privacy

No face recognition, no biometric matching, no identification of anyone. This is a deliberate design decision, not a limitation. "Missed visit" means *nobody* came to the door in the window; visitor names are labels for the family only. Ring snapshots are always shown uncropped, so Ring's mandatory watermark stays intact. Tokens and credentials stay on the server, and data stays in a local SQLite file.

## Challenges we ran into

- **The Ring Developer Playground doesn't deliver webhooks**, and its tokens last ~30 minutes. We designed three explicit data modes (live / replayed / simulated) and label them on screen, so the demo never pretends.
- **Event History has no documented time-range filter**, so "today's events" means paginating backwards until we pass the window (friction F-01).
- **Event-type vocabulary differs between webhooks and history**, especially for packages (F-02). In the Playground every simulated event came through as `on_demand` (F-12).
- **Playground data access starts at each token's issue time.** Fresh tokens see empty history and get undocumented 403s for earlier media (F-09). That led to a real product insight: Doorstep never claims "nobody came" for time it couldn't see. Absence-based alerts respect when coverage began, and the app says "watching since 23:43".
- **The official sample app's device normalization doesn't match the documented schema** (F-03, F-04).

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

<!-- OPEN-SOURCE:START -->
## Open Source contribution

- **Contribution URL:** https://github.com/AmazonAppDev/ring-api-helloworld/pull/45 (opened Oct 22, 2026, from the fork https://github.com/breakthrough-child/ring-api-helloworld)
- **Our project repository:** https://github.com/breakthrough-child/doorstep
- **GitHub username:** breakthrough-child
- **What it does:** Adds `scripts/image_snapshot.py` to Amazon's official Ring sample (`ring-api-helloworld`), plus README entries. It downloads a snapshot from a Ring device at an event's time (`--from-history`) or the latest frame.
- **How it works:**
  - It calls `POST /v1/devices/{id}/media/image/download` with `image_options.resolution` set to 1920×1080 explicitly.
  - It follows the `303` to the pre-signed URL itself, without forwarding the Bearer token.
  - It turns `TIME_RANGE_NOT_AUTHORIZED`, `MEDIA_NOT_FOUND` and `RECORDING_NOT_READY` (including errors from the pre-signed host) into plain hints.
  - It was tested against the Ring Developer Playground on Oct 22, 2026.
- **Why it matters:** The sample had no snapshot example. The three behaviours that cost us the most time aren't in the docs:
  - omitting `resolution` silently returns 640×360, so the watermark covers far more of the frame;
  - a fresh Playground token has no media before its issue time;
  - errors can arrive on the second, pre-signed hop.

  The next developer gets a working, documented snapshot call in one command.
<!-- OPEN-SOURCE:END -->

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



### Next.js, Node.js, better-sqlite3 (supporting tools)

- Next.js App Router route handlers kept every secret server-side. `instrumentation.ts` hosts the background poller. One gotcha: native modules imported from instrumentation must be behind a `NEXT_RUNTIME === "nodejs"` dynamic import, or the edge bundle fails.
- Node 20+'s 250 ms happy-eyeballs connect timeout broke every `fetch` (including npm) on our high-latency connection. We fixed it with `net.setDefaultAutoSelectFamilyAttemptTimeout`.

## Feature requests

| Priority | Product | Request |
|---|---|---|
| **Critical** | Ring Playground | Deliver webhooks (or a "send test webhook to my URL" button) for simulated events. |
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

- Repository: https://github.com/breakthrough-child/doorstep (public, MIT)
- Demo video: [fill in]
- Friction log: `FRICTION_LOG.md` in the repo
