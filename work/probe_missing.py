# -*- coding: utf-8 -*-
"""Broad scan: where are the 13 still-unexplained sfx names referenced?"""
import re, os

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
PAK = r'F:\sanguo\extract\pak'

TARGET = ['att01', 'att02', 'att03', 'att05', 'att06', 'att08',
          'bg07a', 'death3', 'defense2', 'flaysword', 'hit02', 'yell02', 'yell04']

raw = open(EXE, 'rb').read()
low = raw.lower()
print('=== exe: "ATT" occurrences ===')
for m in re.finditer(rb'att', low):
    i = m.start()
    ctx = raw[max(0, i - 12):i + 14]
    print('  0x%06X %r' % (i, ctx))

print('\n=== exe: exact-hit any target? ===')
for t in TARGET:
    i = low.find(t.encode())
    print('  %-10s %s' % (t, '0x%06X' % i if i >= 0 else '-'))

print('\n=== pak files: any target name (case-insens, ascii/utf8/big5) ===')
files = []
for root, dirs, fns in os.walk(PAK):
    for fn in fns:
        if fn.upper().endswith(('.INI', '.SO', '.IDX', '.TXT', '.JSON')):
            files.append(os.path.join(root, fn))
print('scanning %d files' % len(files))
for t in TARGET:
    pats = [t.encode(), t.upper().encode(), t.encode('utf-16-le')]
    hits = []
    for p in files:
        try:
            d = open(p, 'rb').read()
        except Exception:
            continue
        dl = d.lower()
        if t.encode().lower() in dl:
            hits.append(os.path.basename(p))
    print('  %-10s %s' % (t, hits or '-'))

print('\n=== magic.so: all 62 distinct sound names ===')
import collections
sraw = open(os.path.join(PAK, 'SCRIPT', 'MAGIC.SO'), 'rb').read()
wavs = {os.path.splitext(f)[0].lower() for f in os.listdir(os.path.join(PAK, 'SOUND'))}
got = collections.Counter()
for s in re.findall(rb'[\x20-\x7e]{3,40}', sraw):
    x = s.decode('ascii', 'ignore').strip().lower()
    if x in wavs:
        got[x] += 1
print(len(got), sorted(got))
