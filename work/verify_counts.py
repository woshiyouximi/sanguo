import re, json, glob, os
t = open(r'F:\sanguo\extract\pak\TIMES1.INI','rb').read().decode('cp950')
secs = re.findall(r'^\[([^\]]+)\]', t, re.M)
import collections
c = collections.Counter(re.sub(r'\d+$','',s) for s in secs)
print('TIMES1 sections', len(secs), dict(c))
print('KING ids', [s for s in secs if s.startswith('KING')][:20], '... max', max(int(s[4:]) for s in secs if s.startswith('KING')))
d = json.load(open(r'F:\sanguo\extract\json\things.json', encoding='utf-8'))
print('things keys', list(d.keys())[:12])
defn = d.get('defines') or d.get('define')
print('defines type', type(defn), list(defn.keys())[:10] if isinstance(defn, dict) else len(defn))
for k, v in (defn.items() if isinstance(defn, dict) else []):
    print('  ', k, type(v).__name__, len(v) if hasattr(v,'__len__') else v)
