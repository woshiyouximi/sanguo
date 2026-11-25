"""空帶量測：逐行判斷「這一行有沒有墨」，求最長連續無墨縱向距離。

口徑（自訂，報告裡寫清楚）：
- 矩形用設計座標（750x1334），乘以 (sx,sy) 加上 (ox,oy) 換算成圖上像素；矩形已內縮 6px，
  不含邊框/描邊本身（描邊是「框」，不算內容墨）。
- 每行只看**局部反差**：對每個 x 比較 p(x) 與 p(x+3)，任一通道差 > TOL(5) 就算這點有墨。
  整行均勻、或只有緩慢漸變（光柵帶）時局部差 ≈ 0 → 無墨；文字筆畫、分隔線、格線、圖示都會判為有墨。
- 一行內有墨點數 < max(6, 3% 行寬) → 這行算「無墨」。
- 最長連續無墨行數 = 空帶長度（像素，按 sy 換算回設計像素）。
用法：python inkband.py <png> [--sx 1.0255 --sy 1.0255 --ox 53.4]
"""
import sys
from PIL import Image

TOL = 5
DX = 3
MIN_ABS = 6
MIN_FRAC = 0.03
INSET = 6

RECTS = [
    ("items.det", 460, 406, 272, 736),
    ("items.det.lower", 460, 780, 272, 362),
    ("items.bigFrame", 533, 414, 126, 126),
    ("items.gen", 18, 96, 714, 302),
    ("items.list", 18, 406, 430, 736),
    ("deploy.page", 0, 0, 750, 1334),
]


def runs(rows):
    """回傳 [(len, start), ...]，依長度降序。"""
    out = []
    cur = 0
    start = 0
    for i, ink in enumerate(rows):
        if not ink:
            if cur == 0:
                start = i
            cur += 1
        else:
            if cur:
                out.append((cur, start))
                cur = 0
    if cur:
        out.append((cur, start))
    out.sort(reverse=True)
    return out


def measure(path, sx, sy, ox=0.0, oy=0.0, rects=RECTS):
    im = Image.open(path).convert("RGB")
    W, H = im.size
    px = im.load()
    print("%s  %dx%d  scale=(%.4f, %.4f) off=(%.1f, %.1f)" % (path.split("\\")[-1], W, H, sx, sy, ox, oy))
    for name, x, y, w, h in rects:
        x += INSET
        y += INSET
        w -= 2 * INSET
        h -= 2 * INSET
        X0 = max(0, int(round(x * sx + ox)))
        Y0 = max(0, int(round(y * sy + oy)))
        X1 = min(W, int(round((x + w) * sx + ox)))
        Y1 = min(H, int(round((y + h) * sy + oy)))
        if X1 <= X0 or Y1 <= Y0:
            continue
        width = X1 - X0
        need = max(MIN_ABS, int(round(width * MIN_FRAC)))
        rows = []
        for yy in range(Y0, Y1):
            ink = 0
            for xx in range(X0, X1 - DX):
                a = px[xx, yy]
                b = px[xx + DX, yy]
                if abs(a[0] - b[0]) > TOL or abs(a[1] - b[1]) > TOL or abs(a[2] - b[2]) > TOL:
                    ink += 1
                    if ink >= need:
                        break
            rows.append(ink >= need)
        top = runs(rows)[:3]
        gap, at = (top[0] if top else (0, 0))
        others = " ".join("%d@y%d" % (g, Y0 + s) for g, s in top[1:]) or "-"
        print("  %-16s px=(%d,%d,%d,%d) need=%d  inkless=%d/%d  longest=%d  at y=%d..%d (design y=%.0f..%.0f)  next: %s"
              % (name, X0, Y0, width, Y1 - Y0, need, sum(1 for r in rows if not r), len(rows),
                 gap, Y0 + at, Y0 + at + gap - 1, (Y0 + at) / sy, (Y0 + at + gap - 1) / sy, others))


if __name__ == "__main__":
    args = sys.argv[1:]
    path = args[0]
    sx = float(args[args.index("--sx") + 1]) if "--sx" in args else 1.0
    sy = float(args[args.index("--sy") + 1]) if "--sy" in args else 1.0
    ox = float(args[args.index("--ox") + 1]) if "--ox" in args else 0.0
    oy = float(args[args.index("--oy") + 1]) if "--oy" in args else 0.0
    measure(path, sx, sy, ox, oy)
