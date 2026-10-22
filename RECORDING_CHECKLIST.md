# Recording checklist (Thu Oct 22, 19:00)

## 30 minutes before

- [ ] `git pull` and `npm run dev` from the repo. Wait for "Ready", then open <http://localhost:3000/demo> once so every page compiles before you record. The first load of each page in dev mode is slow.
- [ ] Run `npm run check:bedrock` and note the result. It decides the ★ (real) or ☆ (sample) voice-over lines in `DEMO_SCRIPT.md`.
- [ ] If real Bedrock works, pre-warm captions: in `/demo` play each scenario once at **300×**, so every caption is cached and appears instantly on camera. Then **Reset for recording**.
- [ ] Close Slack, email and messaging. Turn on Do Not Disturb (Ubuntu: Settings → Notifications → Do Not Disturb).
- [ ] Charger plugged in. Close heavy apps (the dev server and OBS need CPU).

## Browser

- [ ] Chrome or Firefox, a fresh window (or a clean profile) with **no extensions visible**.
- [ ] Hide the bookmarks bar (Chrome: **Ctrl+Shift+B**).
- [ ] Zoom **100%** (**Ctrl+0**).
- [ ] Window size **1440×900** or larger. The `/demo` phone preview is 375 px wide and needs about 1400 px of width next to the panel. Full-screen (**F11**) hides the URL bar, which looks cleaner.
- [ ] Light theme in the OS, so the app renders in light mode (it follows the system theme).
- [ ] Only these tabs: `/demo` (and, if you like, `/` for close-ups).

## Never show on screen

- [ ] `.env.local`, the terminal running `npm run dev` (it can print AWS errors), `~/.aws`, or any token.
- [ ] The Ring developer console or Playground page while a token is visible.
- [ ] VS Code's file explorer with `.env.local` visible. Close the explorer, or open only `src/lib/ring/client.ts`, `src/lib/rules/engine.ts` and `src/lib/bedrock/index.ts` in tabs.

## Starting state for every take

1. `/demo` → **Reset for recording**. You get:
   - the default care plan (Grace, home aide 09:00–10:30, meal delivery);
   - contacts Grace, Ngozi, Mr Bello and Chidi (fictional numbers);
   - SIMULATED mode with nothing playing;
   - recorded Ring data reloaded;
   - no alerts, actions or digests.
2. Do the shot's **pre-roll** from `DEMO_SCRIPT.md`, then record.
3. **Between takes:** **Reset for recording** again. You don't need to restart the server.

## OBS settings for 1080p

- **Settings → Video:** Base (canvas) **1920×1080**, Output (scaled) **1920×1080**, FPS **30**.
- **Settings → Output → Recording:**
  - format **mp4** (or mkv, then File → Remux to mp4);
  - encoder **x264** (or NVENC if available);
  - rate control **CRF 18–20**, preset **veryfast**.
- **Settings → Audio:** mic at 48 kHz. Add a **Noise Suppression** filter (RNNoise) and a **Limiter** at −1 dB on the mic.
- **Source:** **Window Capture (Xcomposite)** of the browser window, or **Screen Capture (PipeWire)** on Wayland. Crop to the browser content; fit to canvas with Ctrl+F.
- **Do a 10-second test recording** and check text is crisp and audio levels peak around −12 dB.

## Recording tips

- Record each shot separately and stitch them; it's far easier than one take.
- Move the mouse slowly and pause for one second after each click.
- Keep the final video **under 2:50**, then upload to YouTube as **Public** (not Unlisted) and paste the link into Devpost.
