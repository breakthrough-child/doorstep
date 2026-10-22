# Doorstep: demo video script (target 2:40, hard limit 2:50)

Timings below were measured on the real app on Thu Oct 22. "Pre-roll" means do it before you press record for that shot, then cut.

Setup: follow [RECORDING_CHECKLIST.md](RECORDING_CHECKLIST.md). You need two browser windows:
- **A**: `http://localhost:3000/demo`, preview on **Ada's phone**. Drive everything from here.
- **B**: VS Code with `src/lib/ring/client.ts` open, for the code beat.

**Bedrock status changes one line.** If `npm run check:bedrock` succeeds, the captions are Nova Lite; use the ★ lines. If it fails, captions are labelled **Sample caption**; use the ☆ lines. Never hide the label.

---

### Pre-roll for shots 1–2 (≈2½ min, off camera)
1. `/demo` → **Reset for recording**.
2. Speed **300×** → **A package left out → Play at 300×**.
3. Wait until the phone shows amber **"1 thing needs your attention"** (simulated 16:15, **≈2:00** after Play). Then click **Pause**.

### Shot 1 · 0:00–0:15 · The payoff
- **On screen:** the phone frame shows the amber alert card "A package is still on the porch". Tap **See what happened**. The alert page opens with the **real Ring snapshot** (Ring logo and watermark top-left and top-right) and the *Why Doorstep flagged this* box.
- **Clicks:** in the phone frame, tap **See what happened**. Slowly scroll to show the image and the "Simulated · real Ring frame" label.
- **VO:** "Ada lives two hundred miles from her mum, Grace. At quarter past four, Doorstep tells her a parcel's been sitting on Grace's front step for three hours. That's a real Ring camera frame."

### Shot 2 · 0:15–0:35 · The problem
- **On screen:** stay on the alert page, then tap **All alerts** and **Today** to show the calm visits list and the timeline.
- **VO:** "Doorbell cameras give families clips and a stream of pings, but not the answer to the one question that matters: is Mum's day normal? Doorstep watches for the timing and the absences, and stays quiet when everything fits."

### Shot 3 · 0:35–1:05 · A day at 60×
- **Pre-roll:** **Stop & clear** → speed **60×** → **The aide doesn't come → Play** → **+2 h** → **+30 min** four times (clock reads **10:30**) → **Pause**.
- **On camera:** click **Resume**. The phone timeline fills, then **≈15 s later** (10:45) the status turns amber: **"Home aide doesn't seem to have come"**. Tap the card's **See what happened**.
- **VO:** "Here's a simulated day at sixty times speed. Every Ring event becomes one plain sentence ★ written by Amazon Bedrock's Nova Lite / ☆ — these are labelled sample captions while our Bedrock access is being unlocked — and it never identifies anyone. The carer is due between nine and half ten. When nobody comes, a rules engine, not AI, raises one gentle alert, and explains why in terms of Grace's care plan."

### Shot 4 · 1:05–1:20 · A caretaker action
- **On screen:** the alert page for the missed visit, with **Call Grace**, **Call Ngozi**, **That was expected**, **Remind me in 30 min**.
- **Clicks:** tap **That was expected**. The page shows "Sorted", and *History* gains "Marked as expected". **Don't tap Call**: on a desktop it opens the system's phone-app dialog.
- **VO:** "Ada can call her mum or the carer straight from here, ask to be reminded in half an hour, or, if she knows the visit was moved, mark it as expected. Everything's kept in the alert's history."

### Shot 5 · 1:20–1:35 · The digest
- **Clicks:** tap the **Digest** tab in the phone → **Write today's digest** (instant).
- **VO:** "At the end of the day, a short note: Mum's day in three sentences." ☆ add: "…drafted from a template until Bedrock is switched on."

### Shot 6 · 1:35–2:00 · The visual doorbell
- **Pre-roll:** **Stop & clear** → speed **60×** → **Late-night doorbell → Play** → **+30 min** twice (clock **23:30**) → **Pause**. Set the preview to **Grace's TV**.
- **On camera:** click **Resume**. **≈12 s later** (23:41) the TV turns into a full-screen *"Someone rang the doorbell"* with the description and the image. Click inside the TV frame and press **Enter**: it dismisses. (Optional: switch back to **Ada's phone**; at **≈27 s** the late-night alert shows **"Escalated to Chidi"** in rose.)
- **VO:** "For Grace, who doesn't always hear the chime, a big-screen visual doorbell. And if nobody acknowledges a late-night ring within fifteen minutes, Doorstep escalates it to Ada's brother."

### Shot 7 · 2:00–2:20 · How it's built (code beat, 20 s)
- **On screen (window B):**
  1. **3 s:** `src/lib/ring/client.ts`, `getSnapshot`: the 303 → pre-signed URL, fetched without the token, and the `resolution: 1920×1080` comment.
  2. **3 s:** `listEventsSince` (Event History pagination).
  3. **4 s:** `src/lib/rules/engine.ts`, `missedVisits`.
  4. **★ only, 4 s:** `src/lib/bedrock/index.ts`, the `ConverseCommand` with the image block.
  5. **6 s:** back to `/demo`, pointing at the **data-mode badges** (LIVE / REPLAY / SCENARIO) and the **Ring API log**.
- **VO:** "It's built on the real Ring Partner API: device discovery, event history and watermarked snapshots, with token-expiry handling. The Playground doesn't send webhooks, so Doorstep polls, replays real recorded Playground data, and labels simulated days as simulated. Nothing pretends."

### Shot 8 · 2:20–2:35 · Close
- **On screen:** `/demo` → **Stop & clear** → **Grace's normal day → Play at 300×** for a few seconds, holding on the phone's calm sage **"All normal at Grace's door today"**.
- **VO:** "Doorstep. Peace of mind that's quiet when everything's fine."

---

## Timing reference (measured)

| Action | Result |
|---|---|
| Package left out, Play at 300× | Alert at simulated 16:15, ≈2:00 later; day ends ≈50 s after that |
| Aide doesn't come, 60×, +2 h, +30 min ×4 | Clock 10:30; alert ≈15 s after Resume |
| Late-night doorbell, 60×, +30 min ×2 | Clock 23:30; TV lights up ≈12 s after Resume; escalation ≈27 s |
| At 60× | 1 simulated minute = 1 second |
| At 300× | A whole scenario day takes ≈3 minutes |

## If something goes wrong

- **Wrong state:** **Reset for recording**, then redo the pre-roll.
- **Ring token expired banner:** only appears in LIVE mode; this script doesn't use LIVE.
- **Bedrock flips to working mid-take** (real captions start appearing): fine, captions improve. Use the ★ lines from then on.
