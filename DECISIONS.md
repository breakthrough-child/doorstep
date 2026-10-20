# Decisions

Defaults chosen without asking, and why. Newest at the bottom of each section.

## Product

- **Persona defaults.** Parent "Grace", family member "Ada", time zone `Africa/Lagos` (the builder's zone; editable in Care plan and via `DEFAULT_TIME_ZONE`).
- **Default visitors.** Home aide every day 09:00–10:30; meal delivery Mon–Fri 12:00–13:00. A daily aide makes the "missed aide visit" scenario work on any weekday of the demo.
- **"A visit" = any person or doorbell event in the window (±15 min grace).** Doorstep never identifies people, so it can't know *who* came. Visitor names are only labels for the family. This is the privacy stance, and the UI says so.
- **Quiet morning counts activity from the end of the late-night window (05:00) to the deadline (10:30).** A 02:00 event is late-night activity, not a sign the parent is up. Vehicles, animals and live views don't count as door activity. Packages and generic motion do.
- **Quiet morning and missed visit "clear" (not "resolve") when activity shows up later.** The alert stays in the history with a sage "Door activity at 11:20" chip. Resolving is the family's action.
- **Package pickup = a later snapshot where the model says no package is visible.** A later *person* event that hasn't been described yet is treated as a pickup, to avoid false alarms. A person walking past while the package is still visible is not a pickup.
- **"After dark" is a configurable time (default 18:30), not sunset.** The Ring location API only exposes country/state, which isn't enough for a sunset calculation. A package delivered after dark gets 30 minutes' grace before alerting.
- **Unanswered doorbell = no "door open" or "two people together" signal within 3 minutes of the last ring.** Repeated rings inside the window are one visit. It's labelled "best-effort guess" everywhere.
- **Late-night bursts within 15 minutes are one alert.** It's the only "urgent" (rose) rule; everything else is amber "worth a look".
- **Alert ids are deterministic** (`rule:subject:date`), so re-running rules never duplicates alerts or loses "I'm on it" / "All sorted".
- **Rules wait for in-flight descriptions** (up to 5 minutes). Tags decide pickups and answers, so we don't judge the day past an event whose caption is still coming.
- **Alert actions are "I'm on it" (acknowledge) and "All sorted" (resolve)**: warmer wording for the same state machine.

## Data modes

- **Default data mode is REPLAY.** A fresh clone shows real-shaped Ring data with no credentials.
- **Replay time-shift.** Recorded events are shifted so the newest lands 10 minutes before "now", keeping their spacing. Otherwise a recording from Tuesday would show an empty "today" on Friday. The badge and the demo panel show the recording date.
- **Placeholder fixtures.** Until a Playground token was available, `fixtures/placeholder/` held hand-written responses shaped exactly per the published schema, with Doorstep illustrations as images. `manifest.json` has `"synthetic": true` and the UI badge says "Placeholder fixtures". Real recordings go to `fixtures/playground/` and take precedence automatically.
- **Scenario images are drawn illustrations** (`scripts/gen-scenes.py`) stamped "SIMULATED SCENE · illustration, not a Ring camera image". We deliberately don't imitate the Ring watermark.
- **Scenario speeds: 1×, 10×, 60×, plus 300×.** 300× isn't in the brief, but a 15-hour day at 60× takes 15 minutes. At 300× it takes 3, which fits a 2:50 video. The panel also has "+30 min" / "+2 h" skips.
- **Scenarios may pin their own visitor schedule** (`quiet_morning` pins none, as a Sunday). That keeps them reproducible whatever the care plan says.
- **Scenario event ids have no date** (`sim:<scenario>:<n>`), so replaying a scenario reuses cached Bedrock captions instead of paying again.
- **`late_night_ding` starts at 22:30 with the day's earlier events pre-loaded**, so it doesn't also trip quiet-morning/missed-visit.

## Ring integration

- **LIVE mode polls Event History** (`GET /v1/history/devices/{id}/events`) every 30 s, because the Playground doesn't deliver webhooks. It paginates newest-first until past 24 h (no documented time filter, FRICTION F-01).
- **Snapshots via `at_timestamp` = event start + 1 s**, JPEG, no resolution set (full size keeps the fixed-size watermark smallest relative to the frame). Images are always shown with `object-contain` so the watermark is never cropped.
- **The 303 → pre-signed URL hop is followed manually without the Bearer header** (F-07).
- **A pasted token beats `RING_ACCESS_TOKEN`.** Playground tokens rotate every 30 min, and pasting in the UI is faster than restarting the server. Tokens are stored server-side in SQLite (in `data/`, git-ignored) and never returned to the browser.
- **Unknown event subtypes map to generic "motion"**, not dropped.

## AWS / Bedrock

- **Model: `us.amazon.nova-lite-v1:0`** (Nova Lite via the US cross-region inference profile, from `us-east-1`). It's cheap, multimodal, and serves both captions and digests. Configurable via `BEDROCK_MODEL_ID`. Nova 2 Lite (`us.amazon.nova-2-lite-v1:0`) is a drop-in alternative.
- **Converse API, JSON-only prompt + tolerant parser**, not tool-use structured output. Nova Lite follows a JSON-only instruction well, and the parser (zod, `.catch()` per field, first-balanced-object extraction, prose fallback) is unit-tested. Simpler, and one round trip.
- **`BEDROCK_MOCK` unset = auto.** Real Bedrock if AWS credentials are discoverable, otherwise canned captions. A fresh clone runs with zero setup, and the demo uses real Bedrock as soon as credentials exist.
- **After 3 failed Bedrock attempts for an event**, it gets an event-type caption labelled "Bedrock unavailable", so the timeline never sticks on "Describing…".
- **Captions are cached by event id forever** (scenario resets keep them), so we never pay twice.

## Engineering

- **Next.js 15.5 / React 19.3 / Tailwind 4 / TypeScript 5.9 / Vitest 5**, pinned to versions already in the local npm cache. The registry was very slow on the build machine (~70 KB/s, see below).
- **better-sqlite3**, not Drizzle: one small schema, synchronous API, zero setup.
- **Poller in `instrumentation.ts`** (`setInterval`, 1.5 s). `/api/state` also calls the single-flight `tick()`, so the app works even if the poller is disabled.
- **Node `net.setDefaultAutoSelectFamilyAttemptTimeout(2500)`** (`src/lib/net.ts`). On the build machine's network every Node `fetch` failed with `ETIMEDOUT` because Node 20+'s 250 ms per-address happy-eyeballs timeout is too short for the connection's latency. Curl worked. This affected npm too (fixed with `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`). It isn't a Ring/AWS issue, so it's not in the friction log, but judges on slow links benefit.
- **Fonts: Fraunces (display) + Atkinson Hyperlegible (body)** from Google Fonts at runtime, with system fallbacks. Atkinson Hyperlegible was designed for low-vision readers, which fits the audience.
- **Web TV preview at `/tv`** mirrors the Fire TV app's screen. It doubles as a fallback in the video if the Vega Virtual Device can't run on this machine.
