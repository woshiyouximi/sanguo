# -*- coding: utf-8 -*-
"""生成方陣/錐形 N=100 的竖屏落位 ASCII 示意（行 = 格X 从下到上，列 = 格Y 从左到右）。"""
import io
import sys

sys.path.insert(0, r'F:\sanguo\work')
from slotsA import build, parse, FANG_M1, FANG_M2, ZHUI_M1, ZHUI_M2, screen  # noqa

def grid(name, modes, anchor):
    slots = build(modes, anchor)
    gx0 = min(p[0] for p in slots); gx1 = max(p[0] for p in slots)
    gy0 = min(p[1] for p in slots); gy1 = max(p[1] for p in slots)
    camx = gx0 * 96
    cells = {}
    for gx, gy in slots:
        cells[(gx, gy)] = cells.get((gx, gy), 0) + 1
    lines = []
    lines.append('  格Y→  ' + ''.join('%2d' % y for y in range(gy0, gy1 + 1)))
    for gx in range(gx1, gx0 - 1, -1):
        row = ''
        for gy in range(gy0, gy1 + 1):
            row += ' ■' if (gx, gy) in cells else ' ·'
        sy = screen(gx, gy0, camx)[1]
        lines.append('  X=%2d  %s   y=%4.0f' % (gx, row, sy))
    out = ['== %s N=100 竖屏落位（■ = 一格一兵，· = 空）==' % name]
    out += lines
    out.append('  camX=%d  屏上 y: 队尾 %.1f / 队尖 %.1f' %
               (camx, screen(gx0, gy0, camx)[1], screen(gx1, gy0, camx)[1]))
    return '\n'.join(out)

txt = '\n\n'.join([
    grid('方陣 a=0', [(140, parse(FANG_M1), 70), (60, parse(FANG_M2), 30)], 9),
    grid('錐形 a=2', [(150, parse(ZHUI_M1), 75), (50, parse(ZHUI_M2), 25)], 8),
])
io.open(r'F:\sanguo\work\gridA.txt', 'w', encoding='utf-8', newline='\n').write(txt)
print(txt)
