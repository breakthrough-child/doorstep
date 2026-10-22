#!/usr/bin/env python3
"""Turn free-licence stock photos into doorbell-camera-style example frames.

Input:  assets/stock/<scene>.jpg  plus  assets/stock/credits.json  (one entry per photo)
Output: scenarios/images/stock/<scene>.jpg  (1280x720, slight fisheye, night scenes darker
        and grainy, labelled "Example event · stock photo")  and  assets/CREDITS.md

These are never presented as Ring media: no Ring logo or watermark is added, and the UI labels
them "Example event · stock photo". Scenes without a stock photo keep their illustration.

credits.json entry:
  {"scene": "aide_arrives", "file": "aide_arrives.jpg", "title": "...", "author": "...",
   "source": "https://unsplash.com/photos/...", "license": "Unsplash License",
   "licenseUrl": "https://unsplash.com/license", "night": false}

Usage: python3 -I scripts/stockify.py
"""
import json
import math
import os
import sys

from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "stock")
OUT = os.path.join(ROOT, "scenarios", "images", "stock")
W, H = 1280, 720
NIGHT_SCENES = {"porch_empty_night", "visitor_ding_night", "person_night"}


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def crop_16x9(im):
    w, h = im.size
    target = 16 / 9
    if w / h > target:
        nw = int(h * target)
        x = (w - nw) // 2
        im = im.crop((x, 0, x + nw, h))
    else:
        nh = int(w / target)
        y = max(0, (h - nh) // 3)  # keep a little more of the top, like a doorbell mounted high
        im = im.crop((0, y, w, y + nh))
    return im.resize((W, H), Image.LANCZOS)


def barrel(im, k=0.12, grid=24):
    """Slight fisheye using a mesh transform (no numpy needed)."""
    cx, cy = W / 2, H / 2
    rmax = math.hypot(cx, cy)

    def src(x, y):
        dx, dy = (x - cx) / rmax, (y - cy) / rmax
        r2 = dx * dx + dy * dy
        f = 1 + k * r2
        # zoom in slightly so the corners stay filled
        z = 1 / (1 + k * 0.55)
        return cx + dx * f * z * rmax, cy + dy * f * z * rmax

    mesh = []
    xs = [W * i / grid for i in range(grid + 1)]
    ys = [H * j / grid for j in range(grid + 1)]
    for j in range(grid):
        for i in range(grid):
            box = (int(xs[i]), int(ys[j]), int(xs[i + 1]), int(ys[j + 1]))
            quad = (*src(xs[i], ys[j]), *src(xs[i], ys[j + 1]), *src(xs[i + 1], ys[j + 1]), *src(xs[i + 1], ys[j]))
            mesh.append((box, quad))
    return im.transform((W, H), Image.MESH, mesh, Image.BICUBIC)


def vignette(im, strength=0.35):
    """Darken the corners, as a wide-angle doorbell lens does."""
    radial = Image.radial_gradient("L").resize((W, H)).point(lambda v: int(v * strength))
    return Image.composite(Image.new("RGB", (W, H), (0, 0, 0)), im, radial)


def night(im, seed):
    im = ImageEnhance.Brightness(im).enhance(0.38)
    im = ImageEnhance.Color(im).enhance(0.45)
    r, g, b = im.split()
    b = b.point(lambda v: min(255, int(v * 1.12)))
    im = Image.merge("RGB", (r, g, b))
    noise = Image.effect_noise((W, H), 28).convert("RGB")
    im = Image.blend(im, noise, 0.10)
    return im.filter(ImageFilter.GaussianBlur(0.6))


def label(im):
    d = ImageDraw.Draw(im)
    f = font(20)
    text = "Example event · stock photo"
    tw = d.textlength(text, font=f)
    d.rectangle([16, H - 48, 32 + tw, H - 16], fill=(0, 0, 0))
    d.text((24, H - 44), text, fill=(255, 255, 255), font=f)
    return im


def main():
    credits_path = os.path.join(SRC, "credits.json")
    if not os.path.exists(credits_path):
        print("No assets/stock/credits.json yet; nothing to do.")
        return 0
    credits = json.load(open(credits_path))
    os.makedirs(OUT, exist_ok=True)
    done = []
    for c in credits:
        p = os.path.join(SRC, c["file"])
        if not os.path.exists(p):
            print(f"  ! missing {c['file']}, skipping {c['scene']}")
            continue
        im = crop_16x9(Image.open(p).convert("RGB"))
        im = barrel(im)
        is_night = c.get("night", c["scene"] in NIGHT_SCENES)
        if is_night:
            im = night(im, c["scene"])
        im = vignette(im, 0.45 if is_night else 0.25)
        im = label(im)
        im.save(os.path.join(OUT, f"{c['scene']}.jpg"), quality=84)
        done.append(c)
        print(f"  ✓ {c['scene']}{' (night)' if is_night else ''}")

    lines = [
        "# Image credits",
        "",
        "Example-event pictures in Doorstep come from three sources:",
        "",
        "- **Real Ring media.** Frames recorded from the Ring Developer Playground (`fixtures/playground/snapshots/`), shown uncropped with Ring's watermark.",
        "- **Stock photos** (below), processed by `scripts/stockify.py` into a doorbell-camera view: cropped to 16:9, slight fisheye, night shots darkened. They're labelled *Example event · stock photo* in the app and carry no Ring marks.",
        "- **Illustrations** drawn by `scripts/gen-scenes.py`, labelled *Example event · illustration*.",
        "",
        "Processed versions of CC BY-SA photos are shared under the same licence (CC BY-SA), as the licence requires.",
        "",
        "| Scene | Photo | Author | Source | Licence |",
        "|---|---|---|---|---|",
    ]
    for c in done:
        lines.append(f"| `{c['scene']}` | {c.get('title', '')} | {c.get('author', '')} | {c.get('source', '')} | [{c.get('license', '')}]({c.get('licenseUrl', '')}) |")
    open(os.path.join(ROOT, "assets", "CREDITS.md"), "w").write("\n".join(lines) + "\n")
    print(f"Processed {len(done)} photo(s); wrote assets/CREDITS.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
