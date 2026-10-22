# Doorstep: demo video script (target 2:40, hard limit 2:50)

Timings were re-measured on the final app on Thu Oct 22. "Pre-roll" means do it before recording that shot, then cut. Captions are **real Amazon Bedrock (Nova Lite)** output, pre-cached with `npm run warm:captions`, so they appear instantly.

**Windows you need** (see [RECORDING_CHECKLIST.md](RECORDING_CHECKLIST.md)):
- **A** — `http://localhost:3000/demo`, preview on **Ada's phone**. Drive everything from here.
- **B** — `http://localhost:3000/?intro=off` full-screen, for close-ups. `?intro=off` hides the intro and story banner.
- **C** — VS Code with `src/lib/ring/client.ts`, `src/lib/rules/engine.ts` and `src/lib/bedrock/index.ts` open, for the code beat.

---

### Shot 1 · 0:00–0:15 · The payoff: an alert opens to the real Ring photo
- **Pre-roll:** in A click **Reset for recording**. In the phone preview, the explainer shows. Tap **See Grace's day**; the example day loads instantly at 17:00 with an amber **"1 thing needs your attention"**.
- **On camera:** tap **See what happened** on the alert card. The alert page shows:
  - "Why Doorstep flagged this", tied to Grace's care plan;
  - the **real Ring camera photo** (watermark intact) of a parcel on snowy steps, with Nova Lite's caption.
- **VO:** "Ada lives two hundred miles from her mum, Grace. At five o'clock Doorstep tells her a parcel has sat on Grace's front step for hours, shows her the Ring camera's picture, and explains exactly why it's flagging it."

### Shot 2 · 0:15–0:35 · The problem, and what Doorstep is
- **On screen:** go back to **Today** and scroll: the calm visits list ("Home aide · someone came at 9:05") and the timeline of captioned events. Optionally cut to window B at the explainer (open a private window so it shows).
- **VO:** "Doorbell cameras give families clips and a stream of pings, but not the answer to the one question that matters: is Mum's day normal? Doorstep watches the timing and the absences through Ring, and stays quiet when everything fits."

### Shot 3 · 0:35–1:05 · A day at 60×
- **Pre-roll:** in A: **Stop & clear** → speed **60×** → **The aide doesn't come → Play** → **+2 h** → **+30 min** ×4 (clock **10:30**) → **Pause**.
- **On camera:** **Resume**. Captions fill the timeline. **≈15 s** later (10:45) the phone turns amber: **"Home aide doesn't seem to have come"**. Tap **See what happened**.
- **VO:** "Here's a simulated day at sixty times speed. Every event becomes one plain sentence written by Amazon Bedrock's Nova Lite, and it never identifies anyone. The carer is due between nine and half ten. When nobody comes, a rules engine, not AI, raises one gentle alert."

### Shot 4 · 1:05–1:25 · A caretaker action
- **On screen:** the missed-visit alert page.
- **Clicks:**
  1. Tap **Call Ngozi**. A call sheet opens with her name, role and number. On a computer, **Copy number** is the main action, with the note "Calling opens your phone app; on a computer, copy the number."
  2. Tap **Copy number**, then **Done**.
  3. Tap **That was expected**. The alert shows **Sorted**, and *History* lists "Called Ngozi (home aide)" and "Marked as expected".
- **VO:** "From the alert, Ada can call her mum or the carer, ask to be reminded in half an hour, or mark it as expected. Everything's kept in the alert's history."

### Shot 5 · 1:25–1:40 · The digest
- **Clicks:** phone → **Digest** tab → **Write today's digest** (≈5 s with real Bedrock; cut the wait).
- **VO:** "At the end of the day, Nova Lite writes Ada a short note: Mum's day in a few sentences."

### Shot 6 · 1:40–2:00 · The visual doorbell (+ escalation)
- **Pre-roll:** **Stop & clear** → speed **60×** → **Late-night doorbell → Play** → **+30 min** ×2 (clock **23:30**) → **Pause**. Switch the preview to **Grace's TV**.
- **On camera:** **Resume**. **≈12 s** later (23:41) the TV shows a full-screen *"Someone rang the doorbell"* with the description and picture. Click into the frame and press **Enter** to dismiss. Optional: switch to **Ada's phone**; at **≈27 s** the late-night alert shows **"Escalated to Chidi"** in red.
- **VO:** "For Grace, who doesn't always hear the chime, a big-screen visual doorbell. And if nobody acknowledges a late-night ring within fifteen minutes, Doorstep escalates it to Ada's brother."

### Shot 7 · 2:00–2:20 · How it's built (20 s)
- **On screen (window C):**
  1. **4 s:** `client.ts` → `getSnapshot` (303 → pre-signed URL without the token; `resolution: 1920×1080`).
  2. **3 s:** `client.ts` → `startLiveView` (WHEP).
  3. **4 s:** `bedrock/index.ts` → the `ConverseCommand` with the image block.
  4. **3 s:** `rules/engine.ts` → `missedVisits`.
  5. **6 s:** back in `/demo`, point at the **Bedrock: REAL** line and the **Ring API log**.
- **VO:** "It's built on the real Ring Partner API: devices, event history, watermarked snapshots and live view. Captions and digests come from Amazon Bedrock. The Playground doesn't send webhooks, so Doorstep polls and replays real recorded Playground data, and it labels example days honestly."

### Optional · Look now (only with a fresh Playground token, 10 s)
- In `/demo` choose **LIVE** and paste a token, then open any alert → **Look now**. About 10 s later real Ring live video plays below "Live from the Ring camera". Close it.

### Shot 8 · 2:20–2:35 · Close
- **Clicks:** A → **Stop & clear** → **Grace's normal day → Play at 300×** for a few seconds, holding on the calm **"All normal at Grace's door today"**.
- **VO:** "Doorstep. Peace of mind that's quiet when everything's fine."

---

## Timing reference (measured Thu Oct 22)

| Action | Result |
|---|---|
| **See Grace's day** (explainer or empty Today) | Example day at 17:00 with the package alert, in < 1 s |
| Aide doesn't come, 60×, +2 h, +30 min ×4, Resume | Alert ≈15 s after Resume |
| Late-night doorbell, 60×, +30 min ×2, Resume | TV lights up ≈12 s; escalation ≈27 s |
| Write today's digest (real Bedrock) | ≈5 s |
| Look now (LIVE + token) | Video ≈10 s after click |

## If something goes wrong
- **Wrong state:** **Reset for recording**, then redo the pre-roll.
- **A caption shows "Sample caption":** Bedrock was slow or unavailable for that event; it's labelled honestly, so keep going. Run `npm run warm:captions` between takes to fill the cache.
- **Never** run `npm run setup -- --reset` before recording: it deletes the cached captions. Use **Reset for recording** instead.
