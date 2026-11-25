import sys, os
sys.path.insert(0, r"F:\sanguo\work\audit178")
import _mk
from PIL import Image

OUT = _mk.OUT
NUM = (285, 256, 360, 292)

# 1) battle-B 开局 5 帧（0.5s 步，8x）
items = []
for t in [466.5, 467.0, 467.5, 468.0, 468.5]:
    p = _mk.grab(t, f"cb_{int(t*10):05d}.png", sub="cb")
    im = Image.open(p).convert("RGB")
    items.append((_mk.crop(im, NUM, 8), _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s08f_cd_battleB_start.png"), cols=5,
            title="battle-B 开局时间牌 x8 (0.5s 步)")

# 2) battle-B 10s 步长基线
items = []
for t in [470, 480, 490, 500, 510, 520, 530, 540]:
    p = _mk.grab(t, f"cl_{int(t*10):05d}.png", sub="cb")
    im = Image.open(p).convert("RGB")
    items.append((_mk.crop(im, NUM, 6), _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s08g_cd_battleB_10s.png"), cols=4,
            title="battle-B 时间牌基线 x6 (07:50-09:00 每 10s)")

# 3) 接敌窗口：07:58-08:06 每 2s（全画面 0.8x）
items = []
for t in [478, 480, 482, 484, 486]:
    p = _mk.grab(t, f"ct_{int(t):04d}.png", sub="ct")
    im = Image.open(p).convert("RGB")
    im = im.resize((int(im.width * 0.8), int(im.height * 0.8)), Image.LANCZOS)
    items.append((im, _mk.hms(t)))
_mk.montage(items, os.path.join(OUT, "s04a_contact.png"), cols=2,
            title="接敌窗口 07:58-08:06 每2s (0.8x)")

# 4) 挥砍：08:10-08:13 每 0.25s，中段放大 3x（15 帧）
items = []
for i in range(15):
    t = 490.0 + i * 0.25
    p = _mk.grab(t, f"sw_{i:02d}.png", sub="sw")
    im = Image.open(p).convert("RGB")
    items.append((_mk.crop(im, (250, 150, 450, 260), 3), f"{t:.2f}"))
_mk.montage(items, os.path.join(OUT, "s05a_swing_0810_0813.png"), cols=5,
            title="挥砍节奏 08:10-08:13 每 0.25s x3")

# 5) 布阵/主将位置：07:49.5 放大 3x
p = _mk.grab(469.5, "fm_07495.png", sub="fm")
im = Image.open(p).convert("RGB")
items = [(im.resize((int(im.width * 1.6), int(im.height * 1.6)), Image.LANCZOS), "07:49.5 全画面")]
p2 = _mk.grab(469.5 + 0.5, "fm_07500.png", sub="fm")
im2 = Image.open(p2).convert("RGB")
items.append((_mk.crop(im2, (150, 130, 470, 280), 3), "07:50.0 中段 x3"))
_mk.montage(items, os.path.join(OUT, "s06a_formation.png"), cols=1, title="布阵/主将位置")
print("ok")
