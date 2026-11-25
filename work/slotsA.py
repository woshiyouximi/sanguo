# -*- coding: utf-8 -*-
"""方案 A（转 90°）坐标换算：原作 71x14 格 -> 竖屏 750x1334。

世界: worldX = gx*96 + 48 (前进轴), worldY = gy*72 + 36 (横向车道)
屏幕: s = 750/1008 = 0.744
      screenX = worldY * s
      screenY = 1000 - (worldX - camX) * s
战场带: y in [100, 1000]
"""
S = 750.0 / 1008.0
BAND_TOP, BAND_BOT = 100.0, 1000.0
CELL_X_W = 96.0   # 世界 x 方向格长 -> 屏幕纵向
CELL_Y_W = 72.0   # 世界 y 方向格长 -> 屏幕横向

FANG_M1 = """1,6 1,7 2,6 2,7 1,5 2,5 3,6 3,7 3,5 1,8
2,8 3,8 4,6 4,7 4,5 4,8 1,4 2,4 3,4 4,4
5,6 5,7 5,5 5,8 5,4 1,9 2,9 3,9 4,9 5,9
6,6 6,7 6,5 6,8 6,4 6,9 1,3 2,3 3,3 4,3
5,3 6,3 7,6 7,7 7,5 7,8 7,4 7,9 7,3 1,10
2,10 3,10 4,10 5,10 6,10 7,10 1,2 2,2 3,2 4,2
5,2 6,2 7,2 1,11 2,11 3,11 4,11 5,11 6,11 7,11"""
FANG_M2 = """-1,6 -1,7 -2,6 -2,7 -1,5 -2,5 -1,8 -2,8 -3,6 -3,7
-3,5 -3,8 -1,4 -2,4 -3,4 -1,9 -2,9 -3,9 -1,3 -2,3
-3,3 -1,10 -2,10 -3,10 -1,2 -2,2 -3,2 -1,11 -2,11 -3,11"""
ZHUI_M1 = """1,6 2,6 1,7 2,7 1,5 1,8 3,6 3,7 2,5 2,8
4,6 4,7 3,5 3,8 5,6 5,7 4,5 4,8 6,6 6,7
5,5 5,8 4,4 3,4 2,4 1,4 4,9 3,9 2,9 1,9
7,6 7,7 6,5 6,8 5,4 5,9 8,6 8,7 7,5 7,8
6,4 6,9 9,6 9,7 8,5 8,8 7,4 7,9 10,6 10,7
9,5 9,8 8,4 8,9 11,6 11,7 10,5 10,8 9,4 9,9
8,3 7,3 6,3 5,3 4,3 3,3 2,3 1,3 8,10 7,10
6,10 5,10 4,10 3,10 2,10"""
ZHUI_M2 = """-1,6 -1,7 -1,5 -1,8 -2,6 -2,7 -2,5 -2,8 -1,4 -2,4
-1,9 -2,9 -3,6 -3,7 -3,5 -3,8 -3,4 -3,9 -1,3 -1,10
-2,3 -2,10 -3,3 -3,10 -4,6"""


def parse(s):
    return [(int(t.split(',')[0]), int(t.split(',')[1])) for t in s.split()]


def build(modes, anchor, n_total=100):
    shift = anchor + (200 - n_total) // 25
    out = []
    for w, arr, n in modes:
        for i in range(n):
            tx, ty = arr[i]
            out.append((tx + shift, ty))
    return out


def screen(gx, gy, camx):
    wx = gx * CELL_X_W + 48.0
    wy = gy * CELL_Y_W + 36.0
    return wy * S, BAND_BOT - (wx - camx) * S


def report(name, modes, anchor):
    slots = build(modes, anchor)
    assert len(slots) == 100, len(slots)
    assert len(set(slots)) == 100, 'duplicate slot'
    gxs = [p[0] for p in slots]
    gys = [p[1] for p in slots]
    gx0, gx1, gy0, gy1 = min(gxs), max(gxs), min(gys), max(gys)
    camx = gx0 * CELL_X_W          # 队尾贴下沿（文档示例用）
    ys = [screen(gx, gy, camx)[1] for gx, gy in slots]
    xs = [screen(gx, gy, camx)[0] for gx, gy in slots]
    print('== %s ==' % name)
    print('  格X %d..%d (%d 格)  格Y %d..%d (%d 车道)' % (gx0, gx1, gx1-gx0+1, gy0, gy1, gy1-gy0+1))
    print('  世界 x %.0f..%.0f (深 %.0f px)  世界 y %.0f..%.0f' %
          (gx0*96+48, gx1*96+48, (gx1-gx0)*96, gy0*72+36, gy1*72+36))
    print('  camX 示例 %.0f  屏上 y %.1f..%.1f (高 %.1f px, %.1f 行)' %
          (camx, min(ys), max(ys), max(ys)-min(ys), (max(ys)-min(ys))/ (96*S)))
    print('  屏上 x %.1f..%.1f  出屏? 上沿 %s 下沿 %s' %
          (min(xs), max(xs),
           'YES %.0f px' % (BAND_TOP - min(ys)) if min(ys) < BAND_TOP else 'no',
           'YES' if max(ys) > BAND_BOT else 'no'))
    print('  前 12 兵 [slot: 格X,格Y -> 屏x,屏y]')
    for i in range(12):
        gx, gy = slots[i]
        sx, sy = screen(gx, gy, camx)
        print('    %2d: (%2d,%2d) -> (%6.1f, %6.1f)' % (i, gx, gy, sx, sy))
    return slots


report('方陣 a=0 anchor9', [(140, parse(FANG_M1), 70), (60, parse(FANG_M2), 30)], 9)
report('錐形 a=2 anchor8', [(150, parse(ZHUI_M1), 75), (50, parse(ZHUI_M2), 25)], 8)

RANGES = [(0, '方形', 10, 20, 2, 11), (1, '圓形', 10, 25, 2, 11), (2, '錐形', 8, 23, 3, 10),
          (3, '雁形', 10, 24, 0, 13), (4, '玄襄', 9, 31, 0, 13), (5, '魚麗', 12, 27, 0, 13),
          (6, '鉤形', 9, 24, 2, 11), (7, '衝鋒', 8, 21, 0, 13), (8, '箭矢', 10, 28, 1, 12)]
print('== 九阵 N=100 竖屏纵深（标准 0.744 / 全景 0.67） ==')
print('  a 名      格X范围   深度px(世界)  标准档高px  行数   900px 内? ')
for a, nm, x0, x1, y0, y1 in RANGES:
    depth = (x1 - x0) * 96 + 96
    h = depth * S
    print('  %d %-6s %2d..%-2d   %5d      %6.1f   %5.1f   %s' %
          (a, nm, x0, x1, depth, h, h / (96 * S), 'YES' if h <= 900 else 'NO +%.0f' % (h-900)))
