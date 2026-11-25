#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""一次性把 DeployRoot.ts 里各元素的二维色域密度调细（每格 1 个 8bit 单位差，肉眼看是平滑渐变）。"""
import io

P = r'F:\sanguo\game\cocos\assets\scripts\DeployRoot.ts'

SUBS = [
    ("this.cellGrid(g, x, y, GEN_W, GEN_H, selected ? '#4A3A20' : '#22282F', selected ? '#1D1509' : '#171C22', 3, 2, selected ? 244 : 214);",
     "this.cellGrid(g, x, y, GEN_W, GEN_H, selected ? '#4A3A20' : '#22282F', selected ? '#1D1509' : '#171C22', 5, 10, selected ? 244 : 214);"),
    ("this.cellGrid(g, x, y, CELL_W, CELL_H, top, bottom, 4, 3, isLocked ? 170 : selected ? 244 : 214);",
     "this.cellGrid(g, x, y, CELL_W, CELL_H, top, bottom, 8, 10, isLocked ? 170 : selected ? 244 : 214);"),
    ("        3, 2, selected ? 244 : 214,",
     "        8, 8, selected ? 244 : 214,"),
    ("this.paintBands(base, lightGrid({ x: 0, y: 0, w: DESIGN_W, h: 124 }, 18, 5, '#2A241C', 20, -14, 214));",
     "this.areaGrid(base, 0, 0, DESIGN_W, 124, 30, 8, '#2A241C', 14, 214);"),
    ("this.paintBands(base, lightGrid({ x: 0, y: 1194, w: DESIGN_W, h: 140 }, 18, 4, '#2B2D2B', 18, -12, 236));",
     "this.areaGrid(base, 0, 1194, DESIGN_W, 140, 30, 9, '#2B2D2B', 12, 236);"),
    ("this.paintBands(ui, lightGrid({ x: 24, y: 150, w: 120, h: 150 }, 4, 4, '#221B12', 16, -13, 250));",
     "this.areaGrid(ui, 24, 150, 120, 150, 5, 11, '#221B12', 13, 250);"),
    ("this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 10, 3, 246);",
     "this.cellGrid(g, back.x, back.y, back.w, back.h, '#232B35', '#10151C', 12, 6, 246);"),
    ("this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 10, 3, 255);",
     "this.cellGrid(g, go.x, go.y, go.w, go.h, '#4E3D21', '#1D1509', 12, 6, 255);"),
    ("this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 12, 2, 240);",
     "this.cellGrid(g, 24, QUEUE_Y, 678, 36, '#232B35', '#10151C', 24, 3, 240);"),
    ("this.paintBands(g, lightGrid({ x: px, y: py, w: pw, h: ph }, 18, 10, '#1C232C', 18, -14, 255));",
     "this.areaGrid(g, px, py, pw, ph, 24, 22, '#1C232C', 14, 255);"),
    ("this.paintBands(g, lightGrid({ x: px + 12, y: rowY - 6, w: pw - 24, h: rowH - 8 }, 14, 3, onField ? '#221E17' : '#191B1F', 16, -12, 190));",
     "this.areaGrid(g, px + 12, rowY - 6, pw - 24, rowH - 8, 24, 4, onField ? '#221E17' : '#191B1F', 12, 190);"),
]


def main():
    s = io.open(P, encoding='utf-8').read()
    for old, new in SUBS:
        n = s.count(old)
        if n != 1:
            print('MISS(%d) %s' % (n, old[:60]))
            continue
        s = s.replace(old, new)
        print('ok   %s' % old[:50])
    io.open(P, 'w', encoding='utf-8', newline='\n').write(s)
    print('lightGrid refs left:', s.count('lightGrid('))


main()
