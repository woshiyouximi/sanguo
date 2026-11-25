# -*- coding: utf-8 -*-
"""统计 SANGO.INI [ITEM] 段的 SearchType / Attrib / TYPE / Rate 分布"""
import io, re, collections

P = r"F:\sanguo\extract\pak\SANGO.INI"
txt = io.open(P, 'rb').read().decode('cp950', 'replace')
lines = txt.splitlines()

items = []
cur = None
for ln in lines:
    s = ln.strip()
    if s.upper().startswith('['):
        if cur is not None and 'Sequence' in cur:
            items.append(cur)
        cur = {} if s.upper() == '[ITEM]' else None
        continue
    if cur is None:
        continue
    m = re.match(r'^([A-Za-z_]+)\s*=\s*(.*)$', s)
    if m:
        cur[m.group(1)] = m.group(2).strip()
if cur is not None and 'Sequence' in cur:
    items.append(cur)

print('items =', len(items))
for key in ('SearchType', 'Attrib', 'TYPE'):
    c = collections.Counter(it.get(key, '') for it in items)
    print('%s: %s' % (key, dict(c)))

print('\n--- rows (Seq, Attrib, TYPE, SearchType, Rate) ---')
for it in items:
    print('%3s  %-8s %-14s ST=%-2s Rate=%-4s' % (
        it.get('Sequence', '?'), it.get('Attrib', ''), it.get('TYPE', '').replace('JEWEL_', ''),
        it.get('SearchType', ''), it.get('Rate', '')))
