#!/usr/bin/env python3
"""Generate the illustrated porch scenes used by SCENARIO mode.

These are deliberately drawn illustrations, labelled "SIMULATED SCENE", so nobody mistakes
them for Ring camera footage (and so we never imitate the Ring watermark). Real Ring
snapshots come from LIVE mode or recorded REPLAY fixtures.

Usage: python3 -I scripts/gen-scenes.py <out_dir>
"""
import os
import sys
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 1280, 720


def font(size):
    for p in ("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf"):
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def base(night=False, dusk=False):
    img = Image.new("RGB", (W, H), (0, 0, 0))
    d = ImageDraw.Draw(img)
    sky = (28, 34, 52) if night else (214, 170, 128) if dusk else (196, 214, 226)
    d.rectangle([0, 0, W, 210], fill=sky)
    # Garden / street strip at the top (camera looks down at the porch).
    d.rectangle([0, 150, W, 230], fill=(40, 60, 40) if night else (110, 140, 96))
    # House wall
    wall = (62, 58, 56) if night else (204, 186, 160)
    d.rectangle([0, 210, W, H], fill=wall)
    for y in range(230, H, 34):  # brick courses
        d.line([0, y, W, y], fill=tuple(max(0, c - 14) for c in wall), width=2)
    # Porch floor
    floor = (52, 48, 46) if night else (168, 150, 130)
    d.polygon([(0, 560), (W, 560), (W, H), (0, H)], fill=floor)
    # Step
    d.rectangle([380, 600, 900, 640], fill=tuple(max(0, c - 20) for c in floor))
    return img, d


def door(d, open_=False, night=False):
    frame = (90, 70, 56) if night else (120, 84, 60)
    d.rectangle([500, 250, 780, 565], fill=frame)
    if open_:
        d.rectangle([515, 262, 765, 565], fill=(18, 16, 14) if night else (60, 48, 40))
        d.polygon([(515, 262), (575, 280), (575, 548), (515, 565)], fill=(150, 110, 80))
        glow = (255, 214, 150) if night else (240, 220, 190)
        d.rectangle([600, 300, 740, 560], fill=tuple(int(c * 0.35) for c in glow))
    else:
        d.rectangle([515, 262, 765, 565], fill=(70, 96, 88) if not night else (40, 56, 52))
        d.rectangle([540, 290, 740, 400], outline=(50, 70, 64), width=4)
        d.rectangle([540, 420, 740, 540], outline=(50, 70, 64), width=4)
        d.ellipse([725, 410, 741, 426], fill=(212, 180, 90))
    # Porch light
    d.rectangle([810, 300, 840, 350], fill=(60, 60, 60))
    if night:
        d.ellipse([800, 290, 850, 360], fill=(255, 224, 160))


def person(d, x, y=330, scale=1.0, coat=(70, 90, 140), vest=False, bag=False, box=False, facing_door=False):
    s = scale
    skin = (150, 120, 100)
    d.ellipse([x - 32 * s, y - 70 * s, x + 32 * s, y - 6 * s], fill=skin)  # head (no face detail)
    d.rounded_rectangle([x - 58 * s, y, x + 58 * s, y + 200 * s], radius=int(36 * s), fill=coat)
    if vest:
        d.rounded_rectangle([x - 50 * s, y + 10 * s, x + 50 * s, y + 150 * s], radius=int(24 * s), fill=(230, 200, 40))
        d.rectangle([x - 50 * s, y + 70 * s, x + 50 * s, y + 84 * s], fill=(210, 210, 210))
    d.rectangle([x - 44 * s, y + 200 * s, x - 10 * s, y + 250 * s], fill=(40, 40, 50))
    d.rectangle([x + 10 * s, y + 200 * s, x + 44 * s, y + 250 * s], fill=(40, 40, 50))
    if bag:
        d.rounded_rectangle([x + 50 * s, y + 90 * s, x + 110 * s, y + 170 * s], radius=10, fill=(120, 60, 70))
    if box:
        parcel(d, x - 60 * s, y + 80 * s, 120 * s, 80 * s)


def parcel(d, x, y, w=150, h=100):
    d.rectangle([x, y, x + w, y + h], fill=(176, 132, 84), outline=(120, 86, 50), width=3)
    d.rectangle([x + w * 0.45, y, x + w * 0.55, y + h], fill=(220, 200, 150))


def car(d, night=False):
    body = (60, 80, 120) if not night else (30, 40, 60)
    d.rounded_rectangle([860, 120, 1180, 205], radius=24, fill=body)
    d.rounded_rectangle([910, 90, 1110, 140], radius=18, fill=tuple(c + 30 for c in body))
    d.ellipse([890, 180, 950, 230], fill=(20, 20, 20))
    d.ellipse([1090, 180, 1150, 230], fill=(20, 20, 20))
    if night:
        d.ellipse([1165, 150, 1195, 175], fill=(255, 240, 180))


def cat(d):
    d.ellipse([950, 580, 1050, 640], fill=(60, 50, 44))
    d.ellipse([1030, 560, 1075, 600], fill=(60, 50, 44))
    d.polygon([(1035, 566), (1042, 545), (1050, 566)], fill=(60, 50, 44))
    d.polygon([(1055, 566), (1064, 545), (1070, 568)], fill=(60, 50, 44))
    d.line([950, 600, 905, 570], fill=(60, 50, 44), width=10)


def finish(img, name, out_dir, night=False):
    img = img.filter(ImageFilter.GaussianBlur(1.2))  # soften to camera-ish
    d = ImageDraw.Draw(img)
    f = font(22)
    label = "SIMULATED SCENE · illustration, not a Ring camera image"
    tw = d.textlength(label, font=f)
    d.rectangle([16, H - 52, 32 + tw, H - 16], fill=(0, 0, 0))
    d.text((24, H - 47), label, fill=(255, 255, 255), font=f)
    img.save(os.path.join(out_dir, f"{name}.jpg"), quality=82)


def main(out_dir):
    os.makedirs(out_dir, exist_ok=True)
    scenes = {}

    def scene(name, night=False, dusk=False):
        def wrap(fn):
            scenes[name] = (fn, night, dusk)
            return fn
        return wrap

    @scene("porch_empty")
    def _(d): door(d)

    @scene("porch_empty_night", night=True)
    def _(d): door(d, night=True)

    @scene("courier_package")
    def _(d):
        door(d); parcel(d, 560, 590, 130, 80); person(d, 330, vest=True, coat=(60, 60, 70))

    @scene("package_on_porch")
    def _(d):
        door(d); parcel(d, 560, 590, 130, 80)

    @scene("package_on_porch_dusk", dusk=True)
    def _(d):
        door(d); parcel(d, 560, 590, 130, 80)

    @scene("package_on_porch_night", night=True)
    def _(d):
        door(d, night=True); parcel(d, 560, 590, 130, 80)

    @scene("package_brought_in")
    def _(d):
        door(d, open_=True); person(d, 640, y=320, coat=(150, 90, 110), box=True)

    @scene("visitor_ding")
    def _(d):
        door(d); person(d, 400, coat=(90, 110, 90))

    @scene("visitor_ding_night", night=True)
    def _(d):
        door(d, night=True); person(d, 400, coat=(40, 46, 60))

    @scene("aide_arrives")
    def _(d):
        door(d); person(d, 400, coat=(70, 120, 150), bag=True)

    @scene("door_answered")
    def _(d):
        door(d, open_=True); person(d, 640, y=320, coat=(150, 90, 110)); person(d, 380, coat=(70, 120, 150), bag=True)

    @scene("aide_leaves")
    def _(d):
        door(d); person(d, 260, y=300, scale=0.85, coat=(70, 120, 150), bag=True)

    @scene("meal_delivery")
    def _(d):
        door(d); person(d, 400, coat=(160, 70, 50), bag=True)

    @scene("resident_steps_out")
    def _(d):
        door(d, open_=True); person(d, 640, y=330, coat=(150, 90, 110))

    @scene("car_passing")
    def _(d):
        door(d); car(d)

    @scene("cat_on_porch")
    def _(d):
        door(d); cat(d)

    @scene("person_night", night=True)
    def _(d):
        door(d, night=True); person(d, 900, y=300, scale=0.9, coat=(30, 34, 44))

    for name, (fn, night, dusk) in scenes.items():
        img, d = base(night=night, dusk=dusk)
        fn(d)
        finish(img, name, out_dir, night=night)
        print("wrote", name)


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "scenarios/images")
