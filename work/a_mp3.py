# -*- coding: utf-8 -*-
"""MP3 track inventory: duration via frame walk; projected sizes at several qualities."""
import glob, os, struct

MP3 = glob.glob(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\*\MP3\*.mp3')[0]
MP3 = os.path.dirname(MP3)

BR = {  # MPEG1 Layer3 bitrate table
    1: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    2: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
}
SR = {3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000]}


def mp3_info(path):
    d = open(path, 'rb').read()
    i = 0
    if d[:3] == b'ID3':
        sz = ((d[6] & 0x7f) << 21) | ((d[7] & 0x7f) << 14) | ((d[8] & 0x7f) << 7) | (d[9] & 0x7f)
        i = 10 + sz
    n = 0
    dur = 0.0
    sr = 0
    brk = 0
    while i + 4 <= len(d):
        h = struct.unpack('>I', d[i:i + 4])[0]
        if (h >> 21) & 0x7FF != 0x7FF:
            i += 1
            continue
        ver = (h >> 19) & 3
        layer = (h >> 17) & 3
        brx = (h >> 12) & 0xF
        srx = (h >> 10) & 3
        pad = (h >> 9) & 1
        if layer != 1 or ver == 1 or brx in (0, 15) or srx == 3:
            i += 1
            continue
        verkey = 3 if ver == 3 else (2 if ver == 2 else 0)
        br = BR[1 if ver == 3 else 2][brx] * 1000
        sr = SR[verkey][srx]
        n += 1
        if ver == 3:
            dur += 1152.0 / sr
            i += int(144 * br / sr) + pad
        else:
            dur += 576.0 / sr
            i += int(72 * br / sr) + pad
        brk = br
    return dur, sr, brk


rows = []
for p in sorted(glob.glob(os.path.join(MP3, '*.mp3'))):
    dur, sr, br = mp3_info(p)
    sz = os.path.getsize(p)
    rows.append((os.path.basename(p), sz, dur, sr, br))
print('track\tbytes\tdur_s\tsr\tkbps\t64k_mono\t48k_mono22\t128k_st')
for r in rows:
    print('%s\t%d\t%.1f\t%d\t%d\t%d\t%d\t%d' % (
        r[0], r[1], r[2], r[3], r[4] // 1000,
        int(r[2] * 8000), int(r[2] * 6000), int(r[2] * 16000)))
t = sum(r[2] for r in rows)
print('# n=%d total_bytes=%d total_dur=%.1fs (%.1f min)  @64kmono=%.2fMB @48kmono22=%.2fMB @128k=%.2fMB' % (
    len(rows), sum(r[1] for r in rows), t, t / 60, t * 8000 / 1048576, t * 6000 / 1048576, t * 16000 / 1048576))
