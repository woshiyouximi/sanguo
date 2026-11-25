# -*- coding: utf-8 -*-
"""w7-cocos-render3：编成页把「列数」夹到 16 之后色数从 4005 掉回 3521（目标 3631），
改从「行数」补回来 —— 垂直方向是明度渐变（G 通道），不参与色相偏移，不会再把整页漂紫。
"""
import io

P = r"F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts"
s = io.open(P, encoding="utf-8").read()

PATCHES = [
    # 六卡：行数加密（每行 3~7 个半分辨率像素，仍 >= 8 像素/格）
    ("const CARD_ROWS: readonly number[] = [14, 11, 15, 11, 10, 10];",
     "const CARD_ROWS: readonly number[] = [20, 16, 22, 16, 14, 14];"),
    # 页头 / 底栏压条
    ("this.areaGrid(base, 0, 0, DESIGN_W, 124, 30, 8, '#2A241C', 14, 214);",
     "this.areaGrid(base, 0, 0, DESIGN_W, 124, 30, 11, '#2A241C', 16, 214);"),
    ("this.areaGrid(base, 0, 1194, DESIGN_W, 140, 30, 9, '#2B2D2B', 12, 236);",
     "this.areaGrid(base, 0, 1194, DESIGN_W, 140, 30, 12, '#2B2D2B', 14, 236);"),
    # 底栏两颗大钮：330x84 → 16 列 x 10 行（每格 10x4 半像素）
    ("this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 14, 7, 246);",
     "this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 16, 10, 246);"),
    ("this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 14, 7, 255);",
     "this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 16, 10, 255);"),
    # 出阵顺序收起态窄条：678x36 → 16 列 x 5 行
    ("this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 30, 3, 240);",
     "this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 16, 5, 240);"),
    # 队列弹窗 5 行
    ("this.areaGrid(g, px + 12, rowY - 6, pw - 24, rowH - 8, 24, 4, onField ? '#221E17' : '#191B1F', 12, 190);",
     "this.areaGrid(g, px + 12, rowY - 6, pw - 24, rowH - 8, 24, 6, onField ? '#221E17' : '#191B1F', 12, 190);"),
]

for old, new in PATCHES:
    assert s.count(old) == 1, ("not unique/absent", old[:60], s.count(old))
    s = s.replace(old, new)

io.open(P, "w", encoding="utf-8", newline="\n").write(s)
print("patched", len(PATCHES))
