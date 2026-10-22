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
- **Alert ids are deterministic** (`origin:rule:subject:date`), so re-running rules never duplicates alerts or loses "I'm on it" / "All sorted". The origin prefix keeps a replayed day and a simulated day on the same date from overwriting each other (a bug we hit).
- **A late arrival only clears a missed visit if it's within 2 hours of the deadline and not inside another scheduled visitor's window.** Otherwise the lunch delivery would "clear" the aide's missed visit.
- **`missed_aide_visit` pins a daily schedule** (aide + lunch delivery every day), so the demo behaves the same on a weekend.
- **Rules wait for in-flight descriptions** (up to 5 minutes). Tags decide pickups and answers, so we don't judge the day past an event whose caption is still coming.
- **Alert actions are "I'm on it" (acknowledge) and "All sorted" (resolve)**: warmer wording for the same state machine.

## Alert experience (Thu Oct 22)

- **Every alert has a detail page** (`/alerts/[id]`) with:
  - the full-size snapshot of the *first* cited event (e.g. the first ring), uncropped;
  - its caption, labelled "Sample caption" when not from Bedrock;
  - a "why Doorstep flagged this" sentence generated from the care plan (pure `explainAlert`, unit-tested);
  - the action history;
  - door events within ±10 minutes as a mini timeline with thumbnails.
- **Caretaker actions replace "I'm on it / All sorted":** **Call [parent]**, **Call [helper]**, **That was expected**, **Remind me in 30 min**, plus a quiet "It's sorted" link.
  - Calls are `tel:` links; tapping one logs "Called Grace" and acknowledges the alert.
  - "That was expected" resolves the alert. When the alert cites a person or doorbell event, it optionally adds a visitor to the schedule for that weekday, ±30 minutes around the event (editable).
- **Call order:** the parent first; for a missed visit, the aide next; then the neighbour. The second family contact isn't offered as a call target, because they're who alerts escalate *to*.
- **In-app escalation only.** An **urgent** (late-night) alert that is still `open`, not snoozed and not acted on 15 minutes (app time) after it fired is marked "Escalated to [second family contact]". This is shown in rose on the card and the detail page and recorded in the history. No SMS or email is sent.
- **App time for reminders and escalation.** In SCENARIO mode, "Remind me in 30 min" and the 15-minute escalation run on the simulated clock (30 s and 15 s at 60×), so they can be demonstrated. A reminder can't come due after a scenario's end time.
- **Snoozed alerts don't count toward "needs your attention".** The hero says "1 reminder set for later" instead.
- **Default contacts use fictional numbers** from Ofcom's range reserved for drama (+44 7700 900xxx): Grace, Ngozi (home aide), Mr Bello (neighbour), Chidi (Ada's brother, the second family contact).
- **Every timeline item opens an event page** (`/events/[id]`) showing the snapshot, time, Ring event type, data-source label ("Live from Ring" / "Recorded from Ring Playground" / "Simulated"), caption source, and any alerts citing it. The old lightbox dialog was removed.

## Data modes

- **Default data mode is REPLAY.** A fresh clone shows real-shaped Ring data with no credentials.
- **Replay time-shift.** Recorded events are shifted so the newest lands 10 minutes before "now", keeping their spacing. Otherwise a recording from Tuesday would show an empty "today" on Friday. The badge and the demo panel show the recording date.
- **Placeholder fixtures.** Until a Playground token was available, `fixtures/placeholder/` held hand-written responses shaped exactly per the published schema, with Doorstep illustrations as images. `manifest.json` has `"synthetic": true` and the UI badge says "Placeholder fixtures". Real recordings go to `fixtures/playground/` and take precedence automatically.
- **Scenario images are drawn illustrations** (`scripts/gen-scenes.py`) stamped "SIMULATED SCENE · illustration, not a Ring camera image". We deliberately don't imitate the Ring watermark.
- **Scenario speeds: 1×, 10×, 60×, plus 300×.** 300× isn't in the brief, but a 15-hour day at 60× takes 15 minutes. At 300× it takes 3, which fits a 2:50 video. The panel also has "+30 min" / "+2 h" skips.
- **Scenarios may pin their own visitor schedule** (`quiet_morning` pins none, as a Sunday). That keeps them reproducible whatever the care plan says.
- **Scenario event ids have no date** (`sim:<scenario>:<n>`), so replaying a scenario reuses cached Bedrock captions instead of paying again.
- **`late_night_ding` starts at 22:30 with the day's earlier events pre-loaded**, so it doesn't also trip quiet-morning/missed-visit.

- **Absence rules respect coverage.** The Playground only authorizes data from each token's issue time (F-09). "Quiet morning" and "missed visit" never fire for a window that began before Doorstep could see the door. The app shows "watching since 23:43", and visits read "Before Doorstep was watching". LIVE uses the token's JWT `iat`; REPLAY uses the recording's `coverageStartMs` (time-shifted); scenarios are full-day.
- **Untouched open alerts that rules stop producing are removed** (e.g. after coverage or the care plan changes). Acknowledged or resolved alerts are never removed.
- **REPLAY uses the real Playground recording only; the hand-written placeholder fixtures were retired.** The Playground's 6 simulated events all arrived as `on_demand` (F-12), so REPLAY shows real Ring frames and the API path, and SCENARIO demonstrates the caretaking rules.
- **Recorded snapshots carry hand-written sample captions in `fixtures/playground/manifest.json`**, used only while Bedrock is unavailable and labelled "Sample caption" exactly like scenario captions. Real Nova Lite captions replace them automatically.
- **Replay shift keeps the recording inside today** where possible (just after midnight the default shift would split it across days).
- **Template digest** (used when Bedrock is unavailable) names actual arrival times and whether a package was brought in, and is labelled "Sample digest from a template".

## Ring integration

- **LIVE mode polls Event History** (`GET /v1/history/devices/{id}/events`) every 30 s, because the Playground doesn't deliver webhooks. It paginates newest-first until past 24 h (no documented time filter, FRICTION F-01).
- **Snapshots via `at_timestamp` = event start + 1 s, JPEG, explicitly 1920×1080.** Omitting `resolution` returned 640×360 in the Playground despite the docs (F-10). Full size keeps the fixed-size watermark smallest relative to the frame. Images are always shown with `object-contain` so the watermark is never cropped.
- **The 303 → pre-signed URL hop is followed manually without the Bearer header** (F-07).
- **A pasted token beats `RING_ACCESS_TOKEN`.** Playground tokens rotate every 30 min, and pasting in the UI is faster than restarting the server. Tokens are stored server-side in SQLite (in `data/`, git-ignored) and never returned to the browser.
- **Unknown event subtypes map to generic "motion"**, not dropped.

## AWS / Bedrock

- **Model: `eu.amazon.nova-lite-v1:0` from `eu-north-1`** (Nova Lite via the EU cross-region inference profile), per the account owner's instruction, since the hackathon AWS account lives in Stockholm. It's cheap, multimodal, and serves both captions and digests. Configurable via `BEDROCK_MODEL_ID` / `AWS_REGION` (`BEDROCK_REGION` overrides the region for Bedrock only).
- **Converse API, JSON-only prompt + tolerant parser**, not tool-use structured output. Nova Lite follows a JSON-only instruction well, and the parser (zod, `.catch()` per field, first-balanced-object extraction, prose fallback) is unit-tested. Simpler, and one round trip.
- **Real Bedrock is the default path; labelled sample captions are the fallback.** The account's Nova Lite quotas are 0 (F-08), so when a call fails Doorstep records the exact error and gives the event a sample caption. Scenario events use their scripted sentence; others use an event-type sentence. Samples are labelled in the timeline, in a note above it and on digests. Bedrock is retried after a cooldown: 10 min for "per day" quota errors, 5 min for access/validation errors, 1–2 min otherwise. The first success flips back to Nova Lite and re-captions samples (3 at a time, when idle).
- **SDK `maxAttempts: 2`** so a throttled/zero-quota account doesn't stall each pipeline tick for ~15 s.
- **`npm run check:bedrock`** makes one real image+text call and prints success or the exact error. It also updates the running app's Bedrock status.
- **`BEDROCK_MOCK=1`** forces samples (offline dev). Unset: real whenever credentials are discoverable. With no credentials at all (a judge's fresh clone), samples are used and labelled.
- **SUBMISSION.md marks the AWS Builder material with `AWS-BUILDER` markers**, and `npm run submission:no-aws` produces a clean variant, in case Bedrock isn't unlocked by Thursday evening.
- **Captions are cached by event id forever** (scenario resets keep them), so we never pay twice.

## Engineering

- **Next.js 15.5 / React 19.3 / Tailwind 4 / TypeScript 5.9 / Vitest 5**, pinned to versions already in the local npm cache. The registry was very slow on the build machine (~70 KB/s, see below).
- **better-sqlite3**, not Drizzle: one small schema, synchronous API, zero setup.
- **Poller in `instrumentation.ts`** (`setInterval`, 1.5 s). `/api/state` also calls the single-flight `tick()`, so the app works even if the poller is disabled.
- **Node `net.setDefaultAutoSelectFamilyAttemptTimeout(2500)`** (`src/lib/net.ts`). On the build machine's network every Node `fetch` failed with `ETIMEDOUT` because Node 20+'s 250 ms per-address happy-eyeballs timeout is too short for the connection's latency. Curl worked. This affected npm too (fixed with `NODE_OPTIONS=--network-family-autoselection-attempt-timeout=3000`). It isn't a Ring/AWS issue, so it's not in the friction log, but judges on slow links benefit.
- **Fonts: Fraunces (display) + Atkinson Hyperlegible (body)** from Google Fonts at runtime, with system fallbacks. Atkinson Hyperlegible was designed for low-vision readers, which fits the audience.
- **No Fire TV app; the visual doorbell ships as a web page (`/tv`).** The Vega SDK's Linux installer requires removing and reinstalling the system curl, adding the deadsnakes PPA, Python 3.8 headers and KVM setup (F-14). The account owner decided not to make system package changes on the only dev machine. The Fire TV track isn't claimed in SUBMISSION.md. `/tv` keeps the 10-foot design (large type, OK/Enter dismisses, auto-clear after 60 s) as an accessibility feature.
