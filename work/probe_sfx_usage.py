# -*- coding: utf-8 -*-
"""Probe which of the 99 SOUND/*.WAV files are actually referenced by the original data.

Sources of evidence:
  1. THINGS.INI  -- `$name` tokens inside animation sequences.
  2. SCRIPT/MAGIC.SO, SYSTEM.SO -- SmartScript string literals (PUSHS "m016snd01").
"""
import re, collections, os, json

PAK = r'F:\sanguo\extract\pak'
SOUND = os.path.join(PAK, 'SOUND')
SCRIPT = os.path.join(PAK, 'SCRIPT')


def decode(raw):
    for enc in ('big5', 'gbk', 'latin1'):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('latin1')


wavs = sorted(f for f in os.listdir(SOUND) if f.upper().endswith('.WAV'))
names = {os.path.splitext(f)[0].lower(): f for f in wavs}
print('WAV count:', len(wavs))

# ---------------------------------------------------------------- THINGS.INI
t = decode(open(os.path.join(PAK, 'THINGS.INI'), 'rb').read())
toks = re.findall(r'\$([A-Za-z0-9_]+)', t)
c = collections.Counter(x.lower() for x in toks)
print('\n[THINGS.INI] $ tokens: distinct=%d total=%d' % (len(c), sum(c.values())))
for k, v in c.most_common():
    print('   %-14s %4d  %s' % (k, v, 'OK' if k in names else 'NO SUCH WAV'))
hit_things = {k: v for k, v in c.items() if k in names}
print('matched wav:', len(hit_things))

# ---------------------------------------------------------------- script .SO
print('\n[SCRIPT] sound literals')
snd_re = re.compile(rb'([A-Za-z][A-Za-z0-9_]{2,20})')
script_refs = collections.Counter()
per_file = {}
for fn in ('MAGIC.SO', 'SYSTEM.SO'):
    p = os.path.join(SCRIPT, fn)
    if not os.path.exists(p):
        continue
    raw = open(p, 'rb').read()
    # printable ASCII strings
    strs = re.findall(rb'[\x20-\x7e]{4,40}', raw)
    got = collections.Counter()
    for s in strs:
        s2 = s.decode('ascii', 'ignore').strip().lower()
        if s2 in names:
            got[s2] += 1
    per_file[fn] = got
    script_refs.update(got)
    print('  %-12s %d distinct, %d refs' % (fn, len(got), sum(got.values())))
    for k, v in got.most_common(8):
        print('     %-16s %d' % (k, v))
print('  union distinct wav referenced by scripts:', len(script_refs))

# ---------------------------------------------------------------- coverage
allref = collections.Counter()
allref.update({k: v for k, v in hit_things.items()})
for k, v in script_refs.items():
    allref[k] += v
unreferenced = sorted(set(names) - set(allref))
print('\n==== COVERAGE ====')
print('referenced WAV: %d / %d' % (len(allref), len(names)))
print('unreferenced  : %d' % len(unreferenced))
print(unreferenced)
print('\nreferenced detail:')
for k, v in sorted(allref.items(), key=lambda kv: (-kv[1], kv[0])):
    print('  %-14s %3d' % (k, v))

json.dump({'things': dict(hit_things), 'script': dict(script_refs),
           'all': dict(allref), 'unreferenced': unreferenced, 'names': sorted(names)},
          open(r'F:\sanguo\work\sfx_usage.json', 'w', encoding='utf-8'),
          ensure_ascii=False, indent=1)
print('\nwrote F:\\sanguo\\work\\sfx_usage.json')
