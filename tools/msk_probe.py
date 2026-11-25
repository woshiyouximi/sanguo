"""试各种 RLE 变体，看哪种正好解码出 640x480 且耗尽文件。"""
import struct, os, sys

ROOT = r'F:\sanguo\extract\pak\SHAPE\MAP'
F = 'CHINAMAP1.MSK'


def load(f=F):
    return open(os.path.join(ROOT, f), 'rb').read()


def try_pcx(data, w, h, start=16):
    """PCX-style: byte >= 0xC0 -> run of (b & 0x3F), next byte value."""
    p = start
    out = bytearray()
    n = len(data)
    while p < n and len(out) < w * h:
        b = data[p]
        p += 1
        if b >= 0xC0:
            cnt = b & 0x3F
            if p >= n:
                break
            v = data[p]
            p += 1
            out += bytes([v]) * cnt
        else:
            out.append(b)
    return len(out), p, out


def try_pcx_hi(data, w, h, start=16, thr=0x80, mask=0x7F):
    p = start
    out = bytearray()
    n = len(data)
    while p < n and len(out) < w * h:
        b = data[p]
        p += 1
        if b >= thr:
            cnt = b & mask
            v = data[p]
            p += 1
            out += bytes([v]) * cnt
        else:
            out.append(b)
    return len(out), p, out


def try_pairs(data, w, h, start=16, order='cv'):
    p = start
    out = bytearray()
    n = len(data)
    while p + 1 < n and len(out) < w * h:
        a, b = data[p], data[p + 1]
        p += 2
        cnt, v = (a, b) if order == 'cv' else (b, a)
        out += bytes([v]) * cnt
    return len(out), p, out


def main():
    d = load()
    W, H = 640, 480
    for name, fn in [('pcx', try_pcx), ('pcx_hi80', try_pcx_hi80),
                     ('pairs_cv', lambda x, w, h: try_pairs(x, w, h, order='cv')),
                     ('pairs_vc', lambda x, w, h: try_pairs(x, w, h, order='vc'))]:
        try:
            n, p, out = fn(d, W, H)
            print('%-10s pixels=%7d / %d  bytes=%6d / %d  head=%s' % (
                name, n, W * H, p, len(d), out[:24].hex(' ')))
        except Exception as e:
            print('%-10s ERROR %s' % (name, e))


def try_pcx_hi80(data, w, h, start=16):
    return try_pcx_hi(data, w, h, start, 0x80, 0x7F)


if __name__ == '__main__':
    main()
