import re, pathlib, collections
p = pathlib.Path(r'F:\sanguo\project\37a_逻辑对照.md')
lines = p.read_text(encoding='utf-8').splitlines()
rows = [l for l in lines if l.startswith('| R') and l.count('|') >= 5]
print('37a rows:', len(rows))
cnt = collections.Counter()
for l in rows:
    cells = [c.strip() for c in l.split('|')]
    # 找状态列：含 ✅/🟡/❌/⚠️
    stat = next((c for c in cells if any(k in c for k in ('✅','🟡','❌','⚠️'))), '?')
    for k in ('✅','🟡','❌','⚠️'):
        if k in stat: cnt[k]+=1; break
print(dict(cnt))
# 已修标记
fixed = sum(1 for l in rows if '已修' in l)
print('marked 已修:', fixed)
