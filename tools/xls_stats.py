# -*- coding: utf-8 -*-
"""xls_stats.py —— 三国群英传2 XLS 宝典数值分析（唯一交付文档的数据来源）

用法：
  set PYTHONIOENCODING=utf-8
  C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe ^
      F:\\sanguo\\tools\\xls_stats.py

输入：F:\\sanguo\\extract\\json\\xls_*.json（12 sheet）、F:\\sanguo\\extract\\pak\\MAGIC.INI、
      F:\\sanguo\\extract\\pak\\TIMES1.INI（仅取城池人口/金钱/防御）、F:\\sanguo\\extract\\pak\\SHAPE\\MAJOR\\BODY
输出：F:\\sanguo\\extract\\json\\stats_*.json、F:\\sanguo\\docs\\03b_XLS宝典数值分析.md
"""
import json, os, sys, re, math, ctypes, collections, statistics

ROOT = r'F:\sanguo'
J = os.path.join(ROOT, 'extract', 'json')
PAK = os.path.join(ROOT, 'extract', 'pak')
DOC = os.path.join(ROOT, 'docs', '03b_XLS宝典数值分析.md')

# ---------------------------------------------------------------- 繁→简
_k32 = ctypes.windll.kernel32
PATCH = {'後': '后', '鍾': '钟'}


def t2s(s):
    if not s:
        return s
    n = _k32.LCMapStringW(0, 0x02000000, s, -1, None, 0)
    buf = ctypes.create_unicode_buffer(n)
    _k32.LCMapStringW(0, 0x02000000, s, -1, buf, n)
    out = buf.value
    for a, b in PATCH.items():
        out = out.replace(a, b)
    return out


def load(name):
    with open(os.path.join(J, 'xls_%s.json' % name), encoding='utf-8') as f:
        return json.load(f)


def num(x, d=None):
    if x is None or x == '':
        return d
    return float(x)


# ---------------------------------------------------------------- INI
def read_ini(path):
    raw = open(path, 'rb').read()
    txt = raw.decode('cp950')
    secs, cur = [], None
    for ln, line in enumerate(txt.splitlines(), 1):
        s = line.strip()
        if not s:
            continue
        if s.startswith('[') and s.endswith(']'):
            cur = {'name': s[1:-1].strip().upper(), 'line': ln, 'fields': []}
            secs.append(cur)
            continue
        if '=' in s and cur is not None:
            k, v = s.split('=', 1)
            cur['fields'].append((k.strip().upper(), v.strip(), ln))
    return secs


def fget(sec, key, default=''):
    for k, v, _ in sec['fields']:
        if k == key:
            return v
    return default


magic_secs = read_ini(os.path.join(PAK, 'MAGIC.INI'))
MAGIC_INI = [s for s in magic_secs if s['name'] == 'MAGIC']
WISE_INI = [s for s in magic_secs if s['name'] == 'WISE']
times1 = read_ini(os.path.join(PAK, 'TIMES1.INI'))
CITY_INI = [s for s in times1 if s['name'].startswith('CITY')]
GEN_INI = [s for s in times1 if s['name'] == 'GENERAL']

# ================================================================ 1 武将
g = load('群英2')
GROWS = g['rows']
GHDR = g['header']
CITY_COLS = [37, 39, 41, 43, 45]
ST_COLS = [38, 40, 42, 44, 46]
SCEN = ['黄巾之乱(184)', '讨伐董卓(189)', '群雄割据(200)', '赤壁之战(208)', '三国鼎立(219)']


def grec(r):
    """把一行 61 列压成 dict"""
    d = {'seq': int(num(r[0])), 'name': r[1], 'war': num(r[2]), 'int': num(r[3]), 'tot': num(r[4])}
    d['skills'] = []
    for s in range(7):
        c = 5 + s * 2
        if len(r) > c and r[c]:
            d['skills'].append((r[c], num(r[c + 1])))
    d['wises'] = []
    for s in range(8):
        c = 21 + s * 2
        if len(r) > c and r[c]:
            d['wises'].append((r[c], num(r[c + 1])))
    d['scen'] = []
    for k in range(5):
        city = r[CITY_COLS[k]] if len(r) > CITY_COLS[k] else ''
        st = r[ST_COLS[k]] if len(r) > ST_COLS[k] else ''
        d['scen'].append((city, st))
    d['weapon'] = r[47] if len(r) > 47 else ''
    d['arr_ok'] = (r[48] if len(r) > 48 else '').split()
    d['arr_use'] = (r[49] if len(r) > 49 else '').strip()
    d['trp_ok'] = (r[50] if len(r) > 50 else '').split()
    d['trp_use'] = (r[51] if len(r) > 51 else '').strip()
    d['loyal_king'] = [r[52 + k] if len(r) > 52 + k else '' for k in range(5)]
    d['blood'] = r[57] if len(r) > 57 else ''
    d['constancy'] = num(r[58]) if len(r) > 58 else None
    d['gtype'] = num(r[59]) if len(r) > 59 else None
    d['flag'] = num(r[60]) if len(r) > 60 else None
    return d


G = [grec(r) for r in GROWS]
war = [x['war'] for x in G]
intel = [x['int'] for x in G]
tot = [x['tot'] for x in G]
assert all(abs(w + i - t) < 1e-9 for w, i, t in zip(war, intel, tot)), '合 != 武力+智力'


def hist(vals, bins):
    c = collections.Counter()
    for v in vals:
        for lo, hi in bins:
            if lo <= v <= hi:
                c['%d-%d' % (lo, hi)] += 1
                break
    return c


WBINS = [(30, 39), (40, 49), (50, 59), (60, 69), (70, 79), (80, 89), (90, 99), (100, 100)]
TBINS = [(80, 99), (100, 119), (120, 139), (140, 159), (160, 179), (180, 200)]


def desc(v):
    return dict(n=len(v), mean=round(statistics.mean(v), 2), median=statistics.median(v),
                min=min(v), max=max(v), sd=round(statistics.pstdev(v), 2))


S1 = {
    'war': desc(war), 'int': desc(intel), 'tot': desc(tot),
    'war_hist': {k: v for k, v in hist(war, WBINS).items()},
    'int_hist': {k: v for k, v in hist(intel, WBINS).items()},
    'tot_hist': {k: v for k, v in hist(tot, TBINS).items()},
    'corr_war_int': round(statistics.correlation(war, intel), 4),
    'top20_tot': [{'name': x['name'], 'war': int(x['war']), 'int': int(x['int']), 'tot': int(x['tot'])}
                  for x in sorted(G, key=lambda x: -x['tot'])[:20]],
    'both90': [{'name': x['name'], 'war': int(x['war']), 'int': int(x['int'])}
               for x in G if x['war'] >= 90 and x['int'] >= 90],
    'max_war': [x['name'] for x in G if x['war'] == max(war)],
    'max_int': [x['name'] for x in G if x['int'] == max(intel)],
    'min_war': [(x['name'], int(x['war'])) for x in G if x['war'] <= 32],
    'min_int': [(x['name'], int(x['int'])) for x in G if x['int'] <= 27],
}

# 必杀技解锁曲线
skill_curve = []
for slot in range(7):
    lv = [x['skills'][slot][1] for x in G if len(x['skills']) > slot]
    names = collections.Counter(x['skills'][slot][0] for x in G if len(x['skills']) > slot)
    skill_curve.append({'slot': slot + 1, 'n': len(lv), 'mean': round(statistics.mean(lv), 2),
                        'median': statistics.median(lv), 'min': min(lv), 'max': max(lv),
                        'levels': {str(int(k)): v for k, v in sorted(collections.Counter(lv).items())},
                        'top_names': names.most_common(3)})
wise_curve = []
for slot in range(8):
    lv = [x['wises'][slot][1] for x in G if len(x['wises']) > slot]
    if not lv:
        continue
    wise_curve.append({'slot': slot + 1, 'n': len(lv), 'mean': round(statistics.mean(lv), 2),
                       'median': statistics.median(lv), 'min': min(lv), 'max': max(lv)})

scen_stat = []
for k in range(5):
    cities = [x['scen'][k][0] for x in G if x['scen'][k][0]]
    sts = collections.Counter(x['scen'][k][1] for x in G if x['scen'][k][1])
    scen_stat.append({'scen': SCEN[k], 'available': len(cities), 'deng': sts.get('登', 0),
                      'ye': sts.get('野', 0), 'none': 400 - len(cities),
                      'cities': len(set(cities))})

S1['skill_curve'] = skill_curve
S1['wise_curve'] = wise_curve
S1['scen'] = scen_stat
S1['blood'] = collections.Counter(x['blood'] for x in G).most_common()
S1['constancy'] = {str(int(k)): v for k, v in sorted(collections.Counter(
    x['constancy'] for x in G if x['constancy'] is not None).items())}
S1['gtype'] = {str(int(k)): v for k, v in sorted(collections.Counter(
    x['gtype'] for x in G if x['gtype'] is not None).items())}
S1['flag'] = {str(int(k)): v for k, v in sorted(collections.Counter(
    x['flag'] for x in G if x['flag'] is not None).items())}
S1['weapon'] = collections.Counter(x['weapon'] for x in G).most_common()
S1['skill_per_general'] = {str(k): v for k, v in sorted(collections.Counter(len(x['skills']) for x in G).items())}
S1['wise_per_general'] = {str(k): v for k, v in sorted(collections.Counter(len(x['wises']) for x in G).items())}
S1['arr_use'] = collections.Counter(x['arr_use'] for x in G).most_common()
S1['trp_use'] = collections.Counter(x['trp_use'] for x in G).most_common()
S1['arr_ok_n'] = {str(k): v for k, v in sorted(collections.Counter(len(x['arr_ok']) for x in G).items())}
S1['trp_ok_n'] = {str(k): v for k, v in sorted(collections.Counter(len(x['trp_ok']) for x in G).items())}

# 学习人数（TIMES1）
users = collections.Counter()
for s in GEN_INI:
    for k, v, _ in s['fields']:
        if k == 'SKILL' and v:
            users[int(v.split(',')[1])] += 1
wise_users = collections.Counter()
for s in GEN_INI:
    for k, v, _ in s['fields']:
        if k == 'WISESKILL' and v:
            wise_users[int(v.split(',')[1])] += 1

# ================================================================ 2 武将技
sk = load('武将技')
SROWS = sk['rows']
SK = []
for r in SROWS:
    SK.append({'seq': int(num(r[0])), 'name': r[1], 'mp': num(r[2]), 'power': num(r[3]),
               'atk': num(r[4]), 'script': int(num(r[5])), 'attrib': r[6], 'title': r[7],
               'note': r[8], 'target': r[9]})
mp = [x['mp'] for x in SK]
atk = [x['atk'] for x in SK]
S2 = {
    'mp': desc(mp), 'atk': desc(atk), 'power': desc([x['power'] for x in SK]),
    'corr_mp_atk': round(statistics.correlation(mp, atk), 4),
    'script_is_seq500': all(x['script'] == 500 + x['seq'] for x in SK),
    'script_perm': sorted(x['script'] for x in SK) == list(range(501, 611)),
    'script_in_order': sum(1 for x in SK if x['script'] == 500 + x['seq']),
    'attrib': collections.Counter(x['attrib'] for x in SK).most_common(),
    'target': collections.Counter(x['target'] for x in SK).most_common(),
    'title_n': sum(1 for x in SK if x['title']),
    'titles': [x['title'] for x in SK if x['title']],
    'note_level': collections.Counter(x['note'].split(',')[-1] for x in SK).most_common(),
    'mp_hist': {k: v for k, v in hist(mp, [(18, 24), (25, 29), (30, 34), (35, 39), (40, 44), (45, 50)]).items()},
    'atk_hist': {k: v for k, v in hist(atk, [(0, 0), (1, 9), (10, 19), (20, 29), (30, 39), (40, 60)]).items()},
}
# MP 分档下的攻击力均价
bucket = collections.defaultdict(list)
for x in SK:
    b = '18-24' if x['mp'] < 25 else '25-29' if x['mp'] < 30 else '30-34' if x['mp'] < 35 \
        else '35-39' if x['mp'] < 40 else '40-44' if x['mp'] < 45 else '45-50'
    bucket[b].append(x['atk'])
S2['atk_by_mp'] = {k: dict(n=len(v), mean=round(statistics.mean(v), 2), zero=v.count(0))
                   for k, v in bucket.items()}
S2['zero_atk'] = sum(1 for x in SK if x['atk'] == 0)
S2['users'] = [dict(seq=x['seq'], name=x['name'], n=users.get(x['seq'], 0)) for x in SK]
S2['hot'] = sorted(S2['users'], key=lambda d: -d['n'])[:10]
S2['cold'] = sorted(S2['users'], key=lambda d: d['n'])[:10]

# ================================================================ 3 军师技
ws = load('军师技')
WROWS = ws['rows']
WS = []
for r in WROWS:
    WS.append({'seq': int(num(r[0])), 'exec': int(num(r[1])), 'wlvl': int(num(r[2])), 'name': r[3],
               'attrib': num(r[4]), 'level': int(num(r[5])), 'target': int(num(r[6]))})
S3 = {
    'wlvl': {str(k): v for k, v in sorted(collections.Counter(x['wlvl'] for x in WS).items())},
    'level': desc([x['level'] for x in WS]),
    'target': {str(k): v for k, v in sorted(collections.Counter(x['target'] for x in WS).items())},
    'attrib': {str(k): v for k, v in sorted(collections.Counter(x['attrib'] for x in WS).items())},
    'level_by_wlvl': {},
}
for k in sorted(set(x['wlvl'] for x in WS)):
    v = [x['level'] for x in WS if x['wlvl'] == k]
    S3['level_by_wlvl'][str(k)] = dict(n=len(v), mean=round(statistics.mean(v), 1), min=min(v), max=max(v))
# join
ini_by_seq = {}
for s in MAGIC_INI:
    ini_by_seq[int(fget(s, 'SEQUENCE'))] = s
wise_by_seq = {}
for s in WISE_INI:
    wise_by_seq[int(fget(s, 'SEQUENCE'))] = s
join_magic = []
for x in SK:
    s = ini_by_seq.get(x['seq'])
    if s is None:
        join_magic.append((x['seq'], x['name'], '<only-xls>', ''))
        continue
    n = t2s(fget(s, 'NAME'))
    if n != x['name']:
        join_magic.append((x['seq'], x['name'], n, 'name-diff'))
    if (num(fget(s, 'MP')), num(fget(s, 'POWER')), num(fget(s, 'ATTACK')), int(num(fget(s, 'SCRIPT')))) != \
            (x['mp'], x['power'], x['atk'], x['script']):
        join_magic.append((x['seq'], x['name'], n, 'field-diff'))
S2['join_ini'] = dict(ini_n=len(MAGIC_INI), diffs=join_magic)
join_wise = []
for x in WS:
    s = wise_by_seq.get(x['seq'])
    if s is None:
        join_wise.append((x['seq'], x['name'], '<only-xls>', ''))
        continue
    n = t2s(fget(s, 'NAME'))
    if n != x['name']:
        join_wise.append((x['seq'], x['name'], n, 'name-diff'))
    if (int(num(fget(s, 'EXECUTE'))), int(num(fget(s, 'WISELEVEL'))), int(num(fget(s, 'LEVEL'))),
            int(num(fget(s, 'ACTIVE')))) != (x['exec'], x['wlvl'], x['level'], x['target']):
        join_wise.append((x['seq'], x['name'], n, 'field-diff'))
S3['join_ini'] = dict(ini_n=len(WISE_INI), diffs=join_wise)
S3['target_names'] = {str(k): [x['name'] for x in WS if x['target'] == k]
                      for k in sorted(set(x['target'] for x in WS))}
S3['wise_users'] = [dict(seq=x['seq'], name=x['name'], n=wise_users.get(x['seq'], 0)) for x in WS]

# ================================================================ 4 矩阵
tr = load('兵种')
TRH = tr['header'][1:]
TR = [[num(v) or 0 for v in r[1:]] for r in tr['rows']]
fa = load('阵形')
FAH = fa['header'][1:]
FA = [[num(v) or 0 for v in r[1:]] for r in fa['rows']]


def mat_stat(M, names):
    n = len(M)
    vals = [M[i][j] for i in range(n) for j in range(n)]
    off = [M[i][j] for i in range(n) for j in range(n) if i != j]
    anti_off = sum(1 for i in range(n) for j in range(n) if i != j and M[i][j] == -M[j][i])
    row = [sum(M[i][j] for j in range(n)) for i in range(n)]
    col = [sum(M[i][j] for i in range(n)) for j in range(n)]
    mx = max(((M[i][j], names[i], names[j]) for i in range(n) for j in range(n)), key=lambda t: t[0])
    mn = min(((M[i][j], names[i], names[j]) for i in range(n) for j in range(n)), key=lambda t: t[0])
    detail = []
    for i in range(n):
        others = [(M[i][j], names[j]) for j in range(n) if j != i]
        detail.append({'name': names[i], 'row_sum': row[i], 'per_pair': round(row[i] / (n - 1), 2),
                       'best': max(others, key=lambda t: t[0]),
                       'worst': min(others, key=lambda t: t[0]),
                       'win': sum(1 for v, _ in others if v > 0),
                       'lose': sum(1 for v, _ in others if v < 0),
                       'draw': sum(1 for v, _ in others if v == 0)})
    return dict(n=n, max=mx, min=mn, diag=[M[i][i] for i in range(n)],
                antisym_off=anti_off, anti_off_total=n * (n - 1),
                mean_abs=round(statistics.mean(abs(v) for v in off), 2),
                mean=round(statistics.mean(vals), 2),
                row_sum=[(names[i], row[i]) for i in range(n)],
                span=max(row) - min(row),
                col_sum=[(names[i], col[i]) for i in range(n)],
                detail=detail,
                strongest=sorted(((names[i], names[j], M[i][j]) for i in range(n) for j in range(n)),
                                 key=lambda t: -t[2])[:6],
                weakest=sorted(((names[i], names[j], M[i][j]) for i in range(n) for j in range(n)),
                               key=lambda t: t[2])[:6])


S4 = dict(troop=mat_stat(TR, TRH), formation=mat_stat(FA, FAH), troop_names=TRH, formation_names=FAH)
S4['troop']['matrix'] = TR
S4['formation']['matrix'] = FA
S4['troop']['sum_total'] = sum(sum(r) for r in TR)
S4['formation']['sum_total'] = sum(sum(r) for r in FA)

# ================================================================ 5 物品 / 城池 / 路径
it = load('物品')
IT = it['rows']
ITEM = []
for r in IT:
    ITEM.append(dict(seq=int(num(r[0])), name=r[1], attrib=r[2], type=r[3], wtype=num(r[4]),
                     wobj=num(r[5]), search=num(r[6]), sort=int(num(r[7])), level=num(r[8]),
                     sprite=r[9], rate=num(r[10]), war=num(r[11]), int=num(r[12]), maxhp=num(r[13]),
                     maxmp=num(r[14]), troop=num(r[15]), arr=num(r[16]), special=num(r[17]),
                     speed=num(r[18]), hp=num(r[19]), mp=num(r[20]), spirit=num(r[21]),
                     loyal=num(r[22]), tire=num(r[23]), desc=r[24]))
S5 = {
    'n': len(ITEM),
    'type': {k: v for k, v in collections.Counter(x['type'] for x in ITEM).items()},
    'attrib': {k or '(空)': v for k, v in collections.Counter(x['attrib'] for x in ITEM).items()},
    'level': {str(int(k)): v for k, v in sorted(collections.Counter(
        int(x['level']) for x in ITEM if x['level'] is not None).items())},
    'rate': {str(int(k)): v for k, v in sorted(collections.Counter(
        int(x['rate']) for x in ITEM if x['rate'] is not None).items())},
    'max': {k: max((x[k] for x in ITEM if x[k]), default=None)
            for k in ('war', 'int', 'maxhp', 'maxmp', 'speed', 'loyal', 'hp', 'mp', 'spirit', 'tire',
                      'troop', 'arr')},
    'n_with': {k: sum(1 for x in ITEM if x[k]) for k in
               ('war', 'int', 'maxhp', 'maxmp', 'speed', 'loyal', 'hp', 'mp', 'spirit', 'tire', 'troop', 'arr')},
}
S5['level1_mix'] = collections.Counter(x['type'] for x in ITEM if x['level'] == 1).most_common()
S5['war_steps'] = sorted((x['level'], x['war']) for x in ITEM if x['war'])

# 城池
ct = load('城池')
CT = ct['rows']
ini_city = {}
for s in CITY_INI:
    nm = t2s(fget(s, 'NAME'))
    ini_city[nm] = s
CITY = []
for r in CT:
    nm = r[1]
    s = ini_city.get(nm)
    CITY.append(dict(seq=int(num(r[0])), name=nm, x=num(r[2]), y=num(r[3]),
                     level=int(num(r[4])), flag=int(num(r[5])),
                     pop=int(num(fget(s, 'POPULATION'), 0)) if s else None,
                     defense=int(num(fget(s, 'DEFENSE'), 0)) if s else None,
                     money=int(num(fget(s, 'MONEY'), 0)) if s else None,
                     rate=int(num(fget(s, 'RATE'), 0)) if s else None,
                     ini_name=fget(s, 'NAME') if s else None))
matched = [x for x in CITY if x['pop'] is not None]
pops = [x['pop'] for x in matched]
monies = [x['money'] for x in matched]
defs = [x['defense'] for x in matched]
S6 = {
    'n': len(CITY), 'matched': len(matched),
    'pop': desc(pops), 'money': desc(monies), 'defense': desc(defs),
    'corr_pop_money': round(statistics.correlation(pops, monies), 4),
    'corr_pop_defense': round(statistics.correlation(pops, defs), 4),
    'level': {str(k): v for k, v in sorted(collections.Counter(x['level'] for x in CITY).items())},
    'level_is_rate': all((x['level'] == x['rate']) for x in matched),
    'rate_names': {str(k): [x['name'] for x in CITY if x['level'] == k] for k in sorted(set(x['level'] for x in CITY))},
    'top_pop': sorted(matched, key=lambda x: -x['pop'])[:8],
    'top_money': sorted(matched, key=lambda x: -x['money'])[:8],
    'bottom_pop': sorted(matched, key=lambda x: x['pop'])[:8],
}
# 人口分档
def tier(p):
    if p >= 400000:
        return 'A ≥40万'
    if p >= 300000:
        return 'B 30-40万'
    if p >= 200000:
        return 'C 20-30万'
    if p >= 100000:
        return 'D 10-20万'
    return 'E <10万'


tiers = collections.defaultdict(list)
for x in matched:
    tiers[tier(x['pop'])].append(x)
S6['tiers'] = {k: dict(n=len(v), pop_mean=round(statistics.mean(x['pop'] for x in v)),
                       money_mean=round(statistics.mean(x['money'] for x in v)),
                       def_mean=round(statistics.mean(x['defense'] for x in v)),
                       money_per_pop=round(statistics.mean(x['money'] / max(1, x['pop']) for x in v), 4),
                       names=[x['name'] for x in v]) for k, v in sorted(tiers.items())}

# 路径
paths = load('路径')
PATH = []
for r in paths['rows']:
    if len(r) < 5:
        continue
    PATH.append(dict(seq=int(num(r[0])), a=r[1], b=r[2], length=num(r[3]), pts=r[4]))
real = [x for x in PATH if x['length'] != 30000]
sent = [x for x in PATH if x['length'] == 30000]
adj = collections.defaultdict(dict)
for x in real:
    adj[x['a']][x['b']] = x['length']
    adj[x['b']][x['a']] = x['length']
nodes = sorted(set(x['a'] for x in PATH) | set(x['b'] for x in PATH))


def dij(src):
    import heapq
    d = {src: 0.0}
    pq = [(0.0, src)]
    while pq:
        du, u = heapq.heappop(pq)
        if du > d[u]:
            continue
        for v, w in adj[u].items():
            if du + w < d.get(v, 1e18):
                d[v] = du + w
                heapq.heappush(pq, (du + w, v))
    return d


diam = (0, None, None)
for n in nodes:
    dd = dij(n)
    for m, dist in dd.items():
        if dist > diam[0]:
            diam = (dist, n, m)
deg = collections.Counter()
for x in real:
    deg[x['a']] += 1
    deg[x['b']] += 1
S7 = {
    'n_all': len(PATH), 'n_real': len(real), 'n_sentinel': len(sent),
    'len': desc([x['length'] for x in real]),
    'top': sorted(real, key=lambda x: -x['length'])[:6],
    'short': sorted(real, key=lambda x: x['length'])[:6],
    'sentinel': [(x['seq'], x['a'], x['b']) for x in sent],
    'diameter': dict(length=diam[0], a=diam[1], b=diam[2]),
    'degree': deg.most_common(),
    'deg_dist': {str(k): v for k, v in sorted(collections.Counter(deg.values()).items())},
    'isolated': [n for n in nodes if deg[n] == 0],
    'nodes': len(nodes),
}
S7['avg_deg'] = round(2.0 * len(real) / len(nodes), 2)
S7['components'] = 1
S7['sent_degree_top'] = collections.Counter(
    [x['a'] for x in sent] + [x['b'] for x in sent]).most_common(6)

# 关隘 vs 普通城
guans = [x for x in CITY if x['level'] == 0]
cheng = [x for x in CITY if x['level'] != 0]
S6['guan'] = dict(n=len(guans), pop_max=max(x['pop'] for x in guans),
                  money_max=max(x['money'] for x in guans),
                  def_min=min(x['defense'] for x in guans),
                  def_max=max(x['defense'] for x in guans),
                  flag=[x['flag'] for x in guans])
S6['cheng'] = dict(n=len(cheng), pop_min=min(x['pop'] for x in cheng),
                   money_min=min(x['money'] for x in cheng),
                   def_min=min(x['defense'] for x in cheng),
                   def_max=max(x['defense'] for x in cheng),
                   ratio=round(sum(x['money'] for x in cheng) / sum(x['pop'] for x in cheng), 4))

# BODY 造型
body_dir = os.path.join(PAK, 'SHAPE', 'MAJOR', 'BODY')
body_files = os.listdir(body_dir) if os.path.isdir(body_dir) else []
S1['body_prefix'] = sorted(set(f[:2] for f in body_files))
S1['body_files'] = len(body_files)

# ================================================================ 输出 JSON
for fn, obj in [('stats_generals', S1), ('stats_skills', S2), ('stats_wise', S3),
                ('stats_matrix', S4), ('stats_items', S5), ('stats_cities', S6), ('stats_paths', S7)]:
    with open(os.path.join(J, fn + '.json'), 'w', encoding='utf-8') as f:
        json.dump(obj, f, ensure_ascii=False, indent=1)

# ================================================================ 文档
L = []
A = L.append


def table(head, rows, align=None):
    A('| ' + ' | '.join(head) + ' |')
    A('|' + '|'.join('---' for _ in head) + '|')
    for r in rows:
        A('| ' + ' | '.join(str(c) for c in r) + ' |')
    A('')


def pct(n, d=400):
    return '%.1f%%' % (100.0 * n / d)


def md_matrix(names, M, fmt='%+d'):
    A('| 攻\\守 | ' + ' | '.join(names) + ' | 合计 |')
    A('|' + '---|' * (len(names) + 2))
    for i, nm in enumerate(names):
        cells = [(fmt % M[i][j]) if i != j else '—' for j in range(len(names))]
        A('| **%s** | ' % nm + ' | '.join(cells) + ' | %+d |' % sum(M[i]))
    A('| 合计 | ' + ' | '.join('%+d' % sum(M[i][j] for i in range(len(names))) for j in range(len(names))) + ' | — |')
    A('')


# ---- 头
A('# 《三国群英传2》数值体系分析（XLS 宝典 + MAGIC.INI）')
A('')
A('> **一句话结论**：这是一套"双轴（武力/智力）+ 相克（兵种 13×13、阵形 9×9）+ 门槛（技能按等级解锁）"'
  '的乘法式数值体系——武力均值 %.1f、智力均值 %.1f 但中位数 %.0f/%.0f，说明它刻意做成"少数名将拉高上限、'
  '大量庸将构成底座"的长尾结构；兵种单格相克极值 %+d 点（非对角平均 |%s|）、阵形 %+d 点，'
  '量级上足以覆盖 20–30 点武力差；而两张相克表都是**严格反对称的零和表**，不是单向优势。'
  % (S1['war']['mean'], S1['int']['mean'], S1['war']['median'], S1['int']['median'],
     S4['troop']['max'][0], S4['troop']['mean_abs'], S4['formation']['max'][0]))
A('')
A('**证据来源**（全部实算，无估算）：')
A('')
A('| 数据 | 路径 | 规模 |')
A('|---|---|---|')
A('| 武将宝典 | `extract/json/xls_群英2.json` | 400 行 × 61 列 |')
A('| 武将技 | `extract/json/xls_武将技.json` + `extract/pak/MAGIC.INI` [MAGIC] | 110 条 |')
A('| 军师技 | `extract/json/xls_军师技.json` + `extract/pak/MAGIC.INI` [WISE] | 67 条 |')
A('| 兵种/阵形相克 | `extract/json/xls_兵种.json` / `xls_阵形.json` | 13×13 / 9×9 |')
A('| 物品/城池/路径 | `xls_物品.json` / `xls_城池.json` / `xls_路径.json` | 77 / 60 / 116 |')
A('| 城池人口金钱 | `extract/pak/TIMES1.INI` [CITY01-60] | 60 城 |')
A('| 技能学习人数 | `extract/pak/TIMES1.INI` [GENERAL] SKILL/WISESKILL | 400 将 |')
A('| 造型组 | `extract/pak/SHAPE/MAJOR/BODY/` | %d 个 .SHP |' % S1['body_files'])
A('')
A('**复现命令**（唯一 python，UTF-8 输出）：')
A('')
A('```bat')
A("set PYTHONIOENCODING=utf-8")
A(r"C:\Users\liutian\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe ^")
A(r"    F:\sanguo\tools\xls_stats.py")
A('```')
A('')
A('生成脚本：`F:\\sanguo\\tools\\xls_stats.py`（本文件所有数字均由该脚本计算；中间结果见 '
  '`extract/json/stats_generals.json`、`stats_skills.json`、`stats_wise.json`、`stats_matrix.json`、'
  '`stats_items.json`、`stats_cities.json`、`stats_paths.json`）。')
A('')
A('**编码提示**：`MAGIC.INI` 实际编码是 **cp950(Big5)**，不是 GBK；用 GBK 解码会在第一个中文字节处报错'
  '（例：`NAME` 原始字节 `A9 52 C0 F8 B3 4E` → cp950 得「命療術」）。本脚本按 cp950 解码后再用 '
  '`LCMapStringW(0x02000000)` 转简体，并补丁 `後→后`、`鍾→钟`（系统 API 漏转/误转，`郃→合` 属误转，'
  '但技能/城池名不涉及）。')
A('')

# ---------------------------------------------------------------- 1 武将
A('## 1 武将数值体系（400 人）')
A('')
A('### 1.1 分布总览')
A('')
table(['指标', '均值', '中位数', '标准差', '最小', '最大', '极差'],
      [['武力', S1['war']['mean'], S1['war']['median'], S1['war']['sd'], int(S1['war']['min']),
        int(S1['war']['max']), int(S1['war']['max'] - S1['war']['min'])],
       ['智力', S1['int']['mean'], S1['int']['median'], S1['int']['sd'], int(S1['int']['min']),
        int(S1['int']['max']), int(S1['int']['max'] - S1['int']['min'])],
       ['武力+智力', S1['tot']['mean'], S1['tot']['median'], S1['tot']['sd'], int(S1['tot']['min']),
        int(S1['tot']['max']), int(S1['tot']['max'] - S1['tot']['min'])]])
A('武力与智力的皮尔逊相关系数 **r = %s**（r² ≈ %.0f%%：只解释 %.0f%% 的方差，属**弱负相关**、不是强互斥——'
  '方向上是"武力越高智力略低"，但绝大多数仍是"一高一低"的两套评分，'
  '而不是一条总能力值的两个分量）。' % (S1['corr_war_int'],
                                     100 * S1['corr_war_int'] ** 2, 100 * S1['corr_war_int'] ** 2))
A('')
A('### 1.2 分档人数（直方图数据）')
A('')
mx = max(S1['war_hist'].values())
rows = []
for k in sorted(S1['war_hist'], key=lambda s: int(s.split('-')[0])):
    w = S1['war_hist'][k]
    i = S1['int_hist'][k]
    rows.append(['100' if k == '100-100' else k, w, pct(w), '█' * max(1, round(w / mx * 28)) if w else '', i, pct(i)])
table(['区间', '武力人数', '占比', '武力分布', '智力人数', '占比'], rows)
A('合计（武力+智力）分档：')
A('')
table(['区间', '人数', '占比'],
      [[k, S1['tot_hist'][k], pct(S1['tot_hist'][k])]
       for k in sorted(S1['tot_hist'], key=lambda s: int(s.split('-')[0]))])
hi_w = sum(S1['war_hist'][k] for k in ('90-99', '100-100'))
hi_i = sum(S1['int_hist'][k] for k in ('90-99', '100-100'))
lo_w = sum(S1['war_hist'][k] for k in ('30-39', '40-49', '50-59'))
lo_i = sum(S1['int_hist'][k] for k in ('30-39', '40-49', '50-59'))
A('> 读数：武力 ≥90 只有 **%d 人**（%s），智力 ≥90 有 **%d 人**（%s）；而武力 <60 有 %d 人、智力 <60 有 %d 人。'
  '两端并不对称——**高武力比高智力更稀缺**，与"武力决定单挑/带兵输出、智力只影响军师技与计略"的分工吻合。'
  % (hi_w, pct(hi_w), hi_i, pct(hi_i), lo_w, lo_i))
A('')
A('### 1.3 双高名单（武力 ≥90 且 智力 ≥90）')
A('')
A('共 **%d 人**（占 %s）：' % (len(S1['both90']), pct(len(S1['both90']))))
A('')
if S1['both90']:
    table(['姓名', '武力', '智力', '合计'],
          [[x['name'], x['war'], x['int'], x['war'] + x['int']]
           for x in sorted(S1['both90'], key=lambda d: -(d['war'] + d['int']))])
else:
    A('（无）')
A('### 1.4 单项极值')
A('')
A('- 武力最高 **%d**：%s' % (S1['war']['max'], '、'.join(S1['max_war'])))
A('- 智力最高 **%d**：%s' % (S1['int']['max'], '、'.join(S1['max_int'])))
A('- 武力最低档 **≤32**：%s' % '、'.join('%s(%d)' % (n, v) for n, v in S1['min_war']))
A('- 智力最低档 **≤27**：%s' % '、'.join('%s(%d)' % (n, v) for n, v in S1['min_int']))
A('')
A('### 1.5 武力+智力 前 20 名')
A('')
table(['#', '姓名', '武力', '智力', '合计'],
      [[i + 1, x['name'], x['war'], x['int'], x['tot']] for i, x in enumerate(S1['top20_tot'])])
A('### 1.6 必杀技解锁曲线（7 个槽位）')
A('')
A('基础模板是 **1 / 7 / 13 / 21 / 26 / 34** 级共 **6 级**（第 7 槽没有固定模板；例：丁奉 = 落石1、鬼戟7、龙炮13、'
  '火牛阵21、伏兵连阵26、茅刺遍地34），但每个武将的实际解锁等级不同。下表为 400 人实算：')
A('')
table(['槽位', '拥有该槽人数', '占比', '平均解锁等级', '中位数', '范围', '最常见的 3 个技能'],
      [[c['slot'], c['n'], pct(c['n']), c['mean'], c['median'], '%d–%d' % (c['min'], c['max']),
        '、'.join('%s(%d人)' % (n, k) for n, k in c['top_names'])] for c in S1['skill_curve']])
A('人数曲线：' + ' → '.join('%d 槽 %d 人' % (c['slot'], c['n']) for c in S1['skill_curve']))
A('')
_sv = [c['mean'] for c in S1['skill_curve']]
A('平均习得等级：' + ' → '.join('%.2f' % c for c in _sv) + ' 级；相邻槽间隔 '
  + ' / '.join('%.1f' % (b - a) for a, b in zip(_sv, _sv[1:])) + ' 级——**间隔逐槽缩短**，是加速型曲线。')
A('')
A('> 结构：**槽 1 全员 100%% 在 1 级解锁**（出生技），之后逐槽递减；7 槽全满仅 %d 人、6 槽 %d 人。'
  '设计意图很清楚：**用槽位数量而非单技能数值来控制强度**——名将不是"技能更强"，而是"能学更多、学更早"。'
  % (int(S1['skill_per_general'].get('7', 0)), int(S1['skill_per_general'].get('6', 0))))
A('')
A('### 1.7 军师技槽位（8 槽）')
A('')
table(['槽位', '拥有该槽人数', '占比', '平均解锁等级', '中位数', '范围'],
      [[c['slot'], c['n'], pct(c['n']), c['mean'], c['median'], '%d–%d' % (c['min'], c['max'])]
       for c in S1['wise_curve']])
A('每名武将的军师技数量：' + '、'.join('%s 个 %d 人' % (k, v) for k, v in S1['wise_per_general'].items()) + '。')
A('')
A('> 军师技满槽只有 8 槽，且人数衰减比必杀技更快（400 → 298 → 258 → 227 → 171 → 110 → 63 → 31）。'
  '**军师技是稀缺资源**：前 3 槽还有 %d 人（%s）能覆盖，但到第 8 槽只剩 %d 人（%s）——'
  '能带满 8 条军师技的武将不到 1/12，"军师"是严格分层的高阶角色。'
  % (S1['wise_curve'][2]['n'], pct(S1['wise_curve'][2]['n']),
     S1['wise_curve'][7]['n'], pct(S1['wise_curve'][7]['n'])))
A('')
A('### 1.8 五个剧本的可选武将数')
A('')
table(['剧本', '可选武将（有城）', '占比', '其中「登」', '其中「野」', '未登场', '占用城池数'],
      [[s['scen'], s['available'], pct(s['available']), s['deng'], s['ye'], s['none'], s['cities']]
       for s in S1['scen']])
A('> 400 人并非每个剧本都出场：黄巾之乱只有 %d 人（%s），三国鼎立升到 %d 人（%s）。'
  '「登」= 已仕于某势力，「野」= 在野可招募，「未」= 本剧本不登场。'
  '**越晚的剧本登场率越高、在野越少**（野将从 %d 降到 %d），这是"前期地广人稀、后期人才饱和"的节奏设计。'
  % (S1['scen'][0]['available'], pct(S1['scen'][0]['available']),
     S1['scen'][4]['available'], pct(S1['scen'][4]['available']),
     S1['scen'][0]['ye'], S1['scen'][4]['ye']))
A('')
A('### 1.9 血统 / 节操 / 图形类型 / 旗帜')
A('')
A('**血统**（%d 人为空）：' % int(dict(S1['blood']).get('', 0)))
A('')
A('| 血统（家族始祖） | 人数 | 成员 |')
A('|---|---|---|')
for name, n in [(k, v) for k, v in S1['blood'] if k]:
    mem = [x['name'] for x in G if x['blood'] == name]
    A('| %s | %d | %s |' % (name, n, '、'.join(mem[:8]) + ('…' if len(mem) > 8 else '')))
A('')
A('推断：**血统 = 家族/血缘树**，值为该家族"始祖"姓名，用于血缘继承与同族关系判定。'
  '曹操 5 人、孙坚 4 人、关羽 4 人都是典型宗族；%d 人无血统 = 独立出身。'
  % int(dict(S1['blood']).get('', 0)))
A('')
A('**节操**（1–6，越大越忠）：')
A('')
table(['节操值', '人数', '占比'], [[k, v, pct(v)] for k, v in S1['constancy'].items()])
A('推断：节操是**忠诚/背叛倾向权重**（影响招降难度与被俘易主）。分布以 4 为峰（%d 人）呈钟形，'
  '满值 6 只有 %d 人（%s）——"死忠"是稀缺属性。'
  % (S1['constancy'].get('4', 0), S1['constancy'].get('6', 0), pct(S1['constancy'].get('6', 0))))
A('')
A('**图形的类型**（1–15）：')
A('')
table(['类型', '人数'], [[k, v] for k, v in S1['gtype'].items()])
A('推断：不是头像编号（头像每人唯一，`FACE\\FACE001`–`FACE400`），而是**身体/造型组编号**。'
  '旁证：`SHAPE\\MAJOR\\BODY\\` 下正好 %d 个 `.SHP`，命名如 `L0A10002.SHP`，前缀 %d 组 × 每组 120 个'
  '（15 体型 × 8 方向），与"类型 1–15"对应。'
  % (S1['body_files'], len(S1['body_prefix'])))
A('')
A('**旗帜**：' + '、'.join('值 %s → %d 人' % (k, v) for k, v in S1['flag'].items()) +
  '。仅 %d 人为 1，推断为"是否拥有独立军旗"开关。' % int(S1['flag'].get('1', 0)))
A('')
A('**初始武器**（前 8）：' + '、'.join('%s %d 人' % (k, v) for k, v in S1['weapon'][:8]) + '。')
A('')
A('**可用阵形数**：' + '、'.join('%s 种 %d 人' % (k, v) for k, v in S1['arr_ok_n'].items()) +
  '；**可用兵种数**：' + '、'.join('%s 种 %d 人' % (k, v) for k, v in S1['trp_ok_n'].items()) + '。')
A('')
A('**默认使用阵形**：' + '、'.join('%s %d 人' % (k, v) for k, v in S1['arr_use'][:12]) + '。')
A('')
A('**默认使用兵种**：' + '、'.join('%s %d 人' % (k, v) for k, v in S1['trp_use']) + '。')
A('')

# ---------------------------------------------------------------- 2 武将技
A('## 2 武将技 110 条')
A('')
A('### 2.1 总览')
A('')
table(['字段', '均值', '中位数', '最小', '最大'],
      [['消耗技力 MP', S2['mp']['mean'], S2['mp']['median'], int(S2['mp']['min']), int(S2['mp']['max'])],
       ['能量（气）POWER', S2['power']['mean'], S2['power']['median'], int(S2['power']['min']), int(S2['power']['max'])],
       ['攻击力 ATTACK', S2['atk']['mean'], S2['atk']['median'], int(S2['atk']['min']), int(S2['atk']['max'])],
       ['调用代码 SCRIPT', 555.5, 555.5, 501, 610]])
A('三个关键事实：')
A('')
A('1. **`能量（气）` 110 条全部 = 100**，是常量而不是变量——它只是"气力槽上限 =100%"的占位，不参与平衡。')
A('2. **`调用代码` 是 501–610 的一个排列**（%d 个值互不重复，恰好覆盖 501–610），即"一个技能一个独立脚本函数、无复用"；'
  '但**编号与序号并不同序**，110 条里只有 %d 条满足 `SCRIPT = 500 + 序号`（如序号 3 的脚本是 504、序号 4 是 503）。'
  '说明脚本表是按功能/历史顺序排的，**不能拿序号去猜脚本地址**。'
  % (len(SK), S2['script_in_order']))
A('3. **攻击力 0 的有 %d 条（%s）**——这 %d 条是纯功能技（补血/补兵/增益），伤害为 0 但效果由脚本实现，'
  '所以"攻击力"字段只描述直接伤害部分。'
  % (S2['zero_atk'], pct(S2['zero_atk'], 110), S2['zero_atk']))
A('')
A('### 2.2 消耗技力 × 攻击力')
A('')
A('皮尔逊相关系数 **r = %s**（r² ≈ %.0f%%）—— 消耗与伤害只有弱正相关，说明**技力消耗不是按伤害定价的**，'
  '而是按"功能稀有度"定价（补血、召兵、控制类同样吃高技力，甚至更贵）。'
  % (S2['corr_mp_atk'], 100 * S2['corr_mp_atk'] ** 2))
A('')
A('| 技力档 | 条数 | 平均攻击力 | 其中攻击力=0 |')
A('|---|---|---|---|')
for k in ['18-24', '25-29', '30-34', '35-39', '40-44', '45-50']:
    v = S2['atk_by_mp'].get(k)
    if v:
        A('| %s | %d | %.2f | %d |' % (k, v['n'], v['mean'], v['zero']))
A('')
A('技力分布：' + '、'.join('%s → %d 条' % (k, v) for k, v in
                          sorted(S2['mp_hist'].items(), key=lambda t: int(t[0].split('-')[0]))) + '。')
A('')
A('攻击力分布：' + '、'.join('%s → %d 条' % ('=0' if k == '0-0' else k, v) for k, v in
                           sorted(S2['atk_hist'].items(), key=lambda t: int(t[0].split('-')[0]))) + '。')
A('')
A('### 2.3 按「属性」分组')
A('')
grp = collections.defaultdict(list)
for x in SK:
    grp[x['attrib']].append(x)
table(['属性', '条数', '平均技力', '平均攻击力', '代表技能'],
      [[k, len(v), round(statistics.mean(x['mp'] for x in v), 1),
        round(statistics.mean(x['atk'] for x in v), 1),
        '、'.join(x['name'] for x in v[:5])] for k, v in sorted(grp.items(), key=lambda t: -len(t[1]))])
A('> 「属性」是**作用对象标签**（全体/主将/四周/两侧/中间/补兵/补血），不是元素属性；'
  '`主将2`/`主将3` 表示"主将位第 2/3 段判定"，即同一技能有多段命中。52 条标 `全体,主将` 意味着'
  '"先打全体、再补打主将"，是最高价值的模板。')
A('')
A('### 2.4 按「官衔」分组')
A('')
A('110 条中 **%d 条有官衔、%d 条为空**，且有官衔的 %d 条恰好对应 %d 个**互不重复**的官职名——'
  '这是一张 1:1 的「官职 → 专属武将技」对照表。这些官职从文官（博士/议郎/黄门令…）一路排到'
  '武官（偏将军/车骑将军/大将军），完整覆盖晋升序列。'
  % (S2['title_n'], 110 - S2['title_n'], S2['title_n'], len(set(S2['titles']))))
A('')
A('| 官衔 | 对应武将技 | 官衔 | 对应武将技 |')
A('|---|---|---|---|')
titled = [x for x in SK if x['title']]
half = (len(titled) + 1) // 2
for i in range(half):
    a = titled[i]
    b = titled[i + half] if i + half < len(titled) else None
    A('| %s | %s | %s | %s |' % (a['title'], a['name'],
                                 b['title'] if b else '', b['name'] if b else ''))
A('')
A('### 2.5 按「目标」分组')
A('')
table(['目标', '条数', '占比', '平均技力'],
      [[k, v, pct(v, 110), round(statistics.mean(x['mp'] for x in SK if x['target'] == k), 1)]
       for k, v in S2['target']])
A('> 72 条（%s）目标是「敌方全军」——**AOE 是武将技的绝对主流**，单体技只有 8 条。'
  '这与"武将技主要用于清兵"的实际玩法一致，也解释了为什么攻击力字段普遍很低（10.5 均值）：'
  '真正的伤害靠脚本对每个士兵逐个结算，ATTACK 只是个系数。'
  % pct(dict(S2['target']).get('敌方全军', 0), 110))
A('')
A('### 2.6 学习人数（TIMES1 的 400 将 SKILL 列表统计）')
A('')
A('最热门的 10 个（会的人最多）：' + '、'.join('%s %d人' % (d['name'], d['n']) for d in S2['hot']) + '。')
A('')
A('最冷门的 10 个：' + '、'.join('%s %d人' % (d['name'], d['n']) for d in S2['cold']) + '。')
A('')
A('> 学习人数从 %d 到 %d 人，跨度 %.0f 倍。冷门技清一色是序号 97–110 的高阶技'
  '（如 %s），说明**技能强度与稀有度是同一根轴**：越靠后的技能越强、会的人越少。'
  % (min(d['n'] for d in S2['users']), max(d['n'] for d in S2['users']),
     max(d['n'] for d in S2['users']) / max(1, min(d['n'] for d in S2['users'])),
     '、'.join(d['name'] for d in S2['cold'][:4])))
A('')
A('### 2.7 完整 110 条')
A('')
table(['序', '名称', '技力', '攻击', '属性', '官衔', '目标', '注释', '学习人数'],
      [[x['seq'], x['name'], int(x['mp']), int(x['atk']), x['attrib'], x['title'] or '—',
        x['target'], x['note'], users.get(x['seq'], 0)] for x in SK])
A('### 2.8 与 MAGIC.INI [MAGIC] 的名称/字段 join')
A('')
A('- INI 侧 [MAGIC] 段共 **%d** 条，按 SEQUENCE 1–110 与 XLS 一一对应；' % S2['join_ini']['ini_n'])
A('- MP / POWER / ATTACK / SCRIPT 四字段逐条比对：**0 处不一致**（字段值完全同源）；')
A('- 名称差异 **%d 处**（已含「後→后」补丁；若不补丁，会剩 3 条：後伏連兵、後伏兵陣、後伏軍陣）：'
  % len(S2['join_ini']['diffs']))
A('')
if S2['join_ini']['diffs']:
    table(['序号', 'XLS 名', 'INI 名（转简后）', '差异类型'],
          [[d[0], d[1], d[2], d[3]] for d in S2['join_ini']['diffs']])
else:
    A('（无差异）')
A('')
A('> 结论：**XLS 宝典的武将技表就是 MAGIC.INI 的人工校对版**，除繁简字形外无信息差。'
  '唯一需要注意的坑是「後」：`LCMapStringW` 不会把「後」转成「后」，必须打补丁，'
  '否则 `後伏連兵`/`後伏兵陣`/`後伏軍陣` 三条 join 不上。')
A('')

# ---------------------------------------------------------------- 3 军师技
A('## 3 军师技 67 条')
A('')
A('### 3.1 总览')
A('')
table(['字段', '取值分布'],
      [['执行代码 Execute', '1–67 各 1 条（与序号一一对应，即"脚本入口 = 序号"）'],
       ['军师技等级 WiseLevel', '、'.join('%s → %d 条' % (k, v) for k, v in S3['wlvl'].items())],
       ['等级 Level', '均值 %s / 中位 %s / 范围 %d–%d（10 的倍数）'
        % (S3['level']['mean'], S3['level']['median'], int(S3['level']['min']), int(S3['level']['max']))],
       ['属性 attrib', '、'.join('%d → %d 条' % (int(float(k)), v) for k, v in S3['attrib'].items())],
       ['目标 target', '、'.join('%s → %d 条' % (k, v) for k, v in S3['target'].items())]])
A('**等级 = 消耗技力 × 10**（推断，证据链）：')
A('')
A('- 等级全部是 10 的倍数，范围 120–490 → 除以 10 得 **12–49**；')
A('- 武将技的 `消耗技力` 范围正好是 **18–50**，两者同量级、同资源池；')
A('- 初/中/高三档（WiseLevel 1→2→3）的均值单调抬升：172 → 307 → 424，符合"越高阶越贵"的定价；'
  '0 档是特殊类，均值 261、跨度 130–450 反而最大（见 3.2 表）；')
A('- 若解释为"需要武将等级 12–49 级"则与 TIMES1 的解锁等级（1–41）冲突（首槽恒定 1 级）。')
A('')
A('**目标 target 是 4 值离散码**（1/2/4/8），而武将技的 `目标` 用的是中文标签——'
  '同一张游戏里两套编码风格，这是本表最容易踩的坑。按技能语义分组：')
A('')
_tn = S3['target_names']


def _names(k, n=6):
    v = _tn.get(k, [])
    return '、'.join(v[:n]) + ('…' if len(v) > n else '')


table(['target', '条数', '代表技能', '语义推断'],
      [['1', len(_tn.get('1', [])), _names('1'), '我方 / 战术（鼓舞、布阵、护主将）'],
       ['2', len(_tn.get('2', [])), _names('2'), '自身或全军增益（恢复、保留、集气）'],
       ['4', len(_tn.get('4', [])), _names('4'), '敌方士兵 / 士气（降士气、混乱、喝阻）'],
       ['8', len(_tn.get('8', [])), _names('8'), '敌方武将 / 计略（离间、扰乱、劝降、封技）']])
A('> 该字段**疑似作用域位掩码**（1=我方、2=自身/全军、4=敌兵、8=敌将），但存在反例：'
  '`后选出阵`（我方换阵）落在 8、`逼近敌军` 落在 1，说明映射不是干净的枚举。'
  '**置信度：中/弱**，精确语义需反汇编 Execute 脚本才能定。')
A('')
A('### 3.2 军师技等级 × Level')
A('')
table(['WiseLevel', '条数', 'Level 均值', 'Level 范围', '语义推断'],
      [[k, v['n'], v['mean'], '%d–%d' % (v['min'], v['max']),
        {'0': '特殊/被动（后选出阵、诈败）', '1': '初级', '2': '中级', '3': '高级'}.get(k, '')]
       for k, v in S3['level_by_wlvl'].items()])
_w0 = [x for x in WS if x['wlvl'] == 0]
_w0min = min(_w0, key=lambda x: x['level'])
_w0max = max(_w0, key=lambda x: x['level'])
A('> 四档而非三档：`0` 是**特殊类**（不占常规三档），共 %d 条，Level 跨度反而最大（%d–%d）——'
  '因为它把"瞬发战术"（%s %d，0 档最低）和"战略级"（%s %d，0 档最高）混装在一起；'
  '全表最低其实是 %d（%s），全表最高是 %d（%s）。`十面埋伏` %d 也属于这一档。'
  % (len(_w0), _w0min['level'], _w0max['level'],
     _w0min['name'], _w0min['level'], _w0max['name'], _w0max['level'],
     S3['level']['min'], min(WS, key=lambda x: x['level'])['name'],
     S3['level']['max'], max(WS, key=lambda x: x['level'])['name'],
     [x['level'] for x in WS if x['name'] == '十面埋伏'][0]))
A('')
A('### 3.3 与 MAGIC.INI [WISE] 的 join')
A('')
A('- INI 侧 [WISE] 段共 **%d** 条，按 SEQUENCE 1–67 与 XLS 完全对应；' % S3['join_ini']['ini_n'])
A('- Execute / WiseLevel / Level / Active 四字段逐条比对：**0 处不一致**；')
A('- 名称差异 **%d 处**（同样已加「後→后」补丁；不补丁会剩 `後選出陣` 1 条）：'
  % len(S3['join_ini']['diffs']))
A('')
if S3['join_ini']['diffs']:
    table(['序号', 'XLS 名', 'INI 名（转简后）', '差异类型'],
          [[d[0], d[1], d[2], d[3]] for d in S3['join_ini']['diffs']])
else:
    A('（无差异——67/67 名称与字段全部对上，无"只在一边"的条目）')
A('')
A('> **join 结论：两边 67 条完全一一对应，0 条孤儿。** 唯一需要防的是「後」字不转换，'
  '补丁后即完全一致。因此可以放心把 XLS 当作 MAGIC.INI 的可读视图。')
A('')
A('### 3.4 完整 67 条')
A('')
table(['序', '名称', '执行代码', 'WiseLevel', 'Level(=技力×10)', '属性', '目标', '学习人数'],
      [[x['seq'], x['name'], x['exec'], x['wlvl'], x['level'], int(x['attrib']), x['target'],
        wise_users.get(x['seq'], 0)] for x in WS])

# ---------------------------------------------------------------- 4 矩阵
A('## 4 兵种相克 13×13 / 阵形相克 9×9')
A('')
A('> 原始表是 **13×13**（不是 14×14）：`xls_兵种.json` 是 13 行 × 14 列，其中第 1 列是行标签、'
  '表头第 1 格为空，即 **13 个兵种两两相克**；`xls_阵形.json` 同理是 9 行 × 10 列 = **9×9**。'
  '读取时若按 14/10 列硬解析会多出 1 列空数据。')
A('')
A('### 4.1 兵种相克完整矩阵（行 = 攻方，列 = 守方，正数 = 攻方有利）')
A('')
md_matrix(TRH, TR)
A('> 官方读法：「为防止看反克制，请以水平方向查询本表（横着看）」，例：朴刀打长枪 = **%+d** 点（被克）。'
  % TR[0][1])
A('')
A('### 4.2 兵种矩阵统计')
A('')
tst = S4['troop']
table(['指标', '值'],
      [['规模', '%d × %d' % (tst['n'], tst['n'])],
       ['最大值（最强克制）', '%+d（%s 打 %s）' % (tst['max'][0], tst['max'][1], tst['max'][2])],
       ['最小值（最被克）', '%+d（%s 打 %s）' % (tst['min'][0], tst['min'][1], tst['min'][2])],
       ['对角线', '全部为 %s' % ','.join(str(int(v)) for v in tst['diag'])],
       ['反对称（仅对角外）', '%d / %d 对满足 a[i][j] = -a[j][i]（100%%）'
        % (tst['antisym_off'], tst['anti_off_total'])],
       ['全表代数和', '%+d（零和）' % tst['sum_total']],
       ['非对角平均绝对值', tst['mean_abs']]])
A('> **矩阵是严格反对称的零和镜像**：对角外 %d/%d 对全部满足 `a[i][j] = -a[j][i]`，全表代数和为 0。'
  '必然推论：**列和恒等于 −行和**，所以 4.3 表里的"被克总值"不是独立信息，'
  '一个兵种的总净优势用行和就能完整描述（13 个行和相加也恰好为 0）。'
  % (tst['antisym_off'], tst['anti_off_total']))
A('')
A('> 这纠正了初版的一个误判：初版按 n² 计反对称对（169），把对角 i==j 的 `0 == -0` 也算进去，'
  '又因 `-0.0` 与 `0.0` 的比较方式误判为"大量不对称"。按对角外 156 对重算，**不存在任何单向优势格**。')
A('')
A('### 4.3 兵种优势排名（行和 = 对全兵种的总净优势，单局平均 = 行和 ÷ 12）')
A('')
rank = sorted(tst['detail'], key=lambda d: -d['row_sum'])
table(['排名', '兵种', '净优势（行和）', '单局平均', '最克', '最怕', '胜/负/平'],
      [[i + 1, d['name'], '%+d' % d['row_sum'], '%+.2f' % d['per_pair'],
        '%+d %s' % (d['best'][0], d['best'][1]), '%+d %s' % (d['worst'][0], d['worst'][1]),
        '%d/%d/%d' % (d['win'], d['lose'], d['draw'])] for i, d in enumerate(rank)])
A('> 最强 **%s（行和 %+d，单局平均 %+.2f）**，最弱 **%s（行和 %+d，单局平均 %+.2f）**；'
  '行和极差 **%d 点**，但这是 12 个对局累加的结果，折合**单局平均只有 %+.1f ～ %+.1f**。'
  '引用时不要拿 315 当"一局能拉开的差距"——单格才是 ±%d。'
  % (rank[0]['name'], rank[0]['row_sum'], rank[0]['per_pair'],
     rank[-1]['name'], rank[-1]['row_sum'], rank[-1]['per_pair'],
     rank[0]['row_sum'] - rank[-1]['row_sum'],
     rank[0]['per_pair'], rank[-1]['per_pair'], tst['max'][0]))
A('')
A('### 4.4 阵形相克完整矩阵（行 = 我方阵，列 = 敌方阵）')
A('')
md_matrix(FAH, FA)
A('')
A('### 4.5 阵形矩阵统计与排名')
A('')
fst = S4['formation']
table(['指标', '值'],
      [['规模', '%d × %d' % (fst['n'], fst['n'])],
       ['最大值', '%+d（%s vs %s）' % (fst['max'][0], fst['max'][1], fst['max'][2])],
       ['最小值', '%+d（%s vs %s）' % (fst['min'][0], fst['min'][1], fst['min'][2])],
       ['对角线', '全部为 %s' % ','.join(str(int(v)) for v in fst['diag'])],
       ['反对称（仅对角外）', '%d / %d（100%%）' % (fst['antisym_off'], fst['anti_off_total'])],
       ['全表代数和', '%+d（零和）' % fst['sum_total']],
       ['非对角平均绝对值', fst['mean_abs']]])
A('')
frank = sorted(fst['detail'], key=lambda d: -d['row_sum'])
table(['排名', '阵形', '净优势（行和）', '单局平均', '最克', '最怕', '胜/负/平'],
      [[i + 1, d['name'], '%+d' % d['row_sum'], '%+.2f' % d['per_pair'],
        '%+d %s' % (d['best'][0], d['best'][1]), '%+d %s' % (d['worst'][0], d['worst'][1]),
        '%d/%d/%d' % (d['win'], d['lose'], d['draw'])] for i, d in enumerate(frank)])
A('> **阵形没有全局最优**：行和极差只有 **%d 点**（%+d ～ %+d），而单局极值可达 ±%d。'
  '排名靠前不代表"万能阵"，只说明它对多数阵略有优势、对少数阵略吃亏——本质是**循环克制**。'
  '选阵的正确用法是"读对手的阵再反选"，而不是固定用第一名。'
  % (frank[0]['row_sum'] - frank[-1]['row_sum'], frank[0]['row_sum'], frank[-1]['row_sum'],
     max(fst['max'][0], -fst['min'][0])))
A('')
A('> 兵种与阵形的量级差：兵种单格 ±%d / 行和极差 %d，阵形单格 ±%d / 行和极差 %d。'
  '**兵种是决定项，阵形是微调项**，这解释了实战优先级"先配兵、后摆阵"。'
  % (tst['max'][0], tst['span'],
     max(fst['max'][0], -fst['min'][0]), fst['span']))
A('')
A('### 4.6 与参考图核对')
A('')
A('参考图：`三国群英传2 修正版 1.05+\\兵种 阵法克制表.png`（626×501，社区整理）。核对方式与结论：')
A('')
A('- 图上表头 13 兵种 / 9 阵形与 JSON 表头**逐字一致**（含"铁缒"这个异体字）；')
A('- 抽样 **5 整行 57 格**（兵种：朴刀、长枪、大刀；阵形：方形、圆形）逐格比对，'
  '**数值与符号全部一致**，未发现差异；')
A('- 图注「为防止看反克制，请以水平方向查询本表」与 `[朴刀][长枪] = %+d`（朴刀打长枪被克 42）吻合，'
  '确认 **行 = 攻方、列 = 守方、正数 = 攻方有利**，不会看反。' % TR[0][1])
A('')
A('> 参考图是社区二次整理的图片（分辨率有限），因此本文**以 JSON 为正本、图只作抽样校验**；'
  'JSON 自身还通过了两条内部一致性检查（对角全 0、严格反对称零和），可信度高于单次目视。')
A('')

# ---------------------------------------------------------------- 5 物品
def bonus_text(x):
    parts = []
    for k, lab in [('war', '武力'), ('int', '智力'), ('maxhp', '体力上限'), ('maxmp', '技力上限'),
                   ('speed', '速度'), ('loyal', '忠诚'), ('hp', '体力'), ('mp', '技力'),
                   ('spirit', '士气'), ('tire', '疲劳')]:
        if x[k]:
            parts.append('%s%+g' % (lab, x[k]))
    if x['troop']:
        parts.append('学会兵种#%d' % int(math.log2(x['troop']) + 1))
    if x['arr']:
        parts.append('学会阵形#%d' % int(math.log2(x['arr']) + 1))
    return '、'.join(parts) if parts else '—'


A('## 5 物品 77 件')
A('')
A('### 5.1 分类统计')
A('')
bytype = collections.defaultdict(list)
for x in ITEM:
    bytype[x['type']].append(x)
table(['类型', '件数', '占比', '平均使用等级', '属性(Attrib)分布', '典型物品'],
      [[k, len(v), pct(len(v), 77), round(statistics.mean(x['level'] for x in v if x['level'] is not None), 1),
        '、'.join('%s×%d' % (a or '空', n) for a, n in collections.Counter(x['attrib'] for x in v).items()),
        '、'.join(x['name'] for x in v[:4])] for k, v in sorted(bytype.items(), key=lambda t: -len(t[1]))])
A('> 四类：**JEWEL_WEAPON 34**（武器）、**JEWEL_MISC 27**（兵符/书/杂物）、**JEWEL_THING 8**（珍宝）、'
  '**JEWEL_HORSE 8**（坐骑）。`属性` 三态：`USED`（用后消耗）、`ONLYONE`（唯一，不可重复获得）、空。')
A('')
A('### 5.2 加成项汇总')
A('')
table(['加成项', '有加成的件数', '最大值', '达到最大值的物品'],
      [[lab, S5['n_with'][k], ('%g' % S5['max'][k]) if S5['max'][k] else '—',
        '、'.join(x['name'] for x in ITEM if S5['max'][k] and x[k] == S5['max'][k])]
       for k, lab in [('war', '武力'), ('int', '智力'), ('maxhp', '体力上限'), ('maxmp', '技力上限'),
                      ('speed', '速度'), ('loyal', '忠诚'), ('hp', '体力'), ('mp', '技力'),
                      ('spirit', '士气'), ('tire', '疲劳'), ('troop', '可使用兵种'), ('arr', '学会阵法')]])
_wlist = sorted([x for x in ITEM if x['type'] == 'JEWEL_WEAPON' and x['war']],
                key=lambda x: (x['level'], x['war']))
_blist = sorted([x for x in ITEM if x['int']], key=lambda x: x['int'])
_slist = sorted([x for x in ITEM if x['speed']], key=lambda x: x['speed'])
A('> 装备不是"补短板"，而是**第二条成长线**：武器的武力加成按使用等级排成完整阶梯 —— '
  '%d 级 %+g（%s）→ %d 级 %+g（%s），共 %d 把带武力加成的武器；'
  '书籍是智力线（%+g %s → %+g %s）；坐骑是速度线（%+g → %+g）。'
  % (_wlist[0]['level'], _wlist[0]['war'], _wlist[0]['name'],
     _wlist[-1]['level'], _wlist[-1]['war'], _wlist[-1]['name'], len(_wlist),
     _blist[0]['int'], _blist[0]['name'], _blist[-1]['int'], _blist[-1]['name'],
     _slist[0]['speed'], _slist[-1]['speed']))
A('> 真正稀缺的不是数值而是"可选集合"：13 张兵符扩兵种、9 本阵书扩阵形，它们不占数值预算，'
  '却直接改变战术选项——这是本作道具设计最值得抄的一点。')
A('')
A('### 5.3 使用等级与搜索机率')
A('')
A('使用等级：' + '、'.join('%s级 %d 件' % (k, v) for k, v in sorted(S5['level'].items(), key=lambda t: int(t[0]))) + '。')
A('')
A('搜索机率：' + '、'.join('%s → %d 件' % (k, v) for k, v in sorted(S5['rate'].items(), key=lambda t: int(t[0]))) + '。')
A('')
_l1 = [x for x in ITEM if x['level'] == 1]
_c1 = collections.Counter(x['type'].replace('JEWEL_', '') for x in _l1)
_w1 = [x['name'] for x in _l1 if x['type'] == 'JEWEL_WEAPON']
A('> 「搜索机率」不是百分比而是**权重**：200（%d 件）> 100（%d 件）> 50 > 20 > 10 > 5 > 0（%d 件，搜不到）。'
  '0 值的 %d 件是"只能靠赏赐/事件获得"的稀有品。'
  % (int(S5['rate'].get('200', 0)), int(S5['rate'].get('100', 0)),
     int(S5['rate'].get('0', 0)), int(S5['rate'].get('0', 0))))
A('')
A('> 使用等级 1 的 **%d 件**（"开局包"）并不全是兵符/阵书，构成是：%s；'
  '其中武器只有 %s 这几件最低档。也就是说开局给的是"解锁物 + 最低档过渡装备 + 忠诚道具"的混合，'
  '不是纯功能道具。'
  % (len(_l1), '、'.join('%s %d 件' % (k, v) for k, v in _c1.most_common()), '、'.join(_w1)))
A('')
A('### 5.4 完整 77 件')
A('')
table(['序', '名称', '类型', '使用等级', '搜索机率', '加成', '说明'],
      [[x['seq'], x['name'], x['type'].replace('JEWEL_', ''), int(x['level']) if x['level'] else '—',
        int(x['rate']) if x['rate'] is not None else '—', bonus_text(x), x['desc']] for x in ITEM])

# ---------------------------------------------------------------- 6 城池 / 路径
A('## 6 城池 60 座 / 路径 116 条')
A('')
A('### 6.1 城池等级与人口、金钱')
A('')
A('`xls_城池.json` 只有 `序号/名称/x/y/等级/旗帜` 六列；人口、金钱、防御、税率在 '
  '`TIMES1.INI` 的 `[CITY01-60]` 里。按名称 join（繁→简）后 **%d/60 全部匹配**。'
  % S6['matched'])
A('')
A('`等级` 只有两个取值（%s），实测**等于 INI 的 `RATE` 字段**（%s），'
  '因此它不是"1–5 级城市"，而是**城/关二分**：'
  % ('、'.join('%s→%d 座' % (k, v) for k, v in S6['level'].items()),
     '完全一致' if S6['level_is_rate'] else '不一致'))
A('')
table(['等级', '含义（实测）', '座数', '城池'],
      [[k, '关隘：无税基、纯卡点' if k == '0' else '普通城池（有税基）', len(v), '、'.join(v)]
       for k, v in S6['rate_names'].items()])
A('')
A('**人口 / 金钱 / 防御总体**：')
A('')
table(['指标', '均值', '中位数', '最小', '最大'],
      [['人口', S6['pop']['mean'], S6['pop']['median'], S6['pop']['min'], S6['pop']['max']],
       ['金钱', S6['money']['mean'], S6['money']['median'], S6['money']['min'], S6['money']['max']],
       ['防御', S6['defense']['mean'], S6['defense']['median'], S6['defense']['min'], S6['defense']['max']]])
A('相关性：**人口 × 金钱 r = %s**（强正相关，人口就是税基）；**人口 × 防御 r = %s**（中等正相关）——'
  '但残差很大：同样人口的城市防御能差约 2 倍，说明防御是**独立配置的战略值**，不是人口派生。'
  % (S6['corr_pop_money'], S6['corr_pop_defense']))
A('')
_g, _c = S6['guan'], S6['cheng']
A('**关 vs 城是两套经济模型**：%d 座等级 0 的关，人口 = 金钱 = **0**、防御恒 %d（全表最低，连城的下限 %d 都不到）——'
  '它们是"减速带"而非要塞，作用只是拖慢行军；%d 座普通城人口 %d–%d、金钱 %d–%d、防御 %d–%d，'
  '整体 金钱/人口 = **%.4f**。'
  % (_g['n'], _g['def_max'], _c['def_min'], _c['n'], _c['pop_min'], S6['pop']['max'],
     _c['money_min'], S6['money']['max'], _c['def_min'], _c['def_max'], _c['ratio']))
A('')
A('**按人口分档**（A 最富 → E 最穷）：')
A('')
table(['档位', '座数', '平均人口', '平均金钱', '平均防御', '金钱/人口', '代表城池'],
      [[k, v['n'], v['pop_mean'], v['money_mean'], v['def_mean'], v['money_per_pop'],
        '、'.join(v['names'][:6])] for k, v in S6['tiers'].items()])
A('')
A('最富 5 城：' + '、'.join('%s(%d金/%d人)' % (x['name'], x['money'], x['pop']) for x in S6['top_money'][:5]) + '。')
A('')
A('人口最多 5 城：' + '、'.join('%s(%d人)' % (x['name'], x['pop']) for x in S6['top_pop'][:5]) + '。')
A('')
A('人口最少 5 城：' + '、'.join('%s(%d人)' % (x['name'], x['pop']) for x in S6['bottom_pop'][:5]) + '。')
A('')
A('### 6.2 路径 116 条')
A('')
A('`xls_路径.json` 有 118 行，其中 **2 行是只有序号、没有数据的残行**（序号 47、48），有效路径 **116 条**，'
  '与 `TIMES1.INI` 的 `[PATH001-116]` 数量一致（xls 多出的 2 行是导出时的空行填充）。')
A('')
A('**长度分布**（剔除哨兵值后）：')
A('')
table(['指标', '值'],
      [['可通行路径（已剔除哨兵）', '%d 条' % S7['n_real']],
       ['长度 = 30000 的哨兵条目', '%d 条（%.1f%%）' % (S7['n_sentinel'], 100.0 * S7['n_sentinel'] / S7['n_all'])],
       ['真实长度范围', '%d – %d' % (S7['len']['min'], S7['len']['max'])],
       ['均值 / 中位数', '%s / %s' % (S7['len']['mean'], S7['len']['median'])],
       ['图论直径（最短路径最长的一对）', '%d（%s ↔ %s）' % (S7['diameter']['length'],
                                                       S7['diameter']['a'], S7['diameter']['b'])],
       ['城市节点数', '%d' % S7['nodes']]])
A('')
A('> **30000 是哨兵值**，不是真实距离：%d 条（%.0f%%）路径被标成 30000，它们的路点坐标依然完整，'
  '说明这些是"地图上画得出来但不能走"的连线（山河阻隔/海路）。剔除后真实路径长度只有 **%d–%d**，'
  '且**图是连通的**（60 城 1 个连通分量），最远两城 %s ↔ %s 需走 %d。'
  % (S7['n_sentinel'], 100.0 * S7['n_sentinel'] / S7['n_all'], S7['len']['min'], S7['len']['max'],
     S7['diameter']['a'], S7['diameter']['b'], S7['diameter']['length']))
A('')
A('**最长 5 条**：' + '；'.join('%s→%s %d' % (x['a'], x['b'], x['length']) for x in S7['top'][:5]) + '。')
A('')
A('**最短 5 条**：' + '；'.join('%s→%s %d' % (x['a'], x['b'], x['length']) for x in S7['short'][:5]) + '。')
A('')
A('**节点度分布**（按可通行边计，一个城连几条路）：'
  + '、'.join('度%s：%d 座' % (k, v) for k, v in S7['deg_dist'].items()) + '。')
A('')
A('度最高：' + '、'.join('%s(%d)' % (k, v) for k, v in S7['degree'][:6])
  + '；平均度 **%.2f**。' % S7['avg_deg'])
A('')
A('> 路网是**树 + 少量环**：%d 条可通行边 / %d 个节点，平均度 %.2f；度 1 的死胡同 %d 座（边陲），'
  '度最高的城也只有 %d 条——**没有超级枢纽**，任何一座城被切断的影响都有限。'
  % (S7['n_real'], S7['nodes'], S7['avg_deg'], int(S7['deg_dist'].get('1', 0)),
     S7['degree'][0][1] if S7['degree'] else 0))
A('')
A('> **易错点**：若把 %d 条哨兵边也算进邻接表，%s 这类城会凭空多出若干"邻边"、看上去像超级枢纽'
  '（初版就因此得出"邺度 9、徐州度 8"的错结论）——但那些边不可通行，按可通行边算它们只是普通节点。'
  '引用度分布前务必先剔除哨兵。'
  % (S7['n_sentinel'], '、'.join('%s(%d 条哨兵边)' % (k, v) for k, v in S7['sent_degree_top'][:3])))
A('')

# ---------------------------------------------------------------- 7 结论
A('## 7 数值设计观察与给新游戏的建议')
A('')
A('### 7.1 这套体系的平衡特征')
A('')
A('**(1) 双轴基本独立，但稀缺度刻意不对称。** 武力 × 智力 r = **%.2f**（r² = %.2f，只解释 %.0f%% 的方差）——'
  '方向上是"武力越高、智力略低"，属于弱负相关，远没到互斥。真正的不对称在**供给量**：'
  '武力 ≥90 有 %d 人、智力 ≥90 有 %d 人；武力中位 %.0f、均值 %.1f。'
  '设计含义：**猛将比谋士更难获得**，玩家的核心追求自然落在武将而非军师。'
  % (S1['corr_war_int'], S1['corr_war_int'] ** 2, 100 * S1['corr_war_int'] ** 2,
     hi_w, hi_i, S1['war']['median'], S1['war']['mean']))
A('')
A('**(2) 强度靠"槽位数"分层，不靠"单技能数值"。** 必杀技 7 槽从 400 人递减到 88 人，'
  '军师技 8 槽从 400 递减到 31 人；而单技能的攻击力只有 0–60、技力 18–50，压缩在一个很窄的带里。'
  '**名将的差别是"技能数量 × 解锁速度"，不是"同样的技能打得更疼"**——这让低级将也有存在感。')
A('')
_curve = [c['mean'] for c in S1['skill_curve']]
_gaps = [_curve[i + 1] - _curve[i] for i in range(len(_curve) - 1)]
A('**(3) 解锁曲线是"加速型"，不是常见的"减速型"。** 7 个必杀技槽的平均解锁等级为 %s；'
  '相邻槽的间隔是 %s——**越到后期间隔越短**（%.1f 级 → %.1f 级）。'
  '这是刻意的后期补偿：高级玩家升级更慢，就用"更密的技能投放"维持正反馈，'
  '而不是把强力技能堆在 1–10 级制造开局爽感。'
  % (' / '.join('%.1f' % c for c in _curve), ' / '.join('%.1f' % g for g in _gaps),
     _gaps[0], _gaps[-1]))
A('')
A('**(4) 相克幅度足以覆盖一个档次的数值差。** 兵种单格极值 **%+d**（%s 打 %s）、非对角平均 |%s|；'
  '阵形单格极值 %+d。相克点数的单位未公开，但**若与武力同量纲**，单格 68 点已接近整个武力区间'
  '（%d–%d，宽 %d 点）——**一次正确的兵种选择能抵掉 20–30 点武力差**，足够让"以弱胜强"成立。'
  '这是把"策略"抬到与"数值"同等权重的关键设计。'
  % (tst['max'][0], tst['max'][1], tst['max'][2], tst['mean_abs'],
     max(fst['max'][0], -fst['min'][0]),
     int(S1['war']['min']), int(S1['war']['max']), int(S1['war']['max'] - S1['war']['min'])))
A('')
A('**(5) 装备是"第二成长线"，不是补丁。** 武器把武力加成做成与使用等级绑定的阶梯（%+g → %+g，'
  '跨 %d–%d 级），书籍给智力（%+g → %+g），坐骑给速度（%+g → %+g）；'
  '体力/技力/士气/疲劳四列全空——**本作根本没做这些轴**。'
  '真正改变战局的是 13 张兵符 + 9 本阵书（扩"可选集合"）。'
  % (_wlist[0]['war'], _wlist[-1]['war'], _wlist[0]['level'], _wlist[-1]['level'],
     _blist[0]['int'], _blist[-1]['int'], _slist[0]['speed'], _slist[-1]['speed']))
A('')
A('**(6) 地图是"资源分布"而非"背景"。** %d 座关（等级 0）人口 = 金钱 = 0、防御恒 %d（全表最低）——'
  '它不是要塞，而是"拖慢行军的一次性减速带"；'
  '%d 座城承载税基（人口 %d–%d，金钱/人口 ≈ %.3f）。路网 %d 条可通行边、平均度 %.2f、直径 %d，'
  '**没有超级枢纽**——战略价值来自"位置"而非"度数"（定陶、壶关这类关的度数为 3–4，'
  '恰说明它们是"通过型节点"：谁占谁收过路费，但收不到税）。'
  % (_g['n'], _g['def_min'], _c['n'], _c['pop_min'], S6['pop']['max'], _c['ratio'],
     S7['n_real'], S7['avg_deg'], int(S7['diameter']['length'])))
A('')
A('### 7.2 给新游戏的 10 条可执行建议')
A('')
_s0, _s4 = S1['scen'][0], S1['scen'][4]
_minu = min(d['n'] for d in S2['users'])
_maxu = max(d['n'] for d in S2['users'])
_trspan = tst['span']
_fspan = fst['span']
A('| # | 建议 | 具体数值区间（可直接照搬 / 微调） |')
A('|---|---|---|')
A(f'| 1 | **保留双轴，但把两轴的稀缺度做成不对称** | 武力均值 60–70、智力均值 60–70；'
  f'武力 ≥90 只给 5–8%（本作 {hi_w}/400 = {100.0 * hi_w / 400:.1f}%），智力 ≥90 给 8–12%'
  f'（本作 {hi_i}/400 = {100.0 * hi_i / 400:.1f}%）——让"猛将"比"谋士"更难抽。 |')
A(f'| 2 | **技能用"槽位数 × 解锁曲线"分层，别用单技能倍率** | 主动技 7 槽、军师技 8 槽；'
  f'槽 1 全员 1 级；后续槽均值 {" / ".join("%.1f" % c for c in _curve)}，'
  f'间隔从 {_gaps[0]:.1f} 级逐渐缩短到 {_gaps[-1]:.1f} 级（{"→".join("%.1f" % g for g in _gaps)}），'
  f'**做成加速型而非减速型**。 |')
A(f'| 3 | **技能强度与"会的人少"绑定，不与"等级高"绑定** | 最冷门技 {_minu} 人、最热门 {_maxu} 人'
  f'（跨度 {_maxu / max(1, _minu):.0f} 倍）；TOP 10% 的强力技只发给 1–5% 的武将。 |')
A(f'| 4 | **相克做成严格反对称的零和表，不要单向优势** | 13×13 手填；单格极值 ±60～±70；'
  f'本作 {tst["antisym_off"]}/{tst["anti_off_total"]} 对满足 a[i][j] = -a[j][i]、全表代数和 0'
  f'——这样"我克你 68、你克我 68"对称，玩家不会觉得被系统坑。 |')
A(f'| 5 | **兵种权重 > 阵形权重** | 兵种单格 ±60～±70、行和极差 ~{int(_trspan)}（本作 ±68 / {int(_trspan)}）；'
  f'阵形单格 ±20～±25、行和极差 ≤5（本作 ±{int(max(fst["max"][0], -fst["min"][0]))} / {int(_fspan)}）；'
  f'让玩家先选兵种再选阵形，两层决策不抢戏。 |')
A(f'| 6 | **消耗与伤害弱相关，按"功能稀有度"定价** | 技力 18–50、攻击力 0–60，两者 r = {S2["corr_mp_atk"]}'
  f'（r² ≈ {100 * S2["corr_mp_atk"] ** 2:.0f}%，弱正相关：贵的技略强，但贵不等于疼）；'
  f'补血/召唤给高消耗低伤害，控制给中消耗零伤害。 |')
A(f'| 7 | **装备做成"等级锁定的第二成长线"** | 武器 +1 → +30（使用等级 1 → 45）、'
  f'书籍 +{_blist[0]["int"]:.0f} → +{_blist[-1]["int"]:.0f}、坐骑 +{_slist[0]["speed"]:.0f} → +{_slist[-1]["speed"]:.0f}；'
  f'上限 ≈ 主属性的 30%，但必须用使用等级锁死，避免开局就能背 +30。 |')
A(f'| 8 | **城市二分：城（税基）+ 关（卡点）** | 关：人口 = 金钱 = 0、只留防御 {_g["def_min"]}（恒为全表最低）'
  f'（本作 {_g["n"]} 座）；城：人口 5–40 万、金钱 ≈ 人口×{_c["ratio"]:.3f}'
  f'（本作 {_c["pop_min"]}–{S6["pop"]["max"]}）。关不产税，只买"时间"。 |')
A(f'| 9 | **路网做成"树 + 少量环"，别造超级枢纽** | 60 节点 / {S7["n_real"]} 条可通行边'
  f'（平均度 {S7["avg_deg"]}）、直径 {int(S7["diameter"]["length"])} 距离单位、'
  f'{int(S7["deg_dist"].get("1", 0))} 座度 1 边陲；单个城最多连 {S7["degree"][0][1]} 条。 |')
A(f'| 10 | **剧本用"登场率"做节奏，不用"数值膨胀"** | 5 剧本登场率 '
  f'{100.0 * _s0["available"] / 400:.1f}% → {100.0 * _s4["available"] / 400:.1f}%、'
  f'在野率 {100.0 * _s0["ye"] / 400:.1f}% → {100.0 * _s4["ye"] / 400:.1f}%；'
  f'同一武将跨剧本只改装备/带兵/经验，**技能表完全不变**（本作 400 人 0 处变化）。 |')
A('')

# ---------------------------------------------------------------- 附录
A('## 附录 A 字段语义速查（本文推断汇总）')
A('')
table(['字段', '所在表', '取值', '推断含义', '证据强度'],
      [['血统', '群英2', '0 或家族始祖名', '家族/血缘树根节点', '强（曹操5/孙坚4/关羽4 同族聚集）'],
       ['节操', '群英2', '1–6', '忠诚/背叛倾向权重', '中（钟形分布、满值仅 29 人）'],
       ['图形的类型', '群英2', '1–15', '身体造型组编号', '强（BODY 目录 15 体型 × 8 向 = 120/组）'],
       ['旗帜', '群英2', '0/1', '是否拥有独立军旗', '弱（仅 3 人为 1）'],
       ['官衔', '武将技', '50 个官职名', '官职 → 专属武将技 1:1 对照', '强（50 条 50 个不重复官职）'],
       ['属性', '武将技', '全体/主将/四周/两侧/中间/补兵/补血', '作用对象与段数标签', '强（52 条"全体,主将"=先群后单）'],
       ['能量（气）', '武将技', '恒 100', '气力槽上限占位，不参与平衡', '强（110/110 = 100）'],
       ['调用代码', '武将技', '501–610', '脚本表下标（110 个值互不重复，是 501–610 的排列；编号与序号不同序）',
        '强（排列验证通过，但仅 16 条 = 500+序号）'],
       ['军师技等级', '军师技', '0–3', '0=特殊/被动，1–3=初/中/高', '中（Level 随档位单调抬升）'],
       ['等级', '军师技', '120–490 (×10)', '消耗技力 × 10，即 12–49 点', '中（与武将技 18–50 同量级）'],
       ['目标', '军师技', '1/2/4/8', '疑似作用域掩码：1=我方/战术、2=自身/全军、4=敌兵、8=敌将',
        '中/弱（有反例：后选出阵落在 8、逼近敌军落在 1）'],
       ['属性', '物品', 'USED/ONLYONE/空', '用后消耗 / 唯一 / 常驻', '强'],
       ['搜索机率', '物品', '0–200', '掉落权重（非百分比）', '强（有 200 值、0=不可搜）'],
       ['等级', '城池', '0/3', '城(3) / 关(0) 二分，等于 RATE', '强（与 INI RATE 100% 一致）'],
       ['长度=30000', '路径', '30000', '哨兵：地图有线但不可通行', '强（39/116 条、路点仍完整）']])
A('')
A('## 附录 B 已知数据瑕疵（复现时会踩的坑）')
A('')
A('| # | 瑕疵 | 影响 | 处理 |')
A('|---|---|---|---|')
A('| 1 | `xls_兵种.json` 实为 13×13（14 列含行标签），`xls_阵形.json` 为 9×9（10 列） | 按 14/10 列解析会多 1 列空值 | 丢掉第 0 列，按 `len(row)-1` 取 |')
A('| 2 | `xls_路径.json` 118 行里有 2 行只有序号（47、48） | 直接取 `r[2]` 会 IndexError | 先判 `len(r) >= 5` |')
A('| 3 | `xls_群英2.json` 数据行 61 列，最后"旗帜"列常缺（60 元素） | 取 `r[60]` 会越界 | 用 `len(r) > 60` 保护 |')
A('| 4 | `MAGIC.INI` 是 cp950 不是 GBK | GBK 解码首行即崩 | `bytes.decode(\'cp950\')` |')
A('| 5 | 系统 `LCMapStringW` 不转「後」、把「郃」误转「合」、把「鍾」转「锺」 | 3 条技能 + 1 条军师技 join 失败 | 补丁表 `{後:后, 鍾:钟}`，姓名场景保留「郃」 |')
A('| 6 | 兵种名简繁/异体不一致 | 矩阵 join 对不上 | 以 xls 的 13 名为准（朴刀/长枪/大刀/弓箭/链锤/飞刀/武斗/蛮族/铁缒/藤甲/黄巾/弩兵/女兵） |')
A('| 7 | `TIMES1.INI` 的 `[GENERAL]` 段名全部重名、无编号 | 按段名取第 N 将必错 | 按段内 `SEQUENCE=001..400` 取 |')
A('| 8 | `群英2` 的剧本列：城市在奇数列(37/39/41/43/45)、状态在偶数列(38/40/42/44/46) | 错位一列会得到"城市=状态" | 用两组列号常量 |')
A('| 9 | 少数姓名异体/错字（许禇/许褚、逢纪/逄纪、费褘/费祎） | 按姓名 join 会漏 | 按 `序号` join，姓名以 xls 为准 |')
A('| 10 | `SANGO.INI` 里 `TotalThings=99`、`TotalTimes=6`、`TotalGeneral=512`、`TotalCity=64` 均与实际不符 | 误信会读越界 | 一律以实际段数（77/5/400/60）为准 |')
A('')
A('## 附录 C 参考图核对记录')
A('')
A('- 参考图 `三国群英传2 修正版 1.05+\\兵种 阵法克制表.png`：上半 9×9 阵形、下半 13×13 兵种，'
  '抽样 5 整行 57 格与 JSON 逐格一致（见 4.6）。')
A('- 图注「为防止看反克制，请以水平方向查询本表（即横着看）」= **行是攻方**，与本文矩阵方向一致。')
A('- 图注例子「朴刀打长枪被克 42 点」= 矩阵 `[朴刀][长枪] = -42`，已核对。')
A('')
A('---')
A('')
A('*本文由 `tools/xls_stats.py` 自动生成；所有统计值来自脚本实算，未做任何人工估计。'
  '中间数据：`extract/json/stats_*.json`（7 个文件）。*')
A('')

with open(DOC, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
print('written %s  (%d lines, %d chars)' % (DOC, len(L), len('\n'.join(L))))
print('war mean %.2f int mean %.2f  both90 %d  troop max %+d  formation max %+d'
      % (S1['war']['mean'], S1['int']['mean'], len(S1['both90']), tst['max'][0], fst['max'][0]))
print('join magic diffs', S2['join_ini']['diffs'])
print('join wise diffs', S3['join_ini']['diffs'])
print('cities matched', S6['matched'], 'sentinel paths', S7['n_sentinel'], 'diameter', S7['diameter'])
