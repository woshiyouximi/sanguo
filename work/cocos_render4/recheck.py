"""像素复核：同一批设计坐标点上比较 before/after 的 RGB，报均值、最坏偏差、色相偏移。

用法：python recheck.py before.png after.png
"""
import sys
from PIL import Image

CARDS = {
    "main": (16, 136, 718, 166),
    "gen": (16, 336, 718, 128),
    "troop": (16, 500, 718, 188),
    "form": (16, 724, 718, 132),
    "wise": (16, 884, 718, 116),
    "power": (16, 1040, 718, 120),
}
OTHER = {
    "header": (0, 0, 750, 110),
    "footer": (0, 1200, 750, 130),
    "gutter_cards": (20, 306, 710, 24),
    "bg_right": (740, 400, 8, 700),
}

# 上一轮定的复核点（设计坐标）：深色区代表性位置
POINTS = [
    (100, 450), (400, 450), (700, 450),
    (100, 640), (400, 640), (700, 640),
    (100, 930), (400, 930), (700, 930),
    (100, 1100), (400, 1100), (700, 1100),
    (200, 200), (600, 200),
]


def mean_of(px, rect, step=3):
    x, y, w, h = rect
    n = 0
    s = [0, 0, 0]
    for yy in range(y, y + h, step):
        for xx in range(x, x + w, step):
            p = px[xx, yy]
            s[0] += p[0]
            s[1] += p[1]
            s[2] += p[2]
            n += 1
    return tuple(round(v / n, 1) for v in s)


def main(before, after):
    b = Image.open(before).convert("RGB")
    a = Image.open(after).convert("RGB")
    bp, ap = b.load(), a.load()
    print("before=%s  after=%s  size=%s/%s" % (before.split("\\")[-1], after.split("\\")[-1], b.size, a.size))
    worst = 0
    print("-- 区域均值 (R,G,B) 与最大通道差 --")
    for name, r in list(CARDS.items()) + list(OTHER.items()):
        mb = mean_of(bp, r)
        ma = mean_of(ap, r)
        d = max(abs(mb[i] - ma[i]) for i in range(3))
        worst = max(worst, d)
        print("  %-14s before=%-22s after=%-22s maxd=%5.1f  hue dB-R=%+.1f" % (name, mb, ma, d, (ma[2] - ma[0]) - (mb[2] - mb[0])))
    print("-- 逐点复核 --")
    pw = 0
    for (x, y) in POINTS:
        pb, pa = bp[x, y], ap[x, y]
        d = max(abs(pb[i] - pa[i]) for i in range(3))
        pw = max(pw, d)
        print("  (%3d,%4d) before=%-16s after=%-16s maxd=%3d %s" % (x, y, pb, pa, d, "PURPLE?" if (pa[2] > pa[0] + 2 and pa[1] < pa[0] - 12) else ""))
    print("-- 汇总 --")
    print("  区域均值最坏通道差 = %.1f" % worst)
    print("  逐点最坏通道差     = %d" % pw)
    # 全图偏紫检查：B 比 R 高的像素占比变化
    def purple_ratio(img, px):
        n = 0
        tot = 0
        for yy in range(0, img.size[1], 2):
            for xx in range(0, img.size[0], 2):
                p = px[xx, yy]
                tot += 1
                if p[2] > p[0] + 6 and p[2] > p[1] + 10:
                    n += 1
        return 100.0 * n / tot
    print("  偏紫像素占比 before=%.2f%%  after=%.2f%%" % (purple_ratio(b, bp), purple_ratio(a, ap)))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
