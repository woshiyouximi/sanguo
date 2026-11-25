# -*- coding: utf-8 -*-
"""02_战斗重构设计 用：把 04b1 的阵形数组换算成竖屏 14x60 坐标。
输入：方形(a=0) / 錐形(a=2) 的 N=100 实际用到的 slot（前 100 名）。
换算：格X = 表X + anchorX + (200-N)/25 ; 格Y = 表Y
      我方 col = 格Y ; row = 59 - floor(格X*60/71)
"""
GRID_R = 60
def row_of_mine(gx):   # 我方（下）
    return (GRID_R - 1) - (gx * GRID_R) // 71
def row_of_foe(gx):    # 敌方（上）
    return (gx * GRID_R) // 71

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
    out = []
    for tok in s.split():
        x, y = tok.split(',')
        out.append((int(x), int(y)))
    return out

def build(name, modes, anchor):
    """modes: [(w, arr, n_units)]  —— 骑兵占低位 slot"""
    shift = anchor + (200 - 100) // 25
    rows = []
    for w, arr, n in modes:
        for i in range(n):
            tx, ty = arr[i]
            rows.append((tx + shift, ty))
    return rows

def report(name, modes, anchor):
    slots = build(name, modes, anchor)
    assert len(slots) == 100, len(slots)
    seen = {}
    coll = []
    out = []
    for i, (gx, gy) in enumerate(slots):
        col, row = gy, row_of_mine(gx)
        assert 0 <= col <= 13 and 0 <= row <= 59
        if (col, row) in seen:
            coll.append((i, seen[(col, row)], (col, row)))
        else:
            seen[(col, row)] = i
        out.append((col, row, gx, gy))
    gxs = [s[0] for s in slots]; gys = [s[1] for s in slots]
    cols = [o[0] for o in out]; rws = [o[1] for o in out]
    print('== %s ==' % name)
    print('  格X %d..%d  格Y %d..%d' % (min(gxs), max(gxs), min(gys), max(gys)))
    print('  竖屏 col %d..%d  row %d..%d' % (min(cols), max(cols), min(rws), max(rws)))
    print('  覆盖格 %d 个（%d 列 x %d 行），占用 %d，叠格 %d 例'
          % (len(set((o[0], o[1]) for o in out)), max(cols)-min(cols)+1,
             max(rws)-min(rws)+1, len(out), len(coll)))
    for c in coll:
        print('   叠格 slot%d 与 slot%d 同落 %s' % (c[0], c[1], c[2]))
    # 紧凑输出：10 个一行
    lines = []
    for i in range(0, 100, 10):
        lines.append('  '.join('%d,%d' % (out[j][0], out[j][1]) for j in range(i, i+10)))
    for l in lines:
        print('  ' + l)
    # 骑兵标记：mode1 前 14、mode2 前 6
    return out

report('方形之陣 a=0', [(140, parse(FANG_M1), 70), (60, parse(FANG_M2), 30)], 9)
report('錐形之陣 a=2', [(150, parse(ZHUI_M1), 75), (50, parse(ZHUI_M2), 25)], 8)

# 九阵 N=100 占格范围 → 竖屏行范围
RANGES = [(0,'方形',10,20,2,11),(1,'圓形',10,25,2,11),(2,'錐形',8,23,3,10),
          (3,'雁形',10,24,0,13),(4,'玄襄',9,31,0,13),(5,'魚麗',12,27,0,13),
          (6,'鉤形',9,24,2,11),(7,'衝鋒',8,21,0,13),(8,'箭矢',10,28,1,12)]
print('== 九阵 N=100 竖屏占格 ==')
for a,name,x0,x1,y0,y1 in RANGES:
    r_my0, r_my1 = row_of_mine(x1), row_of_mine(x0)   # 我方：x 大 -> row 小
    r_en0, r_en1 = row_of_foe(x0), row_of_foe(x1)
    print('  %d %s: 我方 row %d..%d col %d..%d | 敌方 row %d..%d | 两军前列间距 %d 行'
          % (a, name, r_my0, r_my1, y0, y1, r_en0, r_en1, r_my0 - r_en1))
