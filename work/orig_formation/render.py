# -*- coding: utf-8 -*-
"""Render original (from formations.json) and our (from ours_units.json) opening layouts.
ASCII only. Writes .txt maps + metrics into work/orig_formation/.
"""
import json, io, os

ROOT = r'F:\sanguo'
OUT = os.path.join(ROOT, 'work', 'orig_formation')
form = json.load(open(os.path.join(ROOT, 'game', 'data', 'formations.json'), encoding='utf-8'))
ours = json.load(open(os.path.join(OUT, 'ours_units.json'), encoding='utf-8'))
slots = form['slots']
GRID_W, GRID_H = 71, 14
NAMES = ['fang(0)', 'yuan(1)', 'zhui(2)', 'yan(3)', 'xuanxiang(4)', 'yuli(5)',
         'gou(6)', 'chongfu(7)', 'jianshi(8)', 'luanextra(9)', 'special(10)']


def k_of_mode(s, N):
    """infantry split: k_m = w_m*N//200, mode1 takes remainder (04b1 2.4)."""
    w = {int(k): v for k, v in s['weights'].items()}
    ks = {}
    for m in (2, 3, 4, 5):
        if str(m) in s['modes']:
            ks[m] = w[m] * N // 200
    if '1' in s['modes']:
        ks[1] = N - sum(ks.values())
    return ks


def orig_cells(f, N, side):
    s = slots[f]
    shift = (200 - N) // 25
    anchor = s['anchorX']
    ks = k_of_mode(s, N)
    cells = []
    for m in (1, 2, 3, 4, 5):
        arr = s['modes'].get(str(m))
        if not arr:
            continue
        for (x, y) in arr[:ks.get(m, 0)]:
            gx = x + anchor + shift
            cells.append((GRID_W - gx if side == 'A' else gx, y, m))
    gen = (GRID_W - (anchor + shift)) if side == 'A' else (anchor + shift)
    return cells, (gen, 6)


def render(rows, title, extra=''):
    """rows: dict[(x,y)] = char"""
    buf = io.StringIO()
    buf.write(title + '\n')
    buf.write('    ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(GRID_W)) + '\n')
    buf.write('    ' + ''.join(str(x % 10) for x in range(GRID_W)) + '\n')
    for y in range(GRID_H):
        line = ''.join(rows.get((x, y), '.') for x in range(GRID_W))
        buf.write('%2d  %s\n' % (y, line))
    buf.write('    ' + ''.join(str((x // 10) % 10) if x % 10 == 0 else ' ' for x in range(GRID_W)) + '\n')
    if extra:
        buf.write(extra + '\n')
    buf.write('\n')
    return buf.getvalue()


def build_orig(f, N):
    rows = {}
    bc, bg = orig_cells(f, N, 'B')
    ac, ag = orig_cells(f, N, 'A')
    for (x, y, m) in bc:
        rows[(x, y)] = 'o'
    for (x, y, m) in ac:
        rows[(x, y)] = 'x'
    rows[bg] = 'B'
    rows[ag] = 'A'
    return rows, bc, ac, bg, ag


def metrics(bc, ac, bg, ag):
    bx = [c[0] for c in bc]
    ax = [c[0] for c in ac]
    best = None
    for (x1, y1, *_) in ac:
        for (x2, y2, *_) in bc:
            d = abs(x1 - x2) + abs(y1 - y2)
            if best is None or d < best[0]:
                best = (d, (x1, y1), (x2, y2))
    return dict(bmin=min(bx), bmax=max(bx), amin=min(ax), amax=max(ax),
                gap=min(ax) - max(bx), nearest=best, bgen=bg, agen=ag)


# ---------- original: all 9 formations, N=100 ----------
txt = io.StringIO()
txt.write('ORIGINAL open-field deployment, rendered from game/data/formations.json\n')
txt.write('grid 71x14 (x=0..70 left->right, y=0..13).  B side = left (o, general B); A side = right (x, general A)\n')
txt.write('formula (04b1 / 0x442CB6): gx = tableX + anchorX + (200-N)//25 ; A side gx = 71 - gx\n')
txt.write('N = 100 (our battle.ts default soldiers). nominal, before the 0x43AF7A occupancy nudge.\n\n')
for f in range(9):
    rows, bc, ac, bg, ag = build_orig(f, 100)
    m = metrics(bc, ac, bg, ag)
    extra = ('f=%d %s anchor=%d  B x %d..%d  A x %d..%d  empty cols between = %d  '
             'nearest Manhattan=%d %s  genB=%s genA=%s'
             % (f, NAMES[f], slots[f]['anchorX'], m['bmin'], m['bmax'], m['amin'], m['amax'],
                m['gap'], m['nearest'][0], (m['nearest'][1], m['nearest'][2]), bg, ag))
    txt.write(render(rows, '=== ORIGINAL f=%d %s  N=100 ===' % (f, NAMES[f]), extra))
open(os.path.join(OUT, 'orig_all_N100.txt'), 'w', encoding='utf-8').write(txt.getvalue())

# ---------- original: square / circle / spear at N=200 ----------
txt = io.StringIO()
txt.write('ORIGINAL N=200 (troop cap). Same legend as orig_all_N100.txt\n\n')
for f in (0, 1, 2):
    rows, bc, ac, bg, ag = build_orig(f, 200)
    m = metrics(bc, ac, bg, ag)
    extra = ('f=%d %s anchor=%d  B x %d..%d  A x %d..%d  empty cols between = %d  '
             'nearest Manhattan=%d %s  genB=%s genA=%s'
             % (f, NAMES[f], slots[f]['anchorX'], m['bmin'], m['bmax'], m['amin'], m['amax'],
                m['gap'], m['nearest'][0], (m['nearest'][1], m['nearest'][2]), bg, ag))
    txt.write(render(rows, '=== ORIGINAL f=%d %s  N=200 ===' % (f, NAMES[f]), extra))
open(os.path.join(OUT, 'orig_3form_N200.txt'), 'w', encoding='utf-8').write(txt.getvalue())

# ---------- metrics table for original ----------
txt = io.StringIO()
txt.write('ORIGINAL deployment metrics (nominal, no occupancy nudge)\n')
txt.write('%-4s %-12s %-6s %-9s %-9s %-6s %-10s %-22s %-8s %-8s\n'
          % ('f', 'name', 'anchor', 'B x', 'A x', 'gap', 'nearest d', 'pair(A,B)', 'genB', 'genA'))
for N in (100, 200):
    for f in range(9):
        rows, bc, ac, bg, ag = build_orig(f, N)
        m = metrics(bc, ac, bg, ag)
        txt.write('N=%d %-3d %-12s %-6d %3d..%-3d %3d..%-3d %-6d %-10d %-22s %-8s %-8s\n'
                  % (N, f, NAMES[f], slots[f]['anchorX'], m['bmin'], m['bmax'], m['amin'], m['amax'],
                     m['gap'], m['nearest'][0], str((m['nearest'][1], m['nearest'][2])), bg, ag))
open(os.path.join(OUT, 'orig_metrics.txt'), 'w', encoding='utf-8').write(txt.getvalue())

# ---------- our layouts ----------
txt = io.StringIO()
txt.write('OURS: createWorld() initial cells, dumped by probe_ours.ts (read-only probe).\n')
txt.write('legend: o = B soldier, B = B general, x = A soldier, A = A general, . = empty\n')
txt.write('(kind=infantry drawn as o/x; cavalry would be printed as O/X in the cav case)\n\n')
for name in ('default', 'sq_sq_100', 'sq_sq_200', 'yuli', 'jianshi', 'sq_vs_sq_cav'):
    w = ours['worlds'][name]
    rows = {}
    for (x, y, g, kind) in w['B']:
        rows[(x, y)] = 'B' if g else ('O' if kind == 'cavalry' else 'o')
    for (x, y, g, kind) in w['A']:
        rows[(x, y)] = 'A' if g else ('X' if kind == 'cavalry' else 'x')
    bx = [u[0] for u in w['B']]
    ax = [u[0] for u in w['A']]
    bg = [u for u in w['B'] if u[2]][0]
    ag = [u for u in w['A'] if u[2]][0]
    bc = [(u[0], u[1]) for u in w['B'] if not u[2]]
    ac = [(u[0], u[1]) for u in w['A'] if not u[2]]
    best = None
    for (x1, y1) in ac + [(ag[0], ag[1])]:
        for (x2, y2) in bc:
            d = abs(x1 - x2) + abs(y1 - y2)
            if best is None or d < best[0]:
                best = (d, (x1, y1), (x2, y2))
    extra = ('world=%s  B x %d..%d (gen %s)  A x %d..%d (gen %s)  empty cols between=%d  '
             'nearest soldier-soldier Manhattan=%d %s' %
             (name, min(bx), max(bx), (bg[0], bg[1]), min(ax), max(ax), (ag[0], ag[1]),
              min(ax) - max(bx), best[0], (best[1], best[2])))
    txt.write(render(rows, '=== OURS %s ===' % name, extra))
open(os.path.join(OUT, 'ours_initial.txt'), 'w', encoding='utf-8').write(txt.getvalue())
print('done')
