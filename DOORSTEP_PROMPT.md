# Build "Doorstep" — Amazon Developer Hackathon entry (Ring track + Fire TV + AWS Builder)

You are building a complete, demo-ready hackathon submission end to end. Work autonomously. Do not stop after each phase to ask for approval, do not present plans and wait, and do not ask me to choose between options when a sensible default exists — pick it, note it in `DECISIONS.md`, and keep going. The only things you may stop and ask me for are credentials or actions only I can perform (listed in "What only I can do"). While waiting on those, keep building against mocks and fixtures.

## Hard facts and deadline

- Hackathon: "Build, Ship, Shape: Amazon Developer Hackathon" on Devpost (amazonappdev2026.devpost.com).
- **Deadline: Friday Oct 23, 2026, 12:00 PDT (20:00 Lagos time).** It is now Tuesday Oct 20. Time budget:
  - By end of Wednesday: core Ring + Bedrock + web app working end to end in replay mode.
  - By Thursday midday: live Playground mode verified, UI polished, Fire TV (Vega) companion if core is solid.
  - Thursday evening: submission docs, demo script, friction log finalized.
  - Friday morning is buffer only. Nothing new gets started on Friday.
- My machine: **Ubuntu**, laptop only, no Ring device, no Fire TV device.
- I am a solo developer comfortable with Next.js, TypeScript, Tailwind.

## The product

**Doorstep** — a caretaking companion for families looking after an elderly parent who lives alone, built on the Ring Partner API.

It turns raw Ring front-door events into calm, plain-language information a family member actually wants:

1. **AI event descriptions.** Each Ring event (motion/human, ding, package, vehicle) gets its snapshot analyzed by Amazon Bedrock (vision model) into one plain sentence, e.g. "A courier left a package on the porch; it's still there." Describe what happens; never identify people (no face recognition, no biometric matching — this is a deliberate privacy decision, document it).
2. **Caretaking alerts** (the core value — rules engine, not AI):
   - **Quiet morning:** no door activity of any kind by a configurable time (default 10:30 local).
   - **Missed visit:** a scheduled visitor (home aide, nurse, meal delivery — family sets name + expected window) didn't appear in their window.
   - **Package left out:** a package event with no later pickup activity for N hours (default 3), or still out after dark.
   - **Late-night door activity:** human motion/ding at the front door between configurable hours (default 23:00–05:00).
   - **Unanswered doorbell:** a ding with no human activity at the door afterward within a short window (best-effort heuristic; label it as such).
3. **Daily digest:** a Bedrock-written, warm, short summary of the parent's day at the door ("Mum's day: the aide came 9:10–10:40, a package arrived at 14:05 and was brought in, quiet evening."), plus the alert list.
4. **Visual doorbell for the living room (Fire TV, stretch):** when someone is at the door, a full-screen visual alert on the TV with the AI description; dismiss with the D-pad. Pitch: accessibility for deaf/hard-of-hearing residents who can't hear the chime.

Target user story for the demo: "Ada lives in another city. Her mother Grace lives alone. Doorstep tells Ada when something is off — and leaves her alone when it isn't."

## Ring Partner API — what to know (verify everything against the docs)

Read these before writing integration code and follow them over anything I say here:
- Ring Partner API docs: https://developer.amazon.com/docs/ring/api-documentation.html
- Ring API development guide: https://developer.amazon.com/docs/ring/develop.html
- Ring release notes (Playground details): https://developer.amazon.com/docs/ring/release-notes.html
- Official sample app (Next.js): the `ring-api-helloworld` GitHub repo linked from the dev guide. Study its client, token handling and JSON:API normalization.

Known constraints:
- Base URL `https://api.amazonvision.com`, JSON:API responses, Bearer token auth. Device discovery e.g. `GET /v1/devices?include=status,capabilities`.
- **Developer Playground** gives sandbox access with no device, no account linking, no subscription. **Tokens last ~30 minutes. The Playground does not deliver webhooks.** Some snapshot range queries may return 403 — handle gracefully and log it to the friction log.
- Media now carries a mandatory Ring watermark — never crop or hide it.
- Respect privacy zones and any user privacy settings the API exposes.

Design the integration with three data modes, selectable by env var and shown as a visible badge in the UI so the demo is honest:
- `LIVE` — calls the real Playground/API with `RING_ACCESS_TOKEN`.
- `REPLAY` — serves recorded real Playground responses from `fixtures/` (build a recorder script that captures devices, history/events and snapshots from a live token into fixtures, stripping the token).
- `SCENARIO` — a scenario player that injects timed synthetic events on top of replayed device data, because webhooks aren't delivered in the Playground. Ship scenarios: `grace_normal_day`, `missed_aide_visit`, `package_left_out`, `quiet_morning`, `late_night_ding`. Scenario events must be clearly labeled simulated in the UI.

The Ring client must be real code that is imported and called at runtime (a hackathon requirement — mentions in the README don't count). Put it in its own module with typed responses, retry/backoff, token-expiry detection with a clear "token expired — paste a new Playground token" UX, and JSON:API include/normalization.

## AWS (AWS Builder mini challenge)

- Use **Amazon Bedrock** via `@aws-sdk/client-bedrock-runtime` Converse API. Default model: Amazon Nova Lite (image + text, very cheap); make the model ID an env var. Region default `us-east-1`. Verify current model IDs and whether model access must be enabled in the console; document it.
- Two Bedrock uses: (1) per-event snapshot description (image in, one sentence + structured JSON tags out), (2) daily digest generation. Use structured output / strict JSON parsing with a fallback.
- Cache every Bedrock result keyed by event ID so we never pay twice; add a `BEDROCK_MOCK=1` mode for development that returns canned outputs, but the demo must use real Bedrock.
- Keep spend trivial (cents). Log token usage per call.
- Document the AWS integration precisely in `docs/AWS.md` (services, why, data flow, cost) — this text is required in the submission.

## Tech stack

- Next.js (App Router) + TypeScript (strict) + Tailwind. Server-side route handlers for Ring and Bedrock calls; secrets never reach the client.
- Persistence: SQLite (better-sqlite3 or Drizzle + SQLite) — local-first, zero setup for judges. Tables for devices, events, descriptions, alerts, schedules, digests, settings.
- A background "poller" (interval in dev server or a simple script) that pulls new events in LIVE mode, or advances the scenario clock in SCENARIO mode, then runs description → rules → alerts.
- Tests: Vitest for the rules engine (every alert rule with edge cases, time zones) and for JSON:API normalization. Rules engine must be pure functions.
- `.env.example` with every variable documented. One-command setup: `npm install && npm run setup && npm run dev`, where setup creates the DB and loads fixtures.
- License: MIT, public repo.

## UI (Design is 25% of judging — make it feel like a real product)

Web app for the family member, mobile-first and desktop-good:
- **Today** screen: big calm status ("All normal today" / "1 thing needs your attention"), timeline of the day's door events with snapshot thumbnail (watermark intact) + AI sentence, alerts pinned on top.
- **Alerts** screen with acknowledge/resolve.
- **Digest** screen: today's and past digests.
- **Care plan** settings: parent's name, time zone, quiet-morning time, late-night hours, scheduled visitors (name, days, window), package threshold.
- **Onboarding:** connect Ring (paste Playground token in dev, explain OAuth account linking for production), pick the camera, set the care plan.
- **Demo control panel** (hidden route `/demo`): choose data mode, play a scenario at 1x/10x/60x, reset state. This is what I'll drive while recording.

Visual direction: warm and reassuring, not a security dashboard — soft neutral palette, generous type, no red-siren aesthetics except for genuine alerts. Accessible: WCAG AA contrast, keyboard navigable, screen-reader labels, respects reduced motion. Use the `frontend-design` guidance mindset: intentional, not templated.

## Fire TV companion (stretch — only start if the core is done and tested)

- Build a minimal Vega OS app (React Native) in `tv/` using the Vega SDK on Ubuntu, running in the Vega Virtual Device (VVD). Read the Vega install/getting-started docs first (developer.amazon.com/docs/vega/latest/install-vega-sdk.html and the Vega "Hello World" guide); Vega Studio is a VS Code extension.
- The TV app polls the Doorstep backend (figure out the VVD → host networking) for "someone is at the door" events and shows a full-screen, high-contrast visual alert with the AI description and time; D-pad focus works correctly; "OK" dismisses; it auto-clears after 60s. A simple idle screen shows today's status.
- Proper 10-foot UI: large type, clear focus states, safe-area margins.
- If Vega setup blocks for more than ~2 hours, stop, log it in the friction log in detail, and drop the TV app rather than risk the core. Note it in `DECISIONS.md`.

## Submission materials (write these as you go, finalize Thursday)

- `README.md`: what it is, the problem, screenshots/GIFs, architecture diagram (Mermaid), setup in under 5 commands, data modes explained honestly, what's live vs replayed vs simulated, privacy stance.
- `SUBMISSION.md` containing ready-to-paste Devpost answers:
  - Project description (what it does, how it works).
  - Tracks: Ring (primary), Fire TV (only if the TV app works), AWS Builder mini challenge.
  - **Product feedback for every tool/API/SDK used** (Ring Partner API, Ring Developer Playground, Bedrock/Nova, Vega SDK/VVD if used, Next.js etc. as relevant): what it was used for, what worked well, what needs work, onboarding experience zero→hello world, would you build with it again and why. Include the AWS services description here.
  - Feature requests with priority (Critical / Important / Nice-to-have).
- `FRICTION_LOG.md` — **maintain this continuously from the first minute**, because it's worth up to a 10% judging bonus. Every real problem you hit with Ring, the Playground, Bedrock, or Vega gets an entry with: task attempted, steps taken, expected vs actual, severity, workaround, actionable suggestion. Real, specific, reproducible — no padding.
- `DEMO_SCRIPT.md` — a shot-by-shot script for a video under 2:50: open in the first 15 seconds on the payoff (an alert firing on Ada's phone-sized view, then the TV visual doorbell if built), then the problem, then a scenario run at 60x, the digest, a 20-second architecture beat showing the Ring client + Bedrock code, close on impact. Include exact clicks in `/demo` for each shot.
- `DECISIONS.md` — every default you chose without asking me.

## Working rules

- Initialize git immediately; commit small and often with clear messages; push when I've set up the remote.
- Build vertically: get one event flowing Ring(replay) → Bedrock(mock) → rules → UI first, then widen.
- Run the tests and the app yourself; open the UI and check it visually (screenshots) before calling a screen done.
- Never commit secrets. Never fabricate API behavior: if the docs and the Playground disagree, follow the Playground and log it.
- At the end, do a final pass as a judge would: fresh clone, follow the README exactly, confirm it runs; fix anything that breaks.

## What only I can do (ask me for these, then keep working)

1. A Ring Developer Playground access token (I'll generate it from the Ring developer portal when you need to record fixtures or test LIVE — tell me when, since it expires in 30 minutes).
2. AWS credentials with Bedrock access (I'll put them in `.env.local`).
3. Creating the GitHub repo and pushing.
4. Recording and uploading the demo video, and submitting on Devpost.

Start now: set up the repo, read the Ring docs and sample app, and build the first vertical slice in replay + mock mode.
