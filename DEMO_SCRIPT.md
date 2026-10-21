# Doorstep: demo video script (target 2:40, hard limit 2:50)

## Before you hit record (Thursday)

1. `npm run dev`, open <http://localhost:3000/demo> in a 1440×900 browser window, light theme, zoom 100%. Close notifications and hide the bookmarks bar.
2. **Bedrock status.** Run `npm run check:bedrock`.
   - **If it prints ✓:** real Nova Lite captions. In `/demo`, play every scenario once at 300× to pre-warm the caption cache (a few cents at most), so captions appear instantly on camera. Then **Stop & clear**.
   - **If it fails:** captions are labelled **Sample caption**. Keep that label visible and say "sample captions" in the voice-over (line marked ★). Don't hide it.
3. **Ring token (shot 6 only).** In the Playground, trigger an event simulation, then generate a token and paste it in the app (amber banner, or onboarding). Tokens last 30 minutes, so record shot 6 first or last in its own take.
4. In `/demo`, the right-hand preview should be on **Ada's phone**. **Grace's TV** is used in shot 7.
5. Reset with **Reset all state**.

## Shot list

| # | Time | What's on screen | Exact clicks in `/demo` | Voice-over |
|---|---|---|---|---|
| 1 | 0:00–0:15 | **Payoff.** The phone frame turns from calm "All normal" to amber **"1 thing needs your attention · Home aide doesn't seem to have come"**. | *Before rolling:* speed **60×** → **The aide doesn't come → Play** → **+2 h** → **+30 min** ×4 (≈10:30) → **Pause**. *On camera:* **Resume**. The alert lands at simulated 10:45, about 15 s later. | "Ada lives two hundred miles from her mum, Grace. This morning, Grace's carer didn't come, and Ada knows at quarter to eleven, not at bedtime." |
| 2 | 0:15–0:35 | **The problem.** Hold on the phone's Today screen: the calm hero, the visits list ("Home aide · nobody seen in the window"), a short timeline. | Scroll the phone frame slowly. | "Doorbell cameras give families clips and pings. Forty motion alerts a day, and no answer to the one question that matters: is Mum's day normal? Doorstep watches the timing and the absences, and stays quiet when everything fits." |
| 3 | 0:35–1:15 | **A day in 40 seconds.** Normal day plays: captions fill the timeline, visits tick "Someone came at 9:12", the package arrives and is brought in, status stays **All normal**. Then **A package left out**: amber at 16:15, "still out after dark". Tap a thumbnail to show the full image. | **Stop & clear** → speed **300×** → **Grace's normal day → Play** (≈3 min to finish; record ~15 s, then cut). **A package left out → Play at 300×**. The alert fires at 16:15, about 2 min in, so cut the wait. In the phone, tap a timeline image, then close it. | "Every Ring event becomes one plain sentence, written by Amazon Bedrock's Nova Lite from the snapshot ★ — and it never identifies anyone. A rules engine, not AI, decides when to speak up: a quiet morning, a missed visit, a parcel left out, a late-night ring, an unanswered door." |
| 4 | 1:15–1:30 | **Acting on it + the care plan.** Tap **I'm on it** on the package alert, then open **Care plan** and show the visitor schedule. | In the phone frame: tap **I'm on it**, then the **Care plan** tab and scroll to "Scheduled visitors". | "Ada can say she's on it. The care plan is how a family describes a normal day: when the carer comes, when it's too quiet, what counts as late." |
| 5 | 1:30–1:45 | **Digest.** Digest tab with the day's note. | Let the package scenario finish (digest writes itself), then tap **Digest** in the phone. | "At the end of the day, a short note: Mum's day in three sentences." |
| 6 | 1:45–2:15 | **It's real Ring.** Switch to **LIVE**: badge goes green "Live · Ring Developer Playground", the real Playground snapshot with Ring's watermark, the Ring API log in the panel. Then 3-second code beats: `src/lib/ring/client.ts` (`getSnapshot` 303 handling), `src/lib/rules/engine.ts`, `src/lib/bedrock/index.ts`. | **1 · Data mode → LIVE**, then **Poll Ring now**. Point at the API log. Then cut to the editor. | "This is the real Ring Partner API: device discovery, event history, watermarked snapshots, and a token-expiry flow. The Playground doesn't send webhooks, so Doorstep polls, replays recorded Playground data, and labels simulated days as simulated. Nothing pretends." |
| 7 | 2:15–2:35 | **Visual doorbell.** Grace's TV preview: idle clock, then full-screen "Someone rang the doorbell" with the description and the image. Press OK to dismiss. | **Stop & clear** → speed **60×** → **Late-night doorbell → Play**. Switch preview to **Grace's TV**. At simulated 23:41 (~70 s) it lights up; cut the wait. Click into the frame and press **Enter**. | "And for Grace, who doesn't always hear the chime: a big-screen visual doorbell that tells her someone's at the door, and what's happening." |
| 8 | 2:35–2:45 | **Close.** Phone back on a calm, sage "All normal at Grace's door today". | **Grace's normal day** finished state, or just the phone frame. | "Doorstep. Peace of mind that's quiet when everything's fine." |

★ If captions are samples: "…one plain sentence. On this account Bedrock is still being unlocked, so you're seeing labelled sample captions; the Nova Lite path is built and switches on automatically."

## Timing notes

- At 300× a full scenario day (06:30–21:30) takes about 3 minutes. Cut away rather than wait.
- At 60×, one simulated minute is one second. The late-night ring comes about 70 s after pressing Play.
- The TV alert stays up for 60 real seconds unless dismissed.

## Fallbacks

- **Bedrock slow or failing mid-take:** sample captions appear immediately and are labelled. Keep going.
- **Ring token expired mid-take:** the amber "Ring token expired — paste a new Playground token" banner is itself good footage for shot 6. Paste a fresh token.
- **Something looks stuck:** `/demo` → **Reset all state**, then replay the scenario.
