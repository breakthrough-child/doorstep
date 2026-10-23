"""Assemble the demo video from the shots recorded by record-demo.mjs.

  python3 scripts/video/build-video.py            # video/demo-silent.mp4 + video/narration.md
  python3 scripts/video/build-video.py tts DIR     # also video/demo-tts.mp4 from DIR/line-NN.wav
  python3 scripts/video/build-video.py final VOICE # video/demo-final.mp4 (recorded voice, levelled)

Needs ffmpeg (with libass) and Pillow.
"""

import json
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "video"
RAW = OUT / "raw"
BUILD = OUT / "build"
SPEC = json.loads((Path(__file__).parent / "narration.json").read_text())
W, H, FPS = 1920, 1080, 30

NAVY, ON_NAVY, TEAL, SOFT = "#0f1b2d", "#f1f5f9", "#2dd4bf", "#a7b4c8"
SANS = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
SANS_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MONO = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

# Shot 7: real excerpts from the repo (lightly elided with "…"), timed to the voice-over.
CODE_CARDS = [
    (4.5, "Ring Partner API · snapshots", "src/lib/ring/client.ts", [
        "async getSnapshot(deviceId, timestampMs) {",
        "  const path = `/v1/devices/${id}/media/image/download`;",
        "  const body = { type: \"at_timestamp\", timestamp,",
        "    image_options: { format: \"jpeg\",",
        "      resolution: { width: 1920, height: 1080 } } };",
        "  const res = await this.request(\"POST\", path, body,",
        "                                 { redirect: \"manual\" });",
        "  if (res.status === 303) {",
        "    // pre-signed Location, fetched without the Bearer token",
        "    media = await this.fetchImpl(res.headers.get(\"location\"));",
        "  } …",
        "}",
    ]),
    (3.0, "Ring Partner API · live view (WHEP)", "src/lib/ring/client.ts", [
        "async startLiveView(deviceId, offerSdp) {",
        "  const path = `/v1/devices/${id}/media/streaming/whep/sessions`;",
        "  const res = await this.request(\"POST\", path, undefined, {",
        "    body: offerSdp,",
        "    headers: { \"Content-Type\": \"application/sdp\" } });",
        "  // runs on the server: the token never reaches the browser",
        "  return { answerSdp: await res.text(), location };",
        "}",
    ]),
    (6.5, "Amazon Bedrock · Nova Lite caption", "src/lib/bedrock/index.ts", [
        "const res = await bedrock().send(",
        "  new ConverseCommand({",
        "    modelId: BEDROCK_MODEL_ID,   // eu.amazon.nova-lite-v1:0",
        "    system: [{ text: DESCRIBE_SYSTEM }],",
        "    messages: [{ role: \"user\", content: [",
        "      { image: { format: \"jpeg\", source: { bytes } } },",
        "      { text: \"Ring classified this event as … Describe the frame.\" },",
        "    ] }],",
        "    inferenceConfig: { maxTokens: 220, temperature: 0.2 },",
        "  }));",
        "// cached per event in SQLite: nothing is paid for twice",
    ]),
    (6.0, "Rules, not AI, raise alerts", "src/lib/rules/engine.ts", [
        "export function missedVisits({ now, plan, events }) {",
        "  for (const v of plan.visitors) {",
        "    const deadline = windowEnd + grace;",
        "    if (now < deadline) continue;",
        "    if (people.some((e) => e.startMs >= windowStart - grace",
        "                       && e.startMs <= deadline)) continue;",
        "    out.push({ kind: \"missed_visit\", … });",
        "  }",
        "}",
        "",
        "// Every screen says where data comes from:",
        "//   \"Live from Ring\" · \"Recorded from a Ring camera\" · \"Example day\"",
    ]),
]


def run(*args):
    subprocess.run([str(a) for a in args], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)


def font(path, size):
    return ImageFont.truetype(path, size)


def title_card(path):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    name, rest = SPEC["title"].split(": ", 1)
    d.rounded_rectangle((W // 2 - 60, 330, W // 2 + 60, 450), radius=28, fill=TEAL)
    d.text((W // 2, 390), "D", font=font(SANS_BOLD, 80), fill=NAVY, anchor="mm")
    d.text((W // 2, 560), name, font=font(SANS_BOLD, 110), fill=ON_NAVY, anchor="mm")
    d.text((W // 2, 680), rest[0].upper() + rest[1:], font=font(SANS, 52), fill=SOFT, anchor="mm")
    img.save(path)


def code_card(path, heading, file, lines):
    img = Image.new("RGB", (W, H), NAVY)
    d = ImageDraw.Draw(img)
    d.text((140, 120), heading, font=font(SANS_BOLD, 64), fill=ON_NAVY)
    d.text((140, 210), file, font=font(MONO, 34), fill=TEAL)
    d.rounded_rectangle((120, 290, W - 120, 860), radius=24, fill="#121b2d", outline="#22314a", width=2)
    mono = font(MONO, 34)
    for i, line in enumerate(lines):
        colour = SOFT if line.strip().startswith("//") else ON_NAVY
        d.text((170, 330 + i * 42), line, font=mono, fill=colour)
    img.save(path)


def encode_still(png, seconds, out):
    run("ffmpeg", "-y", "-loop", "1", "-framerate", FPS, "-i", png, "-t", f"{seconds:.3f}",
        "-vf", f"scale={W}:{H},format=yuv420p", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
        "-r", FPS, out)


def encode_shot(shot_id, seconds, out):
    d = RAW / shot_id
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", d / "frames.txt",
        "-vf", f"fps={FPS},scale={W}:{H}:flags=lanczos,format=yuv420p", "-t", f"{seconds:.3f}",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-r", FPS, out)


def ts(sec, sep):
    h, rem = divmod(sec, 3600)
    m, s = divmod(rem, 60)
    return f"{int(h)}:{int(m):02d}:{s:05.2f}" if sep == "." else f"{int(h):02d}:{int(m):02d}:{s:06.3f}".replace(".", ",")


def cue_ends(total):
    lines = SPEC["lines"]
    ends = []
    for i, line in enumerate(lines):
        nxt = lines[i + 1]["at"] if i + 1 < len(lines) else total
        ends.append(min(nxt - 0.15, line["at"] + 6.0, total))
    return ends


def shot_span(shot_id):
    t = SPEC["titleSeconds"]
    for s in SPEC["shots"]:
        if s["id"] == shot_id:
            return t, t + s["seconds"]
        t += s["seconds"]
    raise KeyError(shot_id)


def write_ass(path, total):
    top = shot_span("s6-tv")  # the TV screen keeps its status line at the bottom
    head = f"""[Script Info]
ScriptType: v4.00+
PlayResX: {W}
PlayResY: {H}
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: VO,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H002D1B0F,&H002D1B0F,0,0,0,0,100,100,0,0,3,14,0,2,260,260,64,1
Style: VOTop,DejaVu Sans,46,&H00FFFFFF,&H00FFFFFF,&H00473122,&H00473122,0,0,0,0,100,100,0,0,3,14,0,9,1000,64,56,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
"""
    rows = [
        f"Dialogue: 0,{ts(l['at'], '.')},{ts(e, '.')},{'VOTop' if top[0] <= l['at'] < top[1] else 'VO'},,0,0,0,,{l['text']}"
        for l, e in zip(SPEC["lines"], cue_ends(total))
    ]
    path.write_text(head + "\n".join(rows) + "\n")


def write_srt(path, total):
    rows = []
    for i, (l, e) in enumerate(zip(SPEC["lines"], cue_ends(total)), 1):
        rows.append(f"{i}\n{ts(l['at'], ',')} --> {ts(e, ',')}\n{l['text']}\n")
    path.write_text("\n".join(rows))


def write_narration_md(path, total):
    shot_starts, t = [], SPEC["titleSeconds"]
    for s in SPEC["shots"]:
        shot_starts.append((t, s["id"]))
        t += s["seconds"]
    out = [
        "# Doorstep demo: voice-over timing",
        "",
        f"Video: `video/demo-silent.mp4`, {total:.0f} s ({int(total // 60)}:{int(total % 60):02d}). Burned-in subtitles show each line from its start second.",
        "Record one take reading each line as its time comes up (a lead of ±0.5 s is fine), then save it as a WAV or M4A.",
        "",
        "| Starts at | Shot | Line |",
        "|---|---|---|",
    ]
    for l in SPEC["lines"]:
        shot = [sid for st, sid in shot_starts if st <= l["at"]][-1]
        m, s = divmod(l["at"], 60)
        out.append(f"| {int(m)}:{s:04.1f} ({l['at']:.1f} s) | {shot} | {l['text']} |")
    path.write_text("\n".join(out) + "\n")


def duration(path):
    r = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                       capture_output=True, text=True, check=True)
    return float(r.stdout.strip())


def build_silent():
    BUILD.mkdir(parents=True, exist_ok=True)
    parts = []
    title_card(BUILD / "title.png")
    encode_still(BUILD / "title.png", SPEC["titleSeconds"], BUILD / "00-title.mp4")
    parts.append(BUILD / "00-title.mp4")
    for i, shot in enumerate(SPEC["shots"], 1):
        out = BUILD / f"{i:02d}-{shot['id']}.mp4"
        if shot["id"] == "s7-code":
            cards = []
            assert abs(sum(c[0] for c in CODE_CARDS) - shot["seconds"]) < 0.01
            for j, (secs, heading, file, lines) in enumerate(CODE_CARDS):
                png = BUILD / f"code-{j}.png"
                code_card(png, heading, file, lines)
                encode_still(png, secs, BUILD / f"code-{j}.mp4")
                cards.append(BUILD / f"code-{j}.mp4")
            concat(cards, out)
        else:
            encode_shot(shot["id"], shot["seconds"], out)
        print(f"  {shot['id']}: {duration(out):.2f}s")
        parts.append(out)
    concat(parts, BUILD / "joined.mp4")
    total = duration(BUILD / "joined.mp4")
    write_ass(BUILD / "subs.ass", total)
    write_srt(OUT / "demo.srt", total)
    run("ffmpeg", "-y", "-i", BUILD / "joined.mp4", "-vf", f"ass={BUILD / 'subs.ass'}",
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-r", FPS,
        "-movflags", "+faststart", "-an", OUT / "demo-silent.mp4")
    write_narration_md(OUT / "narration.md", total)
    print(f"video/demo-silent.mp4 {duration(OUT / 'demo-silent.mp4'):.2f}s")


def concat(parts, out):
    lst = out.with_suffix(".txt")
    lst.write_text("".join(f"file '{p}'\n" for p in parts))
    run("ffmpeg", "-y", "-f", "concat", "-safe", "0", "-i", lst, "-c", "copy", out)


def build_tts(clip_dir):
    """Place line-NN.wav at each line's start second (never overlapping) and mux with the silent cut."""
    clip_dir = Path(clip_dir)
    inputs, filters, t_free = [], [], 0.0
    for i, l in enumerate(SPEC["lines"]):
        wav = clip_dir / f"line-{i:02d}.wav"
        start = max(l["at"], t_free)
        inputs += ["-i", wav]
        filters.append(f"[{i + 1}:a]aresample=48000,adelay={int(start * 1000)}:all=1[a{i}]")
        t_free = start + duration(wav) + 0.1
    n = len(SPEC["lines"])
    mix = "".join(f"[a{i}]" for i in range(n)) + f"amix=inputs={n}:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11[aout]"
    run("ffmpeg", "-y", "-i", OUT / "demo-silent.mp4", *inputs, "-filter_complex", ";".join(filters + [mix]),
        "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-shortest", "-movflags", "+faststart", OUT / "demo-tts.mp4")
    print(f"video/demo-tts.mp4 {duration(OUT / 'demo-tts.mp4'):.2f}s (last line ends {t_free:.1f}s)")


def build_final(voice):
    """Mux a recorded voice track with the silent cut, levelled to -16 LUFS (YouTube-friendly)."""
    total = duration(OUT / "demo-silent.mp4")
    run("ffmpeg", "-y", "-i", OUT / "demo-silent.mp4", "-i", voice, "-filter_complex",
        f"[1:a]highpass=f=80,afftdn=nf=-25,acompressor=threshold=-20dB:ratio=3:attack=5:release=200,"
        f"loudnorm=I=-16:TP=-1.5:LRA=11,apad,atrim=0:{total:.3f}[aout]",
        "-map", "0:v", "-map", "[aout]", "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000",
        "-movflags", "+faststart", OUT / "demo-final.mp4")
    print(f"video/demo-final.mp4 {duration(OUT / 'demo-final.mp4'):.2f}s")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "silent"
    if cmd == "silent":
        build_silent()
    elif cmd == "tts":
        build_tts(sys.argv[2])
    elif cmd == "final":
        build_final(sys.argv[2])
    else:
        sys.exit(__doc__)
