# -*- coding: utf-8 -*-
"""Frame grabber for p01.mp4 (no ffmpeg on PATH -> use imageio_ffmpeg bundled binary).

Usage:
  python grab.py clip <start> <end> <fps> <tag> [cols] [rows]
      -> extract frames in [start,end] at fps, build contact sheets under _clip/<tag>/
  python grab.py one <t> <tag> [scale] [cropbox]
      -> single full frame at time t, upscaled by scale (default 3), saved as stills/<tag>.png
         cropbox optional "x,y,w,h" in SOURCE pixels (640x360)
"""
import os, sys, glob, subprocess
from PIL import Image, ImageDraw, ImageFont

FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
SRC = r"F:\sanguo\work\bili\p01.mp4"
ROOT = r"F:\sanguo\work\video_ref"
CLIP = os.path.join(ROOT, "_clip")
STILL = os.path.join(ROOT, "stills")

def fmt(t):
    t = float(t)
    return "%d:%05.2f" % (int(t // 60), t % 60)

def run(args):
    p = subprocess.run(args, capture_output=True, text=True, errors="replace")
    if p.returncode != 0:
        print("FFMPEG ERR", p.returncode, p.stderr[-1500:])
    return p.returncode == 0

def clip(start, end, fps, tag, cols=6, rows=5):
    d = os.path.join(CLIP, tag)
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*.png")):
        os.remove(f)
    ok = run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(start), "-to", str(end),
              "-i", SRC, "-vf", "fps=%s" % fps, "-q:v", "2", os.path.join(d, "f_%05d.png")])
    files = sorted(glob.glob(os.path.join(d, "f_*.png")))
    print("frames", len(files), "ok", ok)
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 16)
    per = cols * rows
    sheets = []
    for s in range(0, len(files), per):
        chunk = files[s:s + per]
        rr = (len(chunk) + cols - 1) // cols
        W, H = 320, 180
        sh = Image.new("RGB", (cols * W, rr * (H + 18)), (20, 20, 20))
        dr = ImageDraw.Draw(sh)
        for k, f in enumerate(chunk):
            idx = s + k
            t = float(start) + idx / float(fps)
            im = Image.open(f).convert("RGB").resize((W, H))
            x, y = (k % cols) * W, (k // cols) * (H + 18)
            sh.paste(im, (x, y))
            dr.text((x + 3, y + H + 1), fmt(t), fill=(255, 255, 0), font=font)
        p = os.path.join(d, "sheet_%02d.png" % (s // per))
        sh.save(p)
        sheets.append(p)
        print(p)
    return sheets

def one(t, tag, scale=3, crop=None):
    os.makedirs(STILL, exist_ok=True)
    tmp = os.path.join(STILL, "_tmp.png")
    run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", SRC,
         "-frames:v", "1", "-y", tmp])
    im = Image.open(tmp).convert("RGB")
    if crop:
        x, y, w, h = [int(v) for v in crop.split(",")]
        im = im.crop((x, y, x + w, y + h))
    if scale != 1:
        im = im.resize((im.width * scale, im.height * scale), Image.LANCZOS)
    p = os.path.join(STILL, tag + ".png")
    im.save(p)
    print(p, im.size)
    return p

def boxstrip(start, end, fps, tag, crop, scale=4):
    """Stack cropped region (e.g. the dialogue box) vertically with timestamps."""
    d = os.path.join(CLIP, tag + "_raw")
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*.png")):
        os.remove(f)
    x, y, w, h = [int(v) for v in crop.split(",")]
    run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(start), "-to", str(end),
         "-i", SRC, "-vf", "fps=%s,crop=%d:%d:%d:%d,scale=iw*%d:ih*%d:flags=lanczos" % (
             fps, w, h, x, y, scale, scale),
         os.path.join(d, "f_%05d.png")])
    files = sorted(glob.glob(os.path.join(d, "f_*.png")))
    if not files:
        print("no frames"); return None
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 20)
    ims = [Image.open(f).convert("RGB") for f in files]
    W = max(i.width for i in ims) + 150
    H = sum(i.height for i in ims)
    out = Image.new("RGB", (W, H), (16, 16, 16))
    dr = ImageDraw.Draw(out)
    yy = 0
    for im, f in zip(ims, files):
        out.paste(im, (150, yy))
        t = float(start) + files.index(f) / float(fps)
        dr.text((4, yy + im.height // 2 - 10), fmt(t), fill=(255, 255, 0), font=font)
        yy += im.height
    p = os.path.join(STILL, tag + ".png")
    out.save(p)
    print(p, out.size, len(files))
    return p

def grid(start, end, fps, tag, crop, scale=2, cols=3):
    """Crop+upscale frames in a range and lay them out in a labelled grid (for frame-by-frame)."""
    d = os.path.join(CLIP, tag + "_raw")
    os.makedirs(d, exist_ok=True)
    for f in glob.glob(os.path.join(d, "*.png")):
        os.remove(f)
    x, y, w, h = [int(v) for v in crop.split(",")]
    run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(start), "-to", str(end),
         "-i", SRC, "-vf", "fps=%s,crop=%d:%d:%d:%d,scale=iw*%d:ih*%d:flags=neighbor" % (
             fps, w, h, x, y, scale, scale), os.path.join(d, "f_%05d.png")])
    files = sorted(glob.glob(os.path.join(d, "f_*.png")))
    if not files:
        print("no frames"); return None
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 18)
    ims = [Image.open(f).convert("RGB") for f in files]
    CW, CH = ims[0].size
    rows = (len(ims) + cols - 1) // cols
    out = Image.new("RGB", (cols * CW, rows * (CH + 20)), (0, 0, 0))
    dr = ImageDraw.Draw(out)
    for k, im in enumerate(ims):
        cx, cy = (k % cols) * CW, (k // cols) * (CH + 20)
        out.paste(im, (cx, cy))
        dr.text((cx + 3, cy + CH + 1), fmt(float(start) + k / float(fps)),
                fill=(255, 255, 0), font=font)
    p = os.path.join(STILL, tag + ".png")
    out.save(p)
    print(p, out.size, len(files))
    return p

if __name__ == "__main__":
    cmd = sys.argv[1]
    if cmd == "clip":
        a = sys.argv[2:]
        clip(a[0], a[1], a[2], a[3], int(a[4]) if len(a) > 4 else 6, int(a[5]) if len(a) > 5 else 5)
    elif cmd == "one":
        a = sys.argv[2:]
        one(a[0], a[1], int(a[2]) if len(a) > 2 else 3, a[3] if len(a) > 3 else None)
    elif cmd == "box":
        a = sys.argv[2:]
        boxstrip(a[0], a[1], a[2], a[3], a[4], int(a[5]) if len(a) > 5 else 4)

    elif cmd == "grid":
        a = sys.argv[2:]
        grid(a[0], a[1], a[2], a[3], a[4], int(a[5]) if len(a) > 5 else 2, int(a[6]) if len(a) > 6 else 3)
