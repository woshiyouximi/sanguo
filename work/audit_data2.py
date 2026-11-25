import json, sys
sys.stdout.reconfigure(encoding='utf-8')
ROOT = r'F:\sanguo'
def L(p): return json.load(open(ROOT + '\\' + p, encoding='utf-8'))

scen = L(r'game\data\scenarios.json')
gen = L(r'game\data\generals.json')
g_by = {r['NAME']: r for r in gen}

# 1) 每剧本 status/city/pos（game 存成 *_by_times 数组）
per = {}
for i in range(5):
    ex = L(r'extract\json\times%d.json' % (i + 1))
    bad = {'status': [], 'city': [], 'pos': [], 'base_exp': [], 'blood': [], 'loyal': [], 'str': [], 'int': []}
    for eg in ex['generals']:
        n = eg['name']; gg = g_by.get(n)
        if not gg:
            bad.setdefault('missing', []).append(n); continue
        def arr(key):
            v = gg.get(key); return v if isinstance(v, list) else []
        st = arr('status_by_times'); ct = arr('city_by_times'); ps = arr('pos_by_times')
        if len(st) >= 5 and st[i] != eg.get('status'):
            bad['status'].append((n, eg.get('status'), st[i]))
        if len(ct) >= 5 and (ct[i] or '') != (eg.get('city') or ''):
            bad['city'].append((n, eg.get('city'), ct[i]))
        if len(ps) >= 5:
            a = eg.get('pos') or []
            b = ps[i] or []
            if [str(x) for x in a] != [str(x) for x in b]:
                bad['pos'].append((n, a, b))
        # BaseEXP 只有 times1 存在 generals.json
        if i == 0:
            for k in ('base_exp', 'loyal', 'str', 'int'):
                if str(eg.get(k)) != str(gg.get({'base_exp': 'BaseEXP', 'loyal': 'Loyal', 'str': 'STR', 'int': 'INT'}[k])):
                    bad[k].append((n, eg.get(k), gg.get({'base_exp': 'BaseEXP', 'loyal': 'Loyal', 'str': 'STR', 'int': 'INT'}[k])))
        if i == 3 and n == '孫尚香':
            bad['blood'].append((n, eg.get('blood'), gg.get('BLOOD')))
    per[i + 1] = bad
    print('scen', i + 1, {k: len(v) for k, v in bad.items() if v})

# 2) 兵种/武器（times1）
ex1 = L(r'extract\json\times1.json')
bad_force, bad_weapon, bad_horse = [], [], []
for eg in ex1['generals']:
    gg = g_by[eg['name']]
    gf = gg.get('UseForce')
    ef = eg.get('use_force')
    gf_s = gf[0] if isinstance(gf, list) and len(gf) == 1 else ('|'.join(gf) if isinstance(gf, list) else gf)
    if (ef or '') != (gf_s or ''):
        bad_force.append((eg['name'], ef, gf))
    if (eg.get('weapon') or '') != (str(gg.get('Weapon') or '')):
        bad_weapon.append((eg['name'], eg.get('weapon'), gg.get('Weapon')))
    if (eg.get('horse') or '') != (str(gg.get('Horse') or '')):
        bad_horse.append((eg['name'], eg.get('horse'), gg.get('Horse')))
print('times1 UseForce diff', len(bad_force), bad_force[:6])
print('times1 Weapon diff', len(bad_weapon), bad_weapon[:6])
print('times1 Horse diff', len(bad_horse), bad_horse[:6])
print('game generals fields', sorted(g_by['劉備'].keys()))
