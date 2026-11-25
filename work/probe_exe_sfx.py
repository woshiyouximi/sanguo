# -*- coding: utf-8 -*-
"""Which sfx names appear as literals inside Sango2.exe (exe-side, not script-side)?"""
import re, os

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
SOUND = r'F:\sanguo\extract\pak\SOUND'

names = sorted(os.path.splitext(f)[0] for f in os.listdir(SOUND) if f.upper().endswith('.WAV'))
raw = open(EXE, 'rb').read()
print('exe bytes', len(raw))

found = {}
for n in names:
    # case-insensitive ascii search
    pat = n.encode('ascii')
    idx = raw.lower().find(pat.lower())
    if idx >= 0:
        found[n.lower()] = idx

print('exe literal hits: %d / %d' % (len(found), len(names)))
for k, v in sorted(found.items()):
    print('  %-12s @0x%X' % (k, v))

missing = sorted(set(x.lower() for x in names) - set(found))
print('\nnot in exe either:', missing)

# also show nearby strings for a couple of the UI ones
for probe in ('ACCEPT', 'ATT01', 'SILENCE', 'DEATH3', 'FLAYSWORD', 'YELL04'):
    i = raw.lower().find(probe.lower().encode())
    if i < 0:
        continue
    lo = max(0, i - 120)
    ctx = raw[lo:i + 120]
    strs = [s.decode('ascii', 'ignore') for s in re.findall(rb'[\x20-\x7e]{3,30}', ctx)]
    print('\n--', probe, 'ctx:', strs)
