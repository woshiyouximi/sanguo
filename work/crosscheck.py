# -*- coding: utf-8 -*-
"""交叉校验：MAGIC 目录↔技名、TIMES 旗号、阵营配色、SHOR 尺寸、通配符匹配数。"""
import sys, os, re, json, collections
sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini as P

PAK = r'F:\sanguo\extract\pak'
SHAPE = os.path.join(PAK, 'SHAPE')
d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
objs = d['objects']

# ---------- 1. MAGIC 目录 ↔ 技名 ----------
m = json.load(open(r'F:\sanguo\extract\json\magic.json', encoding='utf-8'))
magic_names = {e['name']: (e['sequence'], e['script']) for e in m['entries'] if e['kind'] == 'magic'}
dirs = collections.defaultdict(list)
for o in objs:
    dd = (o['directory'] or '').strip('\\')
    if dd.upper().startswith('MAGIC'):
        dirs[dd.split('\\')[-1]].append(o['name'])
print('=== MAGIC 目录 %d 个，对象 %d 个 ===' % (len(dirs), sum(len(v) for v in dirs.values())))
hit = 0
for k in sorted(dirs, key=lambda x: int(x)):
    names = dirs[k]
    matched = [n for n in names if n in magic_names]
    hit += len(matched)
    print('   %s n=%-2d 技名命中=%-2d 名称例=%s' % (k, len(names), len(matched), '、'.join(names[:3])))
print('   技名直接命中合计 %d / %d' % (hit, sum(len(v) for v in dirs.values())))

# ---------- 2. TIMES 旗号 ----------
print('\n=== TIMES1-5 势力 FLAGNUM ===')
king_all = {}
for i in range(1, 6):
    ini = P.IniFile.load(os.path.join(PAK, f'TIMES{i}.INI'))
    ks = ini.all('KING')
    rows = [(s.get('NAME'), s.num('FLAGNUM')) for s in ks]
    king_all[i] = rows
    print('   TIMES%d  KING=%d  FLAGNUM=%s' % (i, len(rows), [f for _, f in rows]))
names = collections.Counter()
for i, rows in king_all.items():
    for n, f in rows:
        names[n] += 1
print('   势力名去重 %d 个；出现 5 次的=%s' % (len(names), [n for n, c in names.items() if c == 5][:8]))
print('   示例 TIMES1 前 6:', king_all[1][:6])

# ---------- 3. 阵营配色（用已导出的 PNG 验证 M/N、L/R）----------
try:
    from PIL import Image
    def mean_rgb(path):
        im = Image.open(path).convert('RGBA')
        px = im.load()
        w, h = im.size
        r = g = b = n = 0
        for y in range(0, h, max(1, h // 40)):
            for x in range(0, w, max(1, w // 40)):
                p = px[x, y]
                if p[3] > 128:
                    r += p[0]; g += p[1]; b += p[2]; n += 1
        return (r // max(1, n), g // max(1, n), b // max(1, n), n) if n else (0, 0, 0, 0)
    print('\n=== 阵营配色（不透明像素均值 RGB）===')
    pairs = [
        ('FORCE\\MAW10001', 'FORCE\\NAW10001'),
        ('MAJOR\\BODY\\L1W10001', 'MAJOR\\BODY\\R1W10001'),
        ('FORCE\\MAHA0001', 'FORCE\\NAHA0001'),
    ]
    for a, b in pairs:
        pa = os.path.join(r'F:\sanguo\export\png', a + '.png')
        pb = os.path.join(r'F:\sanguo\export\png', b + '.png')
        print('   %-22s %s   vs  %-22s %s' % (os.path.basename(a), mean_rgb(pa), os.path.basename(b), mean_rgb(pb)))
except Exception as e:
    print('  [color check skipped]', e)

# ---------- 4. SHOR / 死馬 尺寸 ----------
print('\n=== SH* 文件头 ===')
import struct
for name in ('FORCE\\SH010001.SHP', 'FORCE\\SHOR0001.SHP', 'FORCE\\MAW10001.SHP',
             'TROOP\\FLAG0101.SHP', 'TROOP\\SOL10001.SHP',
             'FACE\\FACE001.SHP', 'MAJOR\\BODY\\L1W10001.SHP', 'MAJOR\\HORSE\\HAW10001.SHP'):
    p = os.path.join(SHAPE, name)
    with open(p, 'rb') as f:
        hd = f.read(0x24)
    w, h = struct.unpack_from('<II', hd, 0x14)
    key = struct.unpack_from('<I', hd, 0x10)[0]
    ox, oy = struct.unpack_from('<ii', hd, 0x1C)
    print('   %-26s %4dx%-4d key=0x%04X off=(%d,%d) bytes=%d' % (
        name, w, h, key, ox, oy, os.path.getsize(p)))

# ---------- 5. 通配符匹配计数 ----------
allfiles = []
for root, ds, fs in os.walk(SHAPE):
    for fn in fs:
        allfiles.append(os.path.relpath(os.path.join(root, fn), SHAPE).upper().replace('/', '\\'))
print('\n=== 通配符匹配数（* 形式）===')
pats = ['FORCE\\MA*', 'FORCE\\MB*', 'FORCE\\MAW1*', 'FORCE\\MAH*', 'FORCE\\SH*',
        'MAJOR\\BODY\\L1*', 'MAJOR\\BODY\\L1W1*', 'MAJOR\\BODY\\L5S1*', 'MAJOR\\BODY\\*S1*',
        'MAJOR\\WEAPON\\A1*', 'MAJOR\\WEAPON\\B2*', 'MAJOR\\HORSE\\HA*',
        'TROOP\\FLAG*', 'TROOP\\SOL1*', 'MAGIC\\013\\*', 'MAGIC\\038\\*',
        'FACE\\FACE0*', 'MAP\\*', 'BG\\*']
import fnmatch
for p in pats:
    n = sum(1 for f in allfiles if fnmatch.fnmatchcase(f, p))
    print('   %-26s → %d 个文件' % (p, n))
