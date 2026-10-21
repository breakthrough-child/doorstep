# Doorstep — Friction Log

A running log of real problems hit while building Doorstep on the Ring Partner API, the Ring Developer Playground, Amazon Bedrock and (if attempted) the Vega SDK. Each entry is specific and reproducible. Severity: **High** (blocked or forced a design change), **Medium** (cost real time, workaround exists), **Low** (annoyance or polish).

Environment: Ubuntu laptop, Node 22.22, no Ring hardware, no Fire TV hardware. Dates are 2026.

---

## F-01 · Event history has no documented time-range or page-size parameters

- **Area:** Ring Partner API — `GET /v1/history/devices/{device_id}/events`
- **Date:** Tue Oct 20
- **Task attempted:** Pull "today's" door events for a device so the rules engine can evaluate a single local day.
- **Steps:** Read the Event History section of the API reference (api-documentation.html).
- **Expected:** `start`/`end` (or `since`) query parameters and a `page[size]`/`limit`, as is usual for a history endpoint.
- **Actual:** Only `event_types` and `page[key]` are documented. Results are newest-first and `links.next` carries an ISO timestamp cursor (`page[key]=<iso_timestamp>`). Fetching "the last 24 hours" means paginating backwards until an event's `start` is older than the window, with no way to bound page size.
- **Severity:** Medium
- **Workaround:** The Doorstep Ring client paginates newest-first and stops as soon as it sees an event older than the requested `since` timestamp, with a hard page cap.
- **Suggestion:** Document (or add) `filter[start]`/`filter[end]` and `page[size]`. If the `page[key]` ISO timestamp can be set by clients to seek, say so explicitly — that would solve it.

## F-02 · Package events: webhook sub_type and history event_types disagree

- **Area:** Ring Partner API — docs consistency
- **Date:** Tue Oct 20
- **Task attempted:** Map Ring events to Doorstep's categories (person, ding, package, vehicle).
- **Steps:** Compared the `motion_detected` webhook schema with the Event History `event_types` filter list.
- **Expected:** One vocabulary for event subtypes.
- **Actual:** The webhook `sub_type` lists `motion`, `human`, `vehicle`, `package_delivery`, `other_motion`. The history filter lists `motion.human`, `motion.vehicle`, `motion.animal`, `motion.other_motion` — no package subtype and an `animal` subtype the webhook doesn't mention. The Playground release notes (May 28) advertise "Package" event simulation. It's unclear how a package event appears in history.
- **Severity:** Medium (package-left-out is one of our core alerts)
- **Workaround:** The normalizer accepts any of `package`, `package_delivery`, `motion.package`, `motion.package_delivery` and maps them to `package`; unknown subtypes fall back to `motion`. To be confirmed against real Playground output (see later entries).
- **Suggestion:** Publish a single canonical table of event types/subtypes, and state which appear in history vs webhooks.

## F-03 · Official sample app's device normalization doesn't match the documented schema

- **Area:** `AmazonAppDev/ring-api-helloworld` (commit 76100aa, Jul 1 2026), `app/api/ring/devices/route.ts`
- **Date:** Tue Oct 20
- **Task attempted:** Reuse the sample's JSON:API normalization as a reference.
- **Steps:** Read the route; compared to the Device Discovery docs.
- **Expected:** Sample uses `?include=status,capabilities` and resolves `included` by `type`+`id`, as documented.
- **Actual:** The sample calls `GET /v1/devices` with no `include` and reads `device.attributes.online` and `device.attributes.capabilities`. Per the docs, `online` lives on the separate `device-status` resource and capabilities on `device-capabilities`; the device resource only has `name` and `image_url`. As written, every device would show `online: false`.
- **Severity:** Low (for us — we wrote our own normalizer), Medium for newcomers copying the sample
- **Workaround:** Doorstep has its own typed JSON:API normalizer with tests (`src/lib/ring/jsonapi.ts`).
- **Suggestion:** Update the sample to use `include=status,capabilities` and resolve `included`.

## F-04 · Sample app says there's no polling API for events, and invents webhook fields

- **Area:** `ring-api-helloworld` — `app/api/ring/events/route.ts`, `lib/types/webhook.ts`
- **Date:** Tue Oct 20
- **Task attempted:** Decide how to get events in the Playground, which doesn't deliver webhooks.
- **Actual:** The events route comment says "Ring doesn't have a polling API for events - they're delivered via webhooks", yet the API reference documents `GET /v1/history/devices/{id}/events`. The sample's webhook types also include `person_detected`, `confidence`, `bounding_box` and `thumbnail_url`, none of which appear in the v1.1 webhook schema.
- **Severity:** Medium — a Playground-only developer reading the sample would conclude events are unreachable.
- **Workaround:** Doorstep polls Event History in LIVE mode.
- **Suggestion:** Point the sample at Event History for Playground use, and align its types with the published schema.

## F-05 · Sample app exposes the Ring access token to the browser

- **Area:** `ring-api-helloworld` — `app/api/ring/token/route.ts`
- **Date:** Tue Oct 20
- **Actual:** `GET /api/ring/token` returns `{ accessToken }` to any caller, while the API docs say Ring calls must come from the partner backend. Probably there for client-side WHEP, but it's an anti-pattern for a "production-ready" sample.
- **Severity:** Low (security hygiene)
- **Workaround:** Doorstep never sends the token to the client; all Ring calls are in server route handlers.
- **Suggestion:** Proxy the WHEP SDP exchange server-side, or at least add a prominent warning.

## F-06 · The API reference is one ~370k-character page

- **Area:** Ring docs — api-documentation.html
- **Date:** Tue Oct 20
- **Actual:** The whole reference (auth, devices, history, media, webhooks, subscriptions) is one ~990 KB HTML page. Tools that read docs in chunks (and people on slow links) struggle; deep links to sections are the only way to navigate.
- **Severity:** Low
- **Suggestion:** Split per resource, and publish an OpenAPI spec. That would also let partners generate typed clients instead of hand-writing them.

## F-07 · Image snapshot download is a two-step 303 redirect; the docs don't say whether the second hop needs the Bearer token

- **Area:** Ring Partner API — `POST /v1/devices/{id}/media/image/download`
- **Date:** Tue Oct 20
- **Actual:** Returns `303 See Other` with a pre-signed `Location`. Node's `fetch` follows 303 automatically, turning the POST into a GET and *forwarding the Authorization header* to the pre-signed host if it's same-origin, or dropping it cross-origin. The docs don't say which is expected; some pre-signed stores reject requests that also carry an Authorization header.
- **Severity:** Low/Medium
- **Workaround:** The Doorstep client uses `redirect: "manual"`, reads `Location`, and GETs it without the Bearer header.
- **Update (Wed Oct 21, real Playground):** The `Location` points at `download-us-east-1.prod.phoenix.devices.amazon.dev`, and an unauthenticated GET works. Errors can also come from that second hop, with a JSON:API body (see F-11), and the docs only describe errors on the first request.
- **Suggestion:** State that the pre-signed URL must be fetched without auth, give its expiry, and document that errors can arrive on either hop.

## F-08 · Bedrock: every Nova Lite quota in eu-north-1 provisioned at 0, mostly "Not adjustable"; runtime says "Too many tokens per day"

- **Area:** Amazon Bedrock — Service Quotas / Converse, Amazon Nova Lite (`eu.amazon.nova-lite-v1:0` from `eu-north-1`)
- **Date:** Wed Oct 21
- **Task attempted:** First real Bedrock call: caption one porch snapshot with Nova Lite via the Converse API (`npm run check:bedrock`).
- **Steps:**
  1. Created IAM credentials for the hackathon account, set `AWS_REGION=eu-north-1`, `BEDROCK_MODEL_ID=eu.amazon.nova-lite-v1:0`.
  2. `npm run check:bedrock` → one Converse call with a 1280×720 JPEG + a short prompt.
  3. Opened Service Quotas → Amazon Bedrock in eu-north-1.
- **Expected:** The call succeeds (on-demand serverless models are meant to work out of the box), or fails with an access/quota error that says what to fix.
- **Actual:**
  - The very first call fails: `ThrottlingException: Too many tokens per day, please wait before trying again.` (HTTP 429, request id `954594e7-95ac-4fcc-bdab-570cc55d7d5b`, ~15 s including the SDK's automatic retries).
  - Service Quotas shows every Nova Lite quota for the account in eu-north-1 **applied at 0**. For example, *tokens per day* is **0** vs an AWS default of **5.76 billion**. Most of these quotas are marked **"Not adjustable"**, so the console offers no self-service increase.
  - Raised a quota increase request and a support case. Bedrock remained blocked at time of writing.
- **Severity:** **High.** It blocks the AWS Builder integration entirely: no Bedrock call can succeed, and there's no self-service fix.
- **Why it hurt:** The error is a *throttling* error, which reads as "slow down" and which SDKs retry automatically. Its real meaning is "this account may not use this model at all". A new account gets no `AccessDeniedException` or `ServiceQuotaExceededException` and no console banner saying the account's Bedrock quotas are zero. You only find out by reading Service Quotas line by line.
- **Workaround:** Doorstep keeps real Bedrock as the default path. When a call fails it records the exact error, shows clearly labelled **sample captions**, and retries every 10 minutes for daily-quota errors. On the first success it switches to Nova Lite automatically and re-captions the samples. `npm run check:bedrock` makes one real call and prints success or the exact error with a hint. The SDK is limited to 2 attempts so a zero quota doesn't stall the pipeline.
- **Suggestions:**
  1. Return a distinct, non-retryable error (e.g. `ServiceQuotaExceededException` with "account quota for this model is 0 in this region") when the applied quota is zero, rather than a retryable `ThrottlingException`.
  2. Show a banner in the Bedrock console / model catalog when an account's on-demand quotas for a model are 0, with a link to request access.
  3. Make "Not adjustable" quotas explain *why*, e.g. new-account limits and when they lift, and offer a path that doesn't need a support case. Hackathon timelines are days, not weeks.

## F-09 · Playground: fresh token sees no events and no media; boundary is the token's issue time, enforced with an undocumented 403 code

- **Area:** Ring Developer Playground + Partner API (Event History, Image Snapshots)
- **Date:** Wed Oct 21, ~22:10–22:50 UTC
- **Task attempted:** Record real fixtures (`npm run record`) with a freshly generated Playground token.
- **Steps:**
  1. Generate a token, run the recorder: `GET /v1/devices?include=…` → 200 (1 "Playground Device").
  2. `GET /v1/history/devices/{id}/events` → **200 `{"data": []}`**. There's no `links` key at all, not even an empty `links.next`.
  3. `POST …/media/image/download` with `at_timestamp` 5 min, 20 min, 40 min, 2 h and 1 day before now → **403 `TIME_RANGE_NOT_AUTHORIZED`**, "Requested time range is not within authorized boundaries". `latest_in_range` over 23 h → the same 403.
  4. The same call for 10 s and 1 min ago (after the token's `iat`) → 303, then the pre-signed GET returns **416** (no recording).
  5. Triggered event simulation in the Playground UI, generated a new token, re-ran the recorder → exactly **one** history event, `event_type: "on_demand"`, with a snapshot.
- **Expected:** The Playground sandbox comes with some sample event history and media. At minimum, the docs list `TIME_RANGE_NOT_AUTHORIZED` and explain the boundary.
- **Actual:** The authorized window starts at the token's issue time ("only events after the user granted consent", applied to each Playground token). History is empty until you simulate an event, and every older media request fails with an error code that isn't in the Image Snapshots error table (which lists `REQUEST_FORBIDDEN` for 403).
- **Severity:** Medium. It cost a token's 30-minute lifetime to understand, and a recorder run immediately after generating a token captures nothing.
- **Workaround:** Simulate events in the Playground first, then record. Doorstep's client surfaces the 403 code in the API log and skips the snapshot.
- **Suggestions:** Document `TIME_RANGE_NOT_AUTHORIZED` and the consent/issue-time boundary in the Image Snapshots and Event History sections. Seed each Playground account with a few sample events, or keep the consent boundary at the *first* token, not each new one.

## F-10 · Snapshot resolution: omitting `resolution` returns 640×360, not full size

- **Area:** Partner API — `POST /v1/devices/{id}/media/image/download`
- **Date:** Wed Oct 21
- **Steps:** Same event, same `at_timestamp`: (a) `image_options: {format: "jpeg"}` → **640×360** JPEG (~40 KB); (b) `image_options: {format: "jpeg", resolution: {width: 1920, height: 1080}}` → **1920×1080** (~99 KB); (c) `format: "png"` without resolution → 640×360.
- **Expected:** Per the docs' watermark note, omitting `resolution` (or asking for 1920×1080) gives full resolution, minimising the watermark's share of the frame.
- **Actual:** Omitting it gives 640×360, where the fixed-size watermark covers a large part of the top of the frame. That matters for AI captioning.
- **Severity:** Medium. It quietly degrades every snapshot for anyone following the docs.
- **Workaround:** Doorstep always requests `resolution: {width: 1920, height: 1080}` explicitly.
- **Suggestion:** Make the default match the docs (full size), or fix the docs.

## F-11 · `latest_in_range` snapshot fails on the pre-signed host with `422 GRECO_NO_VALID_KEY`

- **Area:** Partner API — Image Snapshots, `type: "latest_in_range"`
- **Date:** Wed Oct 21
- **Steps:** `latest_in_range` with `start_timestamp` = the simulated event's start and `end_timestamp` = now − 1 s → **303**. Then GET the pre-signed `Location` → **422** `{"errors":[{"code":"GRECO_NO_VALID_KEY","detail":"No valid Greco key available for decryption"}]}`. `at_timestamp` inside the same range works.
- **Expected:** The latest frame in the range, or a documented error.
- **Actual:** An internal-sounding decryption error from the second hop that isn't in the docs, and nothing a partner can act on.
- **Severity:** Low/Medium. We use `at_timestamp`, but `latest_in_range` is the natural call for "what does the porch look like now?".
- **Workaround:** Use `at_timestamp` (event start + 1 s).
- **Suggestion:** Fix or document `latest_in_range` in the Playground, and translate internal errors into documented codes.

## F-12 · Simulated Playground event arrives in history as `on_demand`, with no subtype

- **Area:** Ring Developer Playground event simulation → Event History
- **Date:** Wed Oct 21
- **Steps:** Triggered event simulations in the Playground (whose release notes advertise Package, Vehicle and Motion) across one token's lifetime, polling Event History in LIVE mode, then recorded. That gave 6 events whose snapshots show a parcel on snowy steps (package), a car park (vehicle) and a woodpecker at a bird feeder (motion).
- **Actual:** All 6 events: `event_type: "on_demand"`, `is_third_party_reviewed: true`, no `sub_type`, plus an undocumented `relationships.cv_detections: {data: []}` and `meta.riid: null`. The snapshot clearly shows a **package** on snowy steps, and its burned-in camera clock reads **2018-12-05**, so it's a canned clip.
- **Expected:** A `motion` event with a package subtype (as the release notes imply), so apps can test package logic.
- **Severity:** Medium. Category-specific logic (package left out, person at door) can't be exercised against the Playground. It also blurs live views (opened by a person) with detections.
- **Workaround:** Doorstep maps `on_demand` to "Live view" and relies on the vision description of the snapshot. Its package logic is exercised via clearly labelled simulated scenarios.
- **Suggestions:** Emit simulated events with their real `event_type`/subtype (`motion` + `package_delivery`, `human`, `vehicle`), and document `cv_detections` (it looks like exactly what a caretaking app needs).

## F-13 · Response fields that aren't in the reference

- **Area:** Partner API — schema accuracy
- **Date:** Wed Oct 21
- **Observed in real Playground responses:**
  - `GET /v1/users/me` returns `first_name`, `last_name` and `email` attributes. The docs say only "Returns the Account ID". That's personal data a privacy review needs to know about.
  - `device-status` has `state`, `reported_at` and `audio.snooze` (not only `online`).
  - `device-capabilities` has `audio` plus a set of sensor keys (`glass_break_detection`, `smoke_detection`, `co_detection_listener`, `flood_detection`, `freeze_detection`, `contact_detection`, `tamper_detection`, `battery_status`), all `null` on the doorbell.
  - `device-configurations` has `audio.volume` and `audio.customizable_slots`.
  - `GET /v1/accounts/me/subscriptions` returns **422** "Unable to process subscription request for this user" for the Playground user (`x-amzn-errortype: AvaException422`).
  - Included resources have their own ids (`ava1.ring.device.status.…`) distinct from the device id. That's correct JSON:API, but the docs' examples imply the same id.
- **Severity:** Low. Our normalizer tolerates extra fields; the PII and the 422 are worth documenting.
- **Suggestion:** Generate the reference from the real schema (OpenAPI). Document the `users/me` PII fields and the Playground's subscription behaviour.

## F-14 · Vega SDK (Fire TV): Linux installer requires system package surgery, so we dropped the Fire TV track

- **Area:** Vega SDK 0.24 install on Ubuntu 24.04 (developer.amazon.com/docs/vega/0.24/install-vega-sdk.html)
- **Date:** Tue Oct 20 (read), decision Wed Oct 21
- **Task attempted:** Install the Vega SDK and Vega Virtual Device to build a 10-foot "visual doorbell" companion app.
- **Steps:** Read the install guide and Hello World guide, and checked prerequisites on the machine (KVM device present, user not in the `kvm` group, 15 GB RAM).
- **What the installer requires before `curl … get_vvm.sh | bash`:**
  1. `sudo apt remove curl && sudo apt install curl`, i.e. remove and reinstall the system curl (unexplained in the guide).
  2. `sudo add-apt-repository -y ppa:deadsnakes/ppa`, a third-party PPA.
  3. `sudo apt install -y libpython3.8-dev`, Python 3.8 headers (EOL since Oct 2024) for native debugging.
  4. KVM virtualization (link to an external guide), Watchman and lz4.
  5. Piping a remote script into bash, which also edits shell rc files and installs a VS Code extension.
- **Expected:** A self-contained SDK (container or tarball) or a documented, minimal set of system changes, with the reasons.
- **Actual:** Several system-level changes on a personal laptop, including removing a core package and adding a third-party PPA. The hello-world path is centred on the VS Code extension rather than a scriptable CLI. With a 3-day deadline on our only machine, the risk of breaking the dev environment outweighed the Fire TV track.
- **Severity:** High (for us). It blocked an entire track; we deliberately didn't attempt it.
- **Workaround:** Shipped the visual doorbell as an accessible web screen (`/tv`): 10-foot type, OK/Enter dismisses, auto-clears after 60 s. We don't claim the Fire TV track.
- **Suggestions:** Explain *why* curl must be reinstalled (or remove the step). Bundle Python/lz4 in the SDK instead of requiring a deadsnakes PPA. Offer a Docker/devcontainer image with the VVD. Document a non-interactive CLI path (`vega project create …`).
