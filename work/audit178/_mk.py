"""R178 audit helper: grab frames from p01.mp4 and build labelled montages.

Only writes under work/audit178/. Read-only w.r.t. game/**.
"""
import os, subprocess, sys
from PIL import Image, ImageDraw, ImageFont

FF = r"C:\Users\liutian\AppData\Local\oopz\ffmpeg.exe"
VID = r"F:\sanguo\work\bili\p01.mp4"
OUT = r"F:\sanguo\work\audit178"
FONT = r"C:\Windows\Fonts\msyh.ttc"

os.makedirs(OUT, exist_ok=True)


def grab(t, name, sub=""):
    """Extract single frame at absolute timestamp t (seconds, float)."""
    d = os.path.join(OUT, sub) if sub else OUT
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, name)
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-ss", f"{t:.3f}", "-i", VID,
           "-frames:v", "1", "-y", p]
    subprocess.run(cmd, check=True)
    return p


def grab_seq(t0, t1, fps, prefix, sub=""):
    """Extract frames t0..t1 at `fps` into sub/prefix+NNN.png ; returns list."""
    d = os.path.join(OUT, sub) if sub else OUT
    os.makedirs(d, exist_ok=True)
    cmd = [FF, "-hide_banner", "-loglevel", "error", "-ss", f"{t0:.3f}", "-to", f"{t1:.3f}",
           "-i", VID, "-vf", f"fps={fps}", "-y", os.path.join(d, prefix + "%03d.png")]
    subprocess.run(cmd, check=True)
    fs = sorted(f for f in os.listdir(d) if f.startswith(prefix) and f.endswith(".png"))
    return [os.path.join(d, f) for f in fs]


def font(sz):
    return ImageFont.truetype(FONT, sz)


def label(img, text, sz=18, bar=26, color=(255, 255, 0)):
    w, h = img.size
    canvas = Image.new("RGB", (w, h + bar), (16, 16, 20))
    canvas.paste(img, (0, bar))
    d = ImageDraw.Draw(canvas)
    d.text((4, 3), text, font=font(sz), fill=color)
    return canvas


def crop(img, box, scale=1):
    c = img.crop(box)
    if scale != 1:
        c = c.resize((int(c.width * scale), int(c.height * scale)), Image.NEAREST)
    return c


def montage(items, out, cols=2, bar=26, labelsz=18, pad=6, bg=(16, 16, 20), title=None):
    """items: list of (PIL image | path, label str). Each item already cropped/scaled."""
    imgs = []
    for it in items:
        im = it[0] if isinstance(it[0], Image.Image) else Image.open(it[0]).convert("RGB")
        imgs.append(label(im, it[1], sz=labelsz, bar=bar))
    cw = max(i.width for i in imgs)
    ch = max(i.height for i in imgs)
    rows = (len(imgs) + cols - 1) // cols
    top = 30 if title else 0
    canvas = Image.new("RGB", (cols * cw + pad * (cols + 1), top + rows * ch + pad * (rows + 1)), bg)
    if title:
        ImageDraw.Draw(canvas).text((pad + 2, 4), title, font=font(20), fill=(120, 220, 255))
    for k, im in enumerate(imgs):
        r, c = divmod(k, cols)
        canvas.paste(im, (pad + c * (cw + pad), top + pad + r * (ch + pad)))
    canvas.save(out, quality=92)
    return out


def hms(t):
    m, s = divmod(t, 60)
    return f"{int(m):02d}:{s:05.2f}"


if __name__ == "__main__":
    print("helper ok")
