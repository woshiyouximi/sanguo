import sys, csv, pathlib, subprocess
sys.path.insert(0, r'F:\sanguo\cloud')
import make_jobs as m

# 1) 用新逻辑重新生成 400 行
out_new = pathlib.Path(r'F:\sanguo\cloud\jobs_heroes400_v2.csv')
old_csv = pathlib.Path(r'F:\sanguo\cloud\jobs_heroes400.csv')

# 复用 make_jobs 的 main 不易，这里直接比对 derive_look 的兵器字段
old = {r['id']: r['prompt'] for r in csv.DictReader(open(old_csv, encoding='utf-8-sig'))}
print('old rows', len(old))

# 需要知道每人的 arch：用 make_jobs 的 hero_prompt 接口重算
import importlib
importlib.reload(m)
changed = []
for i, (hid, prompt) in enumerate(old.items()):
    pass

# 直接比较：把 derive_look 的 prop 从 prompt 里抽出来（"手持XXX"）
import re
def prop_of(p):
    mo = re.search(r'手持([^，。]+)', p)
    return mo.group(1) if mo else ''

# 读武将的 arch
g = __import__('json').load(open(r'F:\sanguo\data\generals.json', encoding='utf-8'))
arch_of = {x['NAME']: m.archetype(x['STR'], x['INT']) for x in g if x['NAME'] != '盜賊'}
print('sample arch', list(arch_of.items())[:3])
