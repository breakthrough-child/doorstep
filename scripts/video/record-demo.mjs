// Records Doorstep demo shots from the real running app (http://localhost:3000) with the
// installed Chrome over the DevTools protocol — no Playwright download needed.
// Pre-roll (resetting state, loading scenarios, skipping the clock) happens through the app's
// /api/demo endpoint *before* each shot's screencast starts, so it never appears on camera.
//
// Output: video/raw/<shot>/frame-*.jpg + frames.txt (ffmpeg concat list with real timings).
// Usage: node scripts/video/record-demo.mjs [shotId ...]
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.DOORSTEP_URL ?? "http://localhost:3000";
const OUT = path.resolve("video/raw");
const PORT = 9341;
const W = 1920, H = 1080;
const narration = JSON.parse(fs.readFileSync("scripts/video/narration.json", "utf8"));
const seconds = Object.fromEntries(narration.shots.map((s) => [s.id, s.seconds]));
const only = process.argv.slice(2);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const api = async (body) => {
  const r = await fetch(`${BASE}/api/demo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`demo ${JSON.stringify(body)} → ${r.status}`);
};
const state = async () => (await fetch(`${BASE}/api/state`)).json();

// --- Chrome + CDP -----------------------------------------------------------------------
const profile = fs.mkdtempSync("/tmp/doorstep-rec-");
const chrome = spawn("google-chrome", [
  "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--mute-audio",
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--window-size=${W},${H}`,
  "--force-device-scale-factor=1", "--disable-features=Translate", "about:blank",
], { stdio: "ignore" });
let ws, seq = 0;
const pending = new Map();
const listeners = [];
for (let i = 0; i < 80 && !ws; i++) {
  try {
    const t = (await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()).find((x) => x.type === "page");
    if (t) ws = new WebSocket(t.webSocketDebuggerUrl);
  } catch {}
  if (!ws) await sleep(250);
}
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { pending.get(d.id)(d.result ?? d.error); pending.delete(d.id); }
  else if (d.method) for (const l of listeners) l(d);
};
const send = (method, params = {}) => new Promise((r) => { const i = ++seq; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); });
const js = async (expression) => (await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true })).result?.value;

await send("Page.enable");
await send("Runtime.enable");
await send("Emulation.setDeviceMetricsOverride", { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }, { name: "prefers-reduced-motion", value: "no-preference" }] });

// Wait until the page has rendered real content and every visible image has loaded.
async function settle(maxMs = 20000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    const ok = await js(`(() => {
      if (document.querySelector('[aria-busy=true]')) return false;
      if (!document.querySelector('h1, main section, main article')) return false;
      const imgs = [...document.images].filter(i => { const r = i.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; });
      return imgs.every(i => i.complete && i.naturalWidth > 0);
    })()`);
    if (ok) break;
    await sleep(300);
  }
  await js(`document.fonts.ready.then(() => true)`);
  await sleep(600);
}

async function go(url) {
  await send("Page.navigate", { url: `${BASE}${url}` });
  await sleep(1500);
  await settle();
}

async function waitFor(expr, maxMs = 15000) {
  const t = Date.now();
  while (Date.now() - t < maxMs) {
    if (await js(expr)) return true;
    await sleep(250);
  }
  return false;
}

/** Compile every route and fetch every snapshot once, so nothing loads slowly on camera. */
async function prewarm() {
  const s = await state();
  const urls = ["/", "/alerts", "/digest", "/care-plan", "/tv", "/demo"];
  if (s.alerts[0]) urls.push(`/alerts/${encodeURIComponent(s.alerts[0].id)}`, `/api/alerts/${encodeURIComponent(s.alerts[0].id)}`);
  if (s.timeline[0]) urls.push(`/events/${encodeURIComponent(s.timeline[0].id)}`, `/api/events/${encodeURIComponent(s.timeline[0].id)}`);
  urls.push("/api/digests", "/api/tv", "/api/care-plan");
  for (const u of urls) await fetch(`${BASE}${u}`).catch(() => null);
  for (const e of s.timeline) if (e.hasSnapshot) await fetch(`${BASE}/api/snapshots/${encodeURIComponent(e.id)}`).catch(() => null);
}

// A visible "tap" ring where we click, so viewers can follow the interaction.
const TAP = `(el) => { const r = el.getBoundingClientRect(); const d = document.createElement('div');
  Object.assign(d.style, { position:'fixed', left:(r.left + r.width/2 - 22)+'px', top:(r.top + r.height/2 - 22)+'px', width:'44px', height:'44px',
    borderRadius:'50%', border:'4px solid #2dd4bf', background:'rgba(45,212,191,0.25)', zIndex: 99999, pointerEvents:'none',
    transition:'transform 600ms ease-out, opacity 600ms ease-out' });
  document.body.appendChild(d); requestAnimationFrame(() => { d.style.transform = 'scale(1.8)'; d.style.opacity = '0'; });
  setTimeout(() => d.remove(), 900); }`;

async function click(text, { selector = "a,button", exact = false } = {}) {
  const ok = await js(`(() => {
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null);
    const el = els.find(e => ${exact ? `e.textContent.trim() === ${JSON.stringify(text)}` : `e.textContent.includes(${JSON.stringify(text)})`});
    if (!el) return false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return true; })()`);
  if (!ok) throw new Error(`clickable "${text}" not found`);
  await sleep(700);
  await js(`(() => { const els = [...document.querySelectorAll(${JSON.stringify(selector)})].filter(e => e.offsetParent !== null);
    const el = els.find(e => ${exact ? `e.textContent.trim() === ${JSON.stringify(text)}` : `e.textContent.includes(${JSON.stringify(text)})`});
    (${TAP})(el); el.click(); return true; })()`);
}

const scrollBy = (y) => js(`window.scrollBy({ top: ${y}, behavior: 'smooth' }), true`);
const scrollTop = () => js(`window.scrollTo({ top: 0 }), true`);

// --- Screencast recording ------------------------------------------------------------------
async function record(id, actions) {
  if (only.length && !only.includes(id)) return;
  const dur = seconds[id];
  const dir = path.join(OUT, id);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const frames = [];
  const onFrame = async (d) => {
    if (d.method !== "Page.screencastFrame") return;
    const { data, metadata, sessionId } = d.params;
    const file = path.join(dir, `frame-${String(frames.length).padStart(5, "0")}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    frames.push({ file, t: Date.now() / 1000 });
    void metadata;
    send("Page.screencastFrameAck", { sessionId });
  };
  listeners.push(onFrame);
  await send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: W, maxHeight: H, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  const at = async (s) => { const wait = (t0 + s) * 1000 - Date.now(); if (wait > 0) await sleep(wait); };
  await actions(at);
  await at(dur);
  await send("Page.stopScreencast");
  listeners.splice(listeners.indexOf(onFrame), 1);
  // ffmpeg concat list with each frame's real on-screen duration.
  const end = t0 + dur;
  const lines = [];
  frames.forEach((f, i) => {
    const start = i === 0 ? t0 : f.t;
    const next = i + 1 < frames.length ? frames[i + 1].t : end;
    lines.push(`file '${path.basename(f.file)}'`, `duration ${Math.max(0.001, next - start).toFixed(3)}`);
  });
  if (frames.length) lines.push(`file '${path.basename(frames.at(-1).file)}'`);
  fs.writeFileSync(path.join(dir, "frames.txt"), lines.join("\n") + "\n");
  console.log(`✓ ${id}: ${frames.length} frames over ${dur}s`);
}

// --- Shots (DEMO_SCRIPT.md) ----------------------------------------------------------------
try {
  // Shot 1: the payoff — the example day's package alert opens to the real Ring photo.
  if (!only.length || only.includes("s1-payoff")) {
    await api({ action: "reset-recording" });
    await api({ action: "showcase" });
    await sleep(3000);
    await prewarm();
    await go("/?intro=off");
    await go("/?intro=off");
    await record("s1-payoff", async (at) => {
      await at(4.5);
      await click("See what happened");
      await waitFor(`location.pathname.startsWith('/alerts/') && !!document.querySelector('h1')`);
      await settle(6000);
      await at(9);
      await scrollBy(430);
      await at(13);
      await scrollBy(260);
    });
  }

  // Shot 2: the problem + what Doorstep is (first-visit explainer), then the calm Today screen.
  if (!only.length || only.includes("s2-problem")) {
    await go("/?intro=off");
    await js(`localStorage.removeItem('doorstep.intro.dismissed'), true`);
    await go("/");
    await scrollTop();
    await record("s2-problem", async (at) => {
      await at(10);
      await scrollBy(560);
      await at(14);
      await scrollBy(520);
    });
    await js(`localStorage.setItem('doorstep.intro.dismissed','1'), true`);
  }

  // Shot 3: an example day at 60x — the aide doesn't come.
  if (!only.length || only.includes("s3-day")) {
    await api({ action: "stop" });
    await api({ action: "start", scenarioId: "missed_aide_visit", speed: 60 });
    await api({ action: "skip", minutes: 120 });
    for (let i = 0; i < 4; i++) await api({ action: "skip", minutes: 30 });
    await api({ action: "pause" });
    await sleep(2500);
    await go("/?intro=off");
    await record("s3-day", async (at) => {
      await at(0.8);
      await api({ action: "resume" });
      // Wait for the alert (~15 s at 60x), then open it.
      for (let i = 0; i < 40; i++) {
        const s = await state();
        if (s.alerts.some((a) => a.rule === "missed_visit")) break;
        await sleep(500);
      }
      await sleep(4500);
      await api({ action: "pause" });
      await click("See what happened");
      await waitFor(`location.pathname.startsWith('/alerts/') && !!document.querySelector('h1')`);
      await sleep(2500);
      await scrollBy(380);
    });
  }

  // Shot 4: a caretaker action — call sheet (copy number), then "That was expected".
  if (!only.length || only.includes("s4-action")) {
    await scrollTop();
    await record("s4-action", async (at) => {
      await at(1);
      await click("Call Ngozi");
      await at(5);
      await click("Copy number", { selector: "dialog[open] button" });
      await at(8.5);
      await click("Done", { selector: "dialog[open] button" });
      await at(10.5);
      await click("That was expected");
      await at(13);
      await scrollBy(520);
    });
  }

  // Shot 5: the digest, written live by Nova Lite.
  // The digest is written by real Bedrock in pre-roll (it can take 5–25 s), then shown.
  if (!only.length || only.includes("s5-digest")) {
    const r = await fetch(`${BASE}/api/digests`, { method: "POST" });
    console.log("digest:", r.status, ((await r.json()).digest ?? {}).model);
    await go("/digest?intro=off");
    await record("s5-digest", async (at) => {
      await at(6);
      await scrollBy(260);
    });
  }

  // Shot 6: the visual doorbell on the TV.
  if (!only.length || only.includes("s6-tv")) {
    await api({ action: "stop" });
    await api({ action: "start", scenarioId: "late_night_ding", speed: 60 });
    await api({ action: "skip", minutes: 30 });
    await api({ action: "skip", minutes: 30 });
    await api({ action: "pause" });
    await sleep(2500);
    // Pre-load the frames the TV will show.
    for (let i = 0; i < 12; i++) await fetch(`${BASE}/api/snapshots/${encodeURIComponent(`sim:late_night_ding:${String(i).padStart(2, "0")}`)}`).catch(() => null);
    await go("/tv");
    await record("s6-tv", async (at) => {
      await at(0.5);
      await api({ action: "resume" });
      await at(16.5);
      await js(`(() => { const b = document.activeElement; ${TAP.replace("(el) =>", "const tap = (el) =>")}; if (b) tap(b); return true; })()`);
      await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
      await api({ action: "pause" });
    });
  }

  // Shot 8: close on a calm, normal day.
  if (!only.length || only.includes("s8-close")) {
    await api({ action: "stop" });
    await api({ action: "start", scenarioId: "grace_normal_day", speed: 300 });
    await sleep(1500);
    await go("/?intro=off");
    await record("s8-close", async (at) => {
      await at(10);
      await scrollBy(420);
    });
    await api({ action: "pause" });
  }
} finally {
  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Chrome may still be flushing its profile */ }
}
