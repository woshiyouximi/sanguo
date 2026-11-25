# -*- coding: utf-8 -*-
"""Collect every $sound token from THINGS.INI plus a few INI context records."""
import re, os, io, collections

INI = r'F:\sanguo\extract\pak\THINGS.INI'
lines = io.open(INI, encoding='cp950', errors='replace').read().splitlines()

tok = re.compile(r'\$([A-Za-z0-9_]+)')
hits = collections.defaultdict(list)   # name -> [(lineno, section, key, line)]
section = ''
key = ''
for i, ln in enumerate(lines, 1):
    s = ln.strip()
    m = re.match(r'^\[(.+?)\]', s)
    if m:
        section = m.group(1)
        continue
    m = re.match(r'^([A-Za-z0-9_]+)\s*=', s)
    if m:
        key = m.group(1)
    for t in tok.findall(ln):
        hits[t].append((i, section, key, s[:110]))

print('distinct $tokens =', len(hits))
for name in sorted(hits):
    recs = hits[name]
    secs = collections.Counter(r[1] for r in recs)
    keys = collections.Counter(r[2] for r in recs)
    print('%-14s n=%-3d secs=%s keys=%s ex=L%d %s' % (
        name, len(recs),
        ','.join('%s:%d' % kv for kv in secs.most_common(4)),
        ','.join('%s:%d' % kv for kv in keys.most_common(4)),
        recs[0][0], recs[0][3]))
