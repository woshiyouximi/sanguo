import json, io

ROOT = r'F:\sanguo'
F = json.load(open(ROOT + r'\game\data\formations.json', encoding='utf-8'))
O = json.load(open(ROOT + r'\work\orig_formation\ours_units.json', encoding='utf-8'))
GW, GH = 71, 14
NAMES = ['FANG', 'YUAN', 'ZHUI', 'YAN', 'XUANXIANG', 'YULI', 'GOU', 'CHONGFENG', 'JIANSHI']


def orig_cells(f, N):
    s = F['slots'][f]
    ent = s['fill'][str(N)]
    sh = (200 - N) // 25
    return [(e['x'] + s['anchorX'] + sh, e['y'], e['mode']) for e in ent]


def side(cells, s):
    if s == 'B':
        return [(x, y) for x, y, m in cells]
    return [(71 - x, y) for x, y, m in cells]


def gen(f, N, s):
    sh = (200 - N) // 25
    gx = F['slots'][f]['anchorX'] + sh
    return (gx if s == 'B' else 71 - gx, 6)


def grid(cells, general, ch, gench, ch2, gench2):
    g = [['.'] * GW for _ in range(GH)]
    half = None
    for i, (x, y) in enumerate(cells):
        if 0 <= x < GW and 0 <= y < GH:
            g[y][x] = ch if (half is None or i < half) else ch2
    gx, gy = general
    if 0 <= gx < GW and 0 <= gy < GH:
        g[gy][gx] = gench
    return [''.join(r) for r in g]


def mindist(A, B):
    best = (10 ** 9, None, None)
    for ax, ay in A:
        for bx, by in B:
            d = abs(ax - bx) + abs(ay - by)
            if d < best[0]:
                best = (d, (ax, ay), (bx, by))
    return best


def rng(cells):
    cells = list(cells)
    xs = [x for x, y in cells]
    ys = [y for x, y in cells]
    return min(xs), max(xs), min(ys), max(ys)


out = io.open(ROOT + r'\work\orig_formation\compare_N100.txt', 'w', encoding='utf-8')
out.write('ORIGINAL = formations.json fill[100] + anchorX + (200-100)/25=4 ; A side x=71-gx (EXE 0x442D1B)\n')
out.write('OURS     = game/src/core/battle.ts createWorld probe (ours_units.json) ; A side x=71-1-gx (battle.ts:689)\n')
out.write('legend   = b/B B-side soldier/general, a/A A-side soldier/general\n\n')

for f in range(9):
    oc = orig_cells(f, 100)
    ob, oa = side(oc, 'B'), side(oc, 'A')
    mb = [tuple(p) for p in O['cells']['%d:100:B' % f]]
    ma = [tuple(p) for p in O['cells']['%d:100:A' % f]]
    db = len(set(ob) ^ set(mb))
    da = len(set(oa) ^ set(ma))
    do, pa, pb = mindist(ob, oa)
    dm, qa, qb = mindist(mb, ma)
    out.write('%-10s B orig%s ours%s diff=%d | A orig%s ours%s diff=%d\n' % (
        NAMES[f], rng(ob), rng(mb), db, rng(oa), rng(ma), da))
    out.write('           nearest orig=%d %s-%s  ours=%d %s-%s | gen orig B%s A%s ours B%s A%s\n' % (
        do, pa, pb, dm, qa, qb, gen(f, 100, 'B'), gen(f, 100, 'A'),
        (min(x for x, y in mb) - 2, 6), (max(x for x, y in ma) + 2, 6)))

out.write('\n')
for f in (0, 2, 8):
    oc = orig_cells(f, 100)
    ob, oa = side(oc, 'B'), side(oc, 'A')
    gb, ga = gen(f, 100, 'B'), gen(f, 100, 'A')
    og = grid(ob, gb, 'b', 'B', 'b', 'B')
    og = [list(r) for r in og]
    for x, y in oa:
        og[y][x] = 'a'
    og[ga[1]][ga[0]] = 'A'
    og = [''.join(r) for r in og]

    mb = [tuple(p) for p in O['cells']['%d:100:B' % f]]
    ma = [tuple(p) for p in O['cells']['%d:100:A' % f]]
    mgb = (min(x for x, y in mb) - 2, 6)
    mga = (max(x for x, y in ma) + 2, 6)
    mg = [list(r) for r in grid(mb, mgb, 'b', 'B', 'b', 'B')]
    for x, y in ma:
        mg[y][x] = 'a'
    mg[mga[1]][mga[0]] = 'A'
    mg = [''.join(r) for r in mg]

    hdr = '     ' + ''.join(str(x // 10) for x in range(GW)) + '\n' + \
          '     ' + ''.join(str(x % 10) for x in range(GW)) + '\n'
    out.write('===== %s  N=100  ORIGINAL =====\n' % NAMES[f])
    out.write(hdr)
    for y in range(GH):
        out.write('%3d  %s\n' % (y, og[y]))
    out.write('===== %s  N=100  OURS (createWorld) =====\n' % NAMES[f])
    out.write(hdr)
    for y in range(GH):
        out.write('%3d  %s\n' % (y, mg[y]))
    out.write('\n')
out.close()

c = io.open(ROOT + r'\work\orig_formation\coords3.txt', 'w', encoding='utf-8')
for N in (100, 200):
    for f in (0, 1, 2, 8):
        s = F['slots'][f]
        oc = orig_cells(f, N)
        ob, oa = side(oc, 'B'), side(oc, 'A')
        c.write('== %s N=%d anchorX=%d shift=%d ==\n' % (NAMES[f], N, s['anchorX'], (200 - N) // 25))
        c.write('   B general %s ; A general %s\n' % (gen(f, N, 'B'), gen(f, N, 'A')))
        for side_name, cells in (('B', ob), ('A', oa)):
            c.write('   side %s rows:\n' % side_name)
            for y in range(GH):
                xs = sorted(x for x, yy in cells if yy == y)
                if xs:
                    c.write('     y=%2d n=%2d x=%s\n' % (y, len(xs), ','.join(map(str, xs))))
        cnt = {}
        for x, y, m in oc:
            cnt[m] = cnt.get(m, 0) + 1
        d, pa, pb = mindist(ob, oa)
        c.write('   mode counts %s ; nearest %d %s-%s\n\n' % (cnt, d, pa, pb))
c.close()
print('ok')
