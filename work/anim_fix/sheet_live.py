# 只读取证：把 6 张连拍（150ms 间隔）裁同一块区域放大拼版，并算两两差异像素占比。
# 跑法： python.exe sheet_live.py
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
SHOTS = [HERE / f"live_{i}.png" for i in range(6)]
TICKS = [368, 391, 414, 437, 461, 486]
CROP = (150, 690, 700, 1110)   # 战场下半部（foot soldiers 密集区），(l, t, r, b)
ZOOM = 2
PANEL = ((CROP[2] - CROP[0]) * ZOOM // 2, (CROP[3] - CROP[1]) * ZOOM)  # 每个面板再裁一半宽


def load(p):
    im = Image.open(p).convert("RGB")
    return im


def diff_pct(a, b, thr=14):
    pa, pb = a.load(), b.load()
    w, h = a.size
    n = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            ra, ga, ba = pa[x, y]
            rb, gb, bb = pb[x, y]
            if abs(ra - rb) + abs(ga - gb) + abs(ba - bb) > thr * 3:
                n += 1
    return 100.0 * n / ((w // 2 + 1) * (h // 2 + 1))


ims = [load(p) for p in SHOTS]
print("截图尺寸:", [im.size for im in ims][:1])

# 1) 全图两两差异（相邻帧）
print("\n[全图] 相邻两帧差异像素占比：")
for i in range(5):
    print(f"  帧{i}(t{TICKS[i]}) → 帧{i+1}(t{TICKS[i+1]}): {diff_pct(ims[i], ims[i+1]):.2f}%")
print(f"  帧0 → 帧5（2 秒后）      : {diff_pct(ims[0], ims[5]):.2f}%")

# 2) 找「变化最剧烈」的局部：按 32x32 块统计帧0 vs 帧1 的差异
a, b = ims[0].crop(CROP), ims[1].crop(CROP)
w, h = a.size
pa, pb = a.load(), b.load()
best, bx, by = -1, 0, 0
for by0 in range(0, h - 32, 16):
    for bx0 in range(0, w - 32, 16):
        n = 0
        for y in range(by0, by0 + 32):
            for x in range(bx0, bx0 + 32):
                ra, ga, ba = pa[x, y]
                rb, gb, bb = pb[x, y]
                if abs(ra - rb) + abs(ga - gb) + abs(ba - bb) > 42:
                    n += 1
        if n > best:
            best, bx, by = n, bx0, by0
print(f"\n[局部] 帧0→帧1 变化最剧烈的 32x32 块：CROP 内 ({bx},{by})，变化像素 {best}/1024")
cx, cy = CROP[0] + bx + 16, CROP[1] + by + 16
print(f"  换算到全图坐标 = ({cx},{cy})")

# 3) 以该点为中心裁 120x110，6 帧各放大 4x，拼 3x2 版
CW, CH = 120, 110
box = (cx - CW // 2, cy - CH // 2, cx + CW // 2, cy + CH // 2)
tiles = []
for i, im in enumerate(ims):
    t = im.crop(box).resize((CW * 4, CH * 4), Image.NEAREST)
    tile = Image.new("RGB", (CW * 4, CH * 4 + 26), (12, 12, 14))
    tile.paste(t, (0, 26))
    d = ImageDraw.Draw(tile)
    d.text((6, 6), f"shot {i}  tick {TICKS[i]}", fill=(255, 230, 120))
    tiles.append(tile)
tw, th = tiles[0].size
sheet = Image.new("RGB", (tw * 3, th * 2), (0, 0, 0))
for i, t in enumerate(tiles):
    sheet.paste(t, ((i % 3) * tw, (i // 3) * th))
out = HERE / "live_crop_6shots.png"
sheet.save(out)
print(f"\n拼版已存: {out}  尺寸 {sheet.size}   裁切框(全图坐标) {box}")

# 4) 该局部区域的两两差异
print("\n[局部 120x110] 相邻两帧差异占比：")
for i in range(5):
    print(f"  shot{i} → shot{i+1}: {diff_pct(ims[i].crop(box), ims[i+1].crop(box)):.2f}%")
