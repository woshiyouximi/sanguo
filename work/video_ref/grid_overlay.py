# -*- coding: utf-8 -*-
"""Overlay a labelled pixel grid (source coords) on a frame for measuring."""
import sys, subprocess, os
from PIL import Image, ImageDraw, ImageFont

FF = r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\Lib\site-packages\imageio_ffmpeg\binaries\ffmpeg-win-x86_64-v9.0.2.exe"
SRC = r"F:\sanguo\work\bili\p01.mp4"
STILL = r"F:\sanguo\work\video_ref\stills"

def grab(t):
    tmp = os.path.join(STILL, "_tmpg.png")
    subprocess.run([FF, "-hide_banner", "-loglevel", "error", "-ss", str(t), "-i", SRC,
                    "-frames:v", "1", "-y", tmp], check=True)
    return Image.open(tmp).convert("RGB")

def grid(t, tag, scale=3, step=20):
    im = grab(t)
    W, H = im.size
    big = im.resize((W * scale, H * scale), Image.LANCZOS)
    d = ImageDraw.Draw(big, "RGBA")
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 14)
    for x in range(0, W, step):
        major = (x % 100 == 0)
        d.line([(x * scale, 0), (x * scale, big.height)], fill=(0, 255, 0, 110 if major else 45), width=2 if major else 1)
        if major:
            d.text((x * scale + 2, 2), str(x), fill=(0, 255, 0), font=font)
    for y in range(0, H, step):
        major = (y % 100 == 0)
        d.line([(0, y * scale), (big.width, y * scale)], fill=(255, 80, 80, 110 if major else 45), width=2 if major else 1)
        if major:
            d.text((2, y * scale + 1), str(y), fill=(255, 120, 120), font=font)
    p = os.path.join(STILL, tag + ".png")
    big.save(p)
    print(p, big.size)

if __name__ == "__main__":
    grid(float(sys.argv[1]), sys.argv[2],
         int(sys.argv[3]) if len(sys.argv) > 3 else 3,
         int(sys.argv[4]) if len(sys.argv) > 4 else 20)
