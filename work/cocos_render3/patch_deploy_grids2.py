#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""DeployRoot 二维色域再加密一档（每格仍 >= 60 半分辨率像素）。"""
import io

P = r'F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts'

SUBS = [
    ("const CARD_ROWS: readonly number[] = [12, 9, 13, 9, 8, 8];",
     "const CARD_ROWS: readonly number[] = [14, 11, 15, 11, 10, 10];"),
    ("this.areaGrid(ui, r.x + 7, r.y + 9, r.w - 14, r.h - 18, 28, rows, '#241F18', 15, 232);",
     "this.areaGrid(ui, r.x + 7, r.y + 9, r.w - 14, r.h - 18, 34, rows, '#241F18', 16, 232);"),
    ("selected ? '#1D1509' : '#171C22', 5, 10, selected ? 244 : 214);",
     "selected ? '#1D1509' : '#171C22', 6, 12, selected ? 244 : 214);"),
    ("this.cellGrid(g, x, y, CELL_W, CELL_H, top, bottom, 8, 10, isLocked ? 170 : selected ? 244 : 214);",
     "this.cellGrid(g, x, y, CELL_W, CELL_H, top, bottom, 10, 12, isLocked ? 170 : selected ? 244 : 214);"),
    ("        8, 8, selected ? 244 : 214,", "        10, 9, selected ? 244 : 214,"),
    ("this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 12, 6, 246);",
     "this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 14, 7, 246);"),
    ("this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 12, 6, 255);",
     "this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 14, 7, 255);"),
    ("this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 24, 3, 240);",
     "this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 30, 3, 240);"),
]


def main():
    s = io.open(P, encoding='utf-8').read()
    for old, new in SUBS:
        n = s.count(old)
        print(('MISS(%d) ' % n if n != 1 else 'ok  ') + old[:56])
        if n == 1:
            s = s.replace(old, new)
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)


main()
