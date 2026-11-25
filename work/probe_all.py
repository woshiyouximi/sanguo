# -*- coding: utf-8 -*-
"""One-shot probe: mp3 headers, wav formats, magic id mapping, stray token contexts."""
import os, re, json, struct

SOUND = r'F:\sanguo\extract\pak\SOUND'
MP3 = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\MP3'

BR = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
SR = {0: [11025, 12000, 8000], 1: [0, 0, 0], 2: [22050, 24000, 16000], 3: [44100, 48000, 32000]}


def mp3_info(path):
    d = open(path, 'rb').read(200000)
    i = 0
    if d[:3] == b'ID3':
        sz = ((d[6] & 0x7f) << 21) | ((d[7] & 0x7f) << 14) | ((d[8] & 0x7f) << 7) | (d[9] & 0x7f)
        i = 10 + sz
    while i < len(d) - 4:
        if d[i] == 0xFF and (d[i + 1] & 0xE0) == 0xE0:
            ver = (d[i + 1] >> 3) & 3      # 3=MPEG1
            layer = (d[i + 1] >> 1) & 3
            bri = (d[i + 2] >> 4) & 15
            sri = (d[i + 2] >> 2) & 3
            mode = (d[i + 3] >> 6) & 3
            return dict(ver=ver, layer=layer, kbps=BR[bri], rate=SR.get(ver, [0])[sri],
                        ch='mono' if mode == 3 else 'stereo', off=i)
        i += 1
    return None


print('=== MP3 BGM ===')
tot = 0
rows = []
for n in range(1, 18):
    p = os.path.join(MP3, '%02d.mp3' % n)
    sz = os.path.getsize(p)
    tot += sz
    inf = mp3_info(p)
    rows.append((n, sz, inf))
    print('  %02d.mp3 %8.2f MB  %s' % (n, sz / 1048576, inf))
print('  total %.2f MB' % (tot / 1048576))

print('\n=== WAV formats ===')
import wave
fmt = {}
dur = 0.0
for f in sorted(os.listdir(SOUND)):
    if not f.upper().endswith('.WAV'):
        continue
    w = wave.open(os.path.join(SOUND, f), 'rb')
    k = (w.getnchannels(), w.getframerate(), w.getsampwidth())
    fmt[k] = fmt.get(k, 0) + 1
    dur += w.getnframes() / w.getframerate()
    w.close()
print('  formats:', fmt)
print('  total duration %.1f s (%.2f min)' % (dur, dur / 60))

print('\n=== magic id -> name (fx_dir_primary) ===')
mg = json.load(open(r'F:\sanguo\data\magics.json', encoding='utf-8'))
by = {}
for r in mg:
    fd = r.get('fx_dir_primary')
    if fd:
        by.setdefault(fd, []).append((r['SEQUENCE'], r['NAME']))
snds = sorted({f[:-4].lower() for f in os.listdir(SOUND) if f.upper().startswith('M')
               and 'SND' in f.upper()})
print('  %-12s %s' % ('snd', 'magics sharing that fx_dir'))
for s in snds:
    m = re.match(r'm(\d{3})snd', s)
    if not m:
        continue
    key = m.group(1)
    print('  %-12s %s' % (s, by.get(key, ['-- no fx_dir match --'])))

print('\n=== stray contexts ===')
t = open(r'F:\sanguo\extract\pak\THINGS.INI', 'rb').read().decode('big5', 'replace')
for m in re.finditer(r'(hit02|HIT02)', t):
    print('  THINGS.INI:', repr(t[max(0, m.start() - 60):m.start() + 20]))
s = open(r'F:\sanguo\extract\pak\SANGO.INI', 'rb').read().decode('big5', 'replace')
for m in re.finditer(r'(?i)bg07a', s):
    print('  SANGO.INI :', repr(s[max(0, m.start() - 80):m.start() + 30]))
