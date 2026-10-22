# Devpost checklist: what to paste where

Submit by **Friday Oct 23, 14:00 Lagos** (deadline 20:00 Lagos / 12:00 PDT). The text lives in `SUBMISSION.md`, or in `SUBMISSION-no-aws.md` if Bedrock is still blocked (see "Which variant" at the bottom).

The repository is **public with an MIT license** (GitHub detects it), so no collaborator invites are needed.

| Devpost field | What to paste | Source |
|---|---|---|
| **Project name** | `Doorstep` | — |
| **Elevator pitch / tagline** (≤200 chars) | `Calm, plain-language updates from a parent's front door. Doorstep tells you when something's off and leaves you alone when it isn't.` (132 chars) | SUBMISSION.md → Tagline |
| **About the project** (Markdown) | Paste these sections in order: *Inspiration*, *What it does*, *How we built it*, *Privacy*, *Challenges we ran into*, *Accomplishments*, *What we learned*, *What's next* | SUBMISSION.md |
| **Built with** (tags) | `ring-partner-api`, `ring-developer-playground`, `next.js`, `react`, `typescript`, `tailwindcss`, `sqlite`, `better-sqlite3`, `node.js`, `vitest`, `webrtc`, `zod`. **Add** `amazon-bedrock`, `amazon-nova`, `aws` **only if Bedrock is live** | — |
| **"Try it out" links** | `https://github.com/breakthrough-child/doorstep` | — |
| **Video demo link** | YouTube URL, **Public**, under 2:50: `[paste after upload]` | DEMO_SCRIPT.md |
| **Image gallery** | `docs/screenshots/demo-panel.png`, `package-today.png`, `replay-today.png`, `digest.png`, `tv-doorbell.png`. Optionally re-shoot the alert detail page with the real Ring frame from the app | repo |
| **Track: Ring** | ✅ Always | — |
| **Track: AWS Builder mini challenge** | ✅ **Only if** `npm run check:bedrock` succeeded and the app shows real Nova Lite captions | — |
| **Track: Open Source mini challenge** | ✅ Select: PR opened at https://github.com/AmazonAppDev/ring-api-helloworld/pull/45 | SUBMISSION.md → Open Source contribution |
| **Track: Fire TV** | ❌ Don't select (dropped; see FRICTION_LOG F-14) | — |
| **Product feedback, each tool** (use, what worked, what needs work, onboarding, would you use it again) | Ring Partner API; Ring Developer Playground; Ring sample app; Amazon Bedrock + Nova Lite (if AWS track); Next.js / Node / better-sqlite3 | SUBMISSION.md → Product feedback |
| **AWS services used** (AWS track only) | "AWS services description" section | SUBMISSION.md |
| **Open Source fields** | Contribution URL `https://github.com/AmazonAppDev/ring-api-helloworld/pull/45`; our repo `https://github.com/breakthrough-child/doorstep`; GitHub username `breakthrough-child`; what / how / why | SUBMISSION.md → Open Source contribution |
| **Feature requests with priority** | The Critical / Important / Nice-to-have table | SUBMISSION.md → Feature requests |
| **Friction log** | Link: `https://github.com/breakthrough-child/doorstep/blob/main/FRICTION_LOG.md`. If there's a text box, paste the summary below | FRICTION_LOG.md |

## Friction log summary (for a text field)

> Full, reproducible entries with steps, expected/actual, severity, workaround and suggestion: https://github.com/breakthrough-child/doorstep/blob/main/FRICTION_LOG.md

- **F-01 (Medium) · Ring Event History:** no documented time-range or page-size parameters, so you paginate backwards to get "today". Suggest `filter[start]`/`filter[end]` and `page[size]`.
- **F-02 (Medium) · Ring docs:** webhook `sub_type` and history `event_types` disagree, especially for packages. Suggest one canonical type table.
- **F-03 (Low/Medium) · Ring sample app:** reads `attributes.online`, which lives on `device-status`. Suggest using `include=status`.
- **F-04 (Medium) · Ring sample app:** says there's no polling API and invents webhook fields. Suggest pointing at Event History.
- **F-05 (Low) · Ring sample app:** exposes the access token to the browser. Suggest proxying WHEP server-side.
- **F-06 (Low) · Ring docs:** a ~370k-character single page. Suggest an OpenAPI spec and per-resource pages.
- **F-07 (Low/Medium) · Ring snapshots:** the 303 pre-signed hop isn't documented (auth, expiry, errors on the second hop). Suggest documenting it.
- **F-08 (High) · Amazon Bedrock:** every Nova Lite quota in eu-north-1 applied at 0 (tokens/day 0 vs 5.76B default), mostly "Not adjustable"; first call returns retryable `ThrottlingException: Too many tokens per day`. Support case 179260552100186. Suggest an explicit non-retryable error and a console banner.
- **F-09 (Medium) · Ring Playground:** a fresh token sees no history or media; earlier media returns undocumented `403 TIME_RANGE_NOT_AUTHORIZED`. Suggest documenting it and seeding sample events.
- **F-10 (Medium) · Ring snapshots:** omitting `resolution` returns 640×360, not full size as documented. Suggest matching the docs.
- **F-11 (Low/Medium) · Ring snapshots:** `latest_in_range` fails on the pre-signed host with `422 GRECO_NO_VALID_KEY`. Suggest fixing it or mapping it to a documented error.
- **F-12 (Medium) · Ring Playground:** Package, Vehicle and Motion simulations all arrive as `on_demand` with no subtype. Suggest emitting real types and documenting `cv_detections`.
- **F-13 (Low) · Ring API:** undocumented fields (PII on `users/me`, extra status/capability/config fields); `subscriptions` returns 422 for Playground users. Suggest generating the reference from the schema.
- **F-14 (High for us) · Vega SDK:** the Linux installer requires `apt remove curl`, the deadsnakes PPA, Python 3.8 headers and KVM, so we dropped the Fire TV track. Suggest a container or devcontainer and minimal, explained system changes.

## Which variant to submit

| Bedrock at 17:30 | PR opened? | Use |
|---|---|---|
| ✅ working | ✅ | `SUBMISSION.md` as is. Tracks: Ring + AWS Builder + Open Source |
| ❌ blocked | ✅ | `SUBMISSION-no-aws.md`. Tracks: Ring + Open Source |

## Final clicks

- [ ] Video uploaded to YouTube as **Public**; link pasted.
- [ ] Repo URL pasted; it opens without signing in.
- [ ] Tracks selected per the table above.
- [ ] Every required question answered (Devpost won't submit otherwise). Preview the page once.
- [ ] Submit, and check the confirmation email.
