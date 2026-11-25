import json, sys
sys.stdout.reconfigure(encoding='utf-8')

ROOT = r'F:\sanguo'
def L(p):
    return json.load(open(ROOT + '\\' + p, encoding='utf-8'))

scen_game = L(r'game\data\scenarios.json')       # list of 5
gen_game = L(r'game\data\generals.json')          # list of 401 (dict-like rows)
if isinstance(gen_game, dict):
    gen_game = list(gen_game.values())

# index game generals by name
g_by_name = {}
for r in gen_game:
    n = r.get('NAME') or r.get('name')
    if n:
        g_by_name[n] = r

CITY_FIELDS = [
    ('king', 'KING'), ('major', 'MAJOR'), ('wise', 'WISE'),
    ('population', 'POPULATION'), ('defense', 'DEFENSE'), ('money', 'MONEY'),
    ('pos', 'POS'), ('flag_pos', 'FLAGPOS'), ('rate', 'RATE'), ('flags', 'FLAGS'),
]
GEN_FIELDS = [
    ('face', 'FACE'), ('str', 'STR'), ('int', 'INT'), ('base_hp', 'BaseHP'),
    ('base_mp', 'BaseMP'), ('base_exp', 'BaseEXP'), ('loyal', 'Loyal'),
    ('blood', 'BLOOD'), ('constancy', 'CONSTANCY'), ('type', 'TYPE'),
    ('weapon', 'Weapon'), ('horse', 'Horse'), ('thing', 'Thing'),
    ('use_battle_array', 'UseBattleArray'), ('use_force', 'UseForce'),
    ('status', 'Status'), ('city', 'CITY'),
]

total = 0
for i in range(5):
    ex = L(r'extract\json\times%d.json' % (i + 1))
    gm = scen_game[i]
    gcity = {c['NAME']: c for c in gm['cities']}
    ecity = {c['name']: c for c in ex['cities']}

    miss = set(ecity) ^ set(gcity)
    rows = []
    field_bad = {}
    for name, ec in ecity.items():
        gc = gcity.get(name)
        if not gc:
            continue
        for ek, gk in CITY_FIELDS:
            a = ec.get(ek)
            b = gc.get(gk)
            if ek in ('pos', 'flag_pos'):
                a = list(a) if a is not None else a
                b = list(b) if b is not None else b
            same = (str(a) == str(b)) if not isinstance(a, (int, float)) or not isinstance(b, (int, float)) else (float(a) == float(b))
            if not same:
                field_bad.setdefault(ek, []).append((name, a, b))

    # 势力（kings）
    kings_bad = []
    gk = {k.get('NAME') or k.get('name'): k for k in (gm.get('kings') or [])}
    for ek in ex['kings']:
        g = gk.get(ek['name'])
        if not g:
            kings_bad.append((ek['name'], 'MISSING', None))
            continue
        for a_key, b_key in (('flag_num', 'FLAGNUM'), ('select', 'SELECT'), ('type', 'TYPE')):
            pass
        # game kings rows only keep limited fields; compare what exists
        for a_key, b_key in (('flag_num', 'flag_num'), ('select', 'select'), ('type', 'type')):
            if b_key in g and g.get(b_key) != ek.get(a_key):
                kings_bad.append((ek['name'], a_key, (g.get(b_key), ek.get(a_key))))

    # 道路
    ep = [(p['start'], p['end'], p['length']) for p in ex['paths']]
    gp = [(p['Start'], p['End'], p['Length']) for p in gm['paths']]
    set_e = set(ep); set_g = set(gp)
    path_only_e = sorted(set_e - set_g)
    path_only_g = sorted(set_g - set_e)

    # 武将（用 times 里的武将行）
    gen_bad = {}
    for eg in ex['generals']:
        n = eg['name']
        gg = g_by_name.get(n)
        if not gg:
            gen_bad.setdefault('MISSING', []).append(n)
            continue
        for ek, gk2 in GEN_FIELDS:
            a = eg.get(ek)
            b = gg.get(gk2)
            if ek == 'face':
                a = str(a or '').replace('\\', '/')
                b = str(b or '').replace('\\', '/')
            def norm(x):
                if isinstance(x, list):
                    return '|'.join(str(t) for t in x)
                return '' if x is None else str(x)
            if norm(a) != norm(b):
                gen_bad.setdefault(ek, []).append((n, a, b))

    print('=' * 70)
    print('scenario', i + 1, gm.get('name'), 'cities', len(gcity), 'vs', len(ecity), 'name-diff', len(miss))
    for k, v in field_bad.items():
        print('  CITY.%s 不一致 %d 例: %s' % (k, len(v), v[:3]))
    print('  KINGS 不一致: %d %s' % (len(kings_bad), kings_bad[:4]))
    print('  PATHS only-extract %d only-game %d' % (len(path_only_e), len(path_only_g)))
    if path_only_e[:2]: print('    e-only', path_only_e[:3])
    if path_only_g[:2]: print('    g-only', path_only_g[:3])
    for k, v in gen_bad.items():
        print('  GEN.%s 不一致 %d 例: %s' % (k, len(v), v[:3]))
    total += sum(len(v) for v in field_bad.values()) + sum(len(v) for v in gen_bad.values())
print('TOTAL mismatched cells (cities+generals):', total)
