import pathlib, re
lines = pathlib.Path(r'F:\sanguo\project\37a_逻辑对照.md').read_text(encoding='utf-8').splitlines()
bad, warn = [], []
for l in lines:
    if not l.startswith('| R'): continue
    cells = [c.strip() for c in l.split('|')]
    rid = cells[1]
    sysname = cells[2]
    stat = next((c for c in cells if any(k in c for k in ('✅','🟡','❌','⚠️'))), '?')
    if '❌' in stat: bad.append((rid, sysname))
    if '⚠️' in stat: warn.append((rid, sysname))
print('❌ 未做:', len(bad))
for r in bad: print('  ', r[0], r[1])
print('⚠️ 未验证:', len(warn))
for r in warn: print('  ', r[0], r[1])
