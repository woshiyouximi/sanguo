# -*- coding: utf-8 -*-
"""Look for dynamic sfx name construction in the exe, and SYSTEM.SO sound contexts."""
import re, os

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'
SYS = r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO'
SOUND = r'F:\sanguo\extract\pak\SOUND'

raw = open(EXE, 'rb').read()
strs = [(m.start(), m.group().decode('ascii', 'ignore')) for m in re.finditer(rb'[\x20-\x7e]{3,48}', raw)]

print('=== exe strings containing WAV / SOUND / ATT / %d ===')
for off, s in strs:
    if re.search(r'WAV|SOUND|\.wav|\bATT|%0?2d|snd|SND', s):
        print('  0x%06X %r' % (off, s))

print('\n=== exe strings near 0x843F0 (ACCEPT table) ===')
for off, s in strs:
    if 0x84200 <= off <= 0x84600:
        print('  0x%06X %r' % (off, s))

# ---------------------------------------------------------------- SYSTEM.SO
wavs = {os.path.splitext(f)[0].lower() for f in os.listdir(SOUND)}
sraw = open(SYS, 'rb').read()
sstrs = [(m.start(), m.group().decode('ascii', 'ignore')) for m in re.finditer(rb'[\x20-\x7e]{3,60}', sraw)]
print('\n=== SYSTEM.SO sound literals with context ===')
for i, (off, s) in enumerate(sstrs):
    if s.strip().lower() in wavs:
        ctx = [x[1] for x in sstrs[max(0, i - 3):i + 4]]
        print('  0x%05X %-12s ctx=%s' % (off, s, ctx))
