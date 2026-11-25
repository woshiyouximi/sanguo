# -*- coding: utf-8 -*-
"""THINGS.INI 造型/动画全量解析：产出 work/things_parsed.json + 控制台报告分片。"""
import sys, os, re, json, collections

sys.path.insert(0, r'F:\sanguo\tools')
import parse_ini as P

PAK  = r'F:\sanguo\extract\pak'
SHAPE= os.path.join(PAK, 'SHAPE')
OUT  = r'F:\sanguo\work'

ACTIONS = ('First', 'Wait', 'Walk', 'Attack', 'Attack2', 'Attack3', 'Attack4',
           'Attack5', 'Attack6', 'Attack7', 'Attack8', 'Defense', 'Pain',
           'Death', 'Win', 'Lose', 'Spell1', 'Spell2', 'Shot1', 'Shot2', 'Shot3')

ini = P.IniFile.load(os.path.join(PAK, 'THINGS.INI'))

# ---------- [DEFINE] 常量表 ----------
define = {}
for k, v, ln in ini.get('DEFINE').fields:
    v = v.strip()
    if v:
        define[k] = v
CONST = {}
for k, v in define.items():
    try:
        CONST[k] = int(v, 16) if v.lower().startswith('0x') else int(v)
    except ValueError:
        CONST[k] = v

PROC = {v: k for k, v in CONST.items() if k.endswith('Process')}
TYPE = {v: k for k, v in CONST.items() if k.startswith('TYPE_')}

# ---------- SHAPE 文件索引（大小写不敏感） ----------
index = {}          # upper(relpath-without-ext) -> relpath
for root, dirs, files in os.walk(SHAPE):
    for fn in files:
        rel = os.path.relpath(os.path.join(root, fn), SHAPE)
        key = rel.upper().replace('/', '\\')
        index[key] = rel
        index[os.path.splitext(key)[0]] = rel   # 同时登记无扩展名键

def resolve(directory, stem):
    d = directory.replace('/', '\\').strip('\\')
    for cand in (f'{d}\\{stem}' if d else stem, stem):
        for key in (cand.upper(), (cand + '.SHP').upper()):
            hit = index.get(key)
            if hit:
                return hit
    return None

# ---------- 解析一条动作值 ----------
RE_DELAY = re.compile(r'^#\s*(-?\d+)$')
def parse_action(value):
    """返回 dict: default_delay, frames[list of dict], tail"""
    toks = [t.strip() for t in value.split(',')]
    rec = {'default_delay': None, 'frames': [], 'events': [], 'refs': [],
           'end': False, 'raw': value, 'n_files': 0}
    cur = None
    for t in toks:
        if not t:
            continue
        if t.upper() == 'SCROVER':
            rec['end'] = True
            continue
        m = RE_DELAY.match(t)
        if m:
            n = int(m.group(1))
            if cur is None or rec['default_delay'] is None:
                if cur is None and rec['default_delay'] is None:
                    rec['default_delay'] = n
                else:
                    cur['delay'] = n
            else:
                cur['delay'] = n
            continue
        if t.startswith('@%'):
            rec['events'].append(t[2:])
            if cur is not None:
                cur['after_event'] = t[2:]
            continue
        if t.startswith('$'):
            rec['refs'].append(t[1:])
            continue
        if re.match(r'^\d+$', t):
            rec['numeric'] = int(t)
            continue
        cur = {'shape': t, 'delay': None}
        rec['frames'].append(cur)
        rec['n_files'] += 1
    return rec

# ---------- 遍历 620 个 OBJECT ----------
objs = []
for i, s in enumerate(ini.all('OBJECT')):
    rec = {
        'ord': i,                       # 0-based 出现顺序
        'lineno': s.lineno,
        'name': s.get('Name'),
        'sequence': s.num('Sequence'),
        'type_raw': s.get('Type'),
        'type_name': TYPE.get(s.num('Type'), None) if s.get('Type') else None,
        'space': s.get('Space'),
        'process_raw': s.get('Process'),
        'process_name': PROC.get(s.num('Process'), None) if s.get('Process') else None,
        'flags_raw': s.get('Flags') if s.get('Flags') is not None else s.get('FLAGS'),
        'flags_key': 'Flags' if s.get('Flags') is not None else ('FLAGS' if s.get('FLAGS') is not None else None),
        'directory': s.get('Directory'),
        'actions': {},
        'missing': [],
        'other_keys': [],
    }
    for k, v, ln in s.fields:
        if k in ACTIONS:
            a = parse_action(v)
            a['lineno'] = ln
            rec['actions'][k] = a
    objs.append(rec)

# 解析文件、统计缺失
for rec in objs:
    d = rec['directory'] or ''
    for an, a in rec['actions'].items():
        for fr in a['frames']:
            hit = resolve(d, fr['shape'])
            fr['file'] = hit
            if hit is None:
                rec['missing'].append(f'{an}:{fr["shape"]}')

json.dump({'define': define, 'objects': objs}, open(os.path.join(OUT, 'things_parsed.json'), 'w',
          encoding='utf-8'), ensure_ascii=False, indent=1)

print('objects=%d  total_actions=%d  total_frames=%d' % (
    len(objs), sum(len(o['actions']) for o in objs),
    sum(a['n_files'] for o in objs for a in o['actions'].values())))

# ---------- 报告 1：字段与取值 ----------
print('\n=== 动作字段覆盖 ===')
for a in ACTIONS:
    n = sum(1 for o in objs if a in o['actions'])
    fr = sum(o['actions'][a]['n_files'] for o in objs if a in o['actions'])
    dl = [o['actions'][a]['default_delay'] for o in objs if a in o['actions']]
    dlv = collections.Counter(dl)
    print('  %-9s objects=%-4d frames=%-5d default_delay 常见=%s' % (
        a, n, fr, dlv.most_common(4)))

print('\n=== 缺失文件统计 ===')
miss = collections.Counter()
for o in objs:
    for m in o['missing']:
        miss[m.split(':')[1]] += 1
print('  缺失条目 %d 个，去重文件名 %d 个' % (sum(miss.values()), len(miss)))
for k, v in miss.most_common(20):
    print('   %-18s x%d' % (k, v))

print('\n=== Sequence 分布 ===')
seqs = collections.Counter(o['sequence'] for o in objs)
sv=[x for x in seqs if x is not None]
print('  不同值 %d 个；None 段数 %d；最小 %s 最大 %s'%(len(seqs),seqs.get(None,0),min(sv),max(sv)))
print('  前 20:', seqs.most_common(20))

print('\n=== 目录 × 对象数 × 引用文件数 ===')
bycat = collections.defaultdict(lambda: [0, 0, set()])
for o in objs:
    d = (o['directory'] or '').replace('/', '\\').strip('\\')
    key = d.upper()
    bycat[key][0] += 1
    bycat[key][1] += sum(a['n_files'] for a in o['actions'].values())
    for a in o['actions'].values():
        for fr in a['frames']:
            if fr['file']:
                bycat[key][2].add(fr['file'])
for k in sorted(bycat, key=lambda x: -bycat[x][0]):
    n, f, fs = bycat[k]
    print('  %-18s objects=%-4d frames=%-5d distinct_files=%-4d' % (k, n, f, len(fs)))
