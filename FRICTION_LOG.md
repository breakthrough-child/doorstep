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
- **Suggestion:** State whether the pre-signed URL should be fetched without auth, and its expiry.

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
