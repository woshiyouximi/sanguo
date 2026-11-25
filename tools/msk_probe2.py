"""MSK RLE 反推探针 v2：多假设 + 行对齐约束 + 与 CHINAMAP.SHP 四象限交叉验证。"""
import os, struct, sys
from collections import Counter, defaultdict

ROOT = r'F:\sanguo\extract\pak\SHAPE\MAP'
W, H = 640, 480


def load(name):
    return open(os.path.join(ROOT, name), 'rb').read()


# ---------- 候选解码器：每个返回 (pixels:list[int], nrows_done, ptr, note)
def dec_pairs(data, start=16, order='cv', row_reset=True, maxrows=H):
    p, out, rows = start, [], 0
    n = len(data)
    for y in range(maxrows):
        got = 0
        while got < W:
            if p + 2 > n:
                return out, rows, p, 'eof in row %d' % y
            a, b = data[p], data[p + 1]
            p += 2
            cnt, v = (a, b) if order == 'cv' else (b, a)
            if cnt == 0:
                if v == 0:
                    break  # EOL
                continue
            if got + cnt > W:
                return out, rows, p, 'overrun row %d got=%d cnt=%d' % (y, got, cnt)
            out.extend([v] * cnt)
            got += cnt
        rows += 1
        if got != W:
            return out, rows, p, 'short row %d got=%d' % (y, got)
    return out, rows, p, 'ok'


def dec_pairs_norow(data, start=16, order='cv'):
    p, out = start, []
    n = len(data)
    while p + 2 <= n and len(out) < W * H:
        a, b = data[p], data[p + 1]
        p += 2
        cnt, v = (a, b) if order == 'cv' else (b, a)
        cnt = min(cnt, W * H - len(out))
        out.extend([v] * cnt)
    return out, len(out) // W, p, 'flat'


def dec_bmprle8(data, start=16):
    """BMP RLE8: (count,value); 00 00=EOL, 00 01=EOB, 00 02=delta, 00 n=absolute n bytes."""
    p, out, rows = start, [], 0
    n = len(data)
    y = 0
    got = 0
    while y < H and p < n:
        a = data[p]; p += 1
        if a:
            if p >= n:
                break
            v = data[p]; p += 1
            if got + a > W:
                return out, y, p, 'overrun y=%d got=%d a=%d' % (y, got, a)
            out.extend([v] * a)
            got += a
        else:
            if p >= n:
                break
            b = data[p]; p += 1
            if b == 0:          # EOL
                if got != W:
                    return out, y, p, 'EOL short y=%d got=%d' % (y, got)
                y += 1; got = 0
            elif b == 1:        # EOB
                return out, y, p, 'eob y=%d got=%d' % (y, got)
            elif b == 2:        # delta
                p += 2
            else:
                cnt = b
                if got + cnt > W:
                    return out, y, p, 'abs overrun y=%d got=%d cnt=%d' % (y, got, cnt)
                out.extend(data[p:p + cnt])
                p += cnt + (cnt & 1)
                got += cnt
    return out, y, p, 'ok-end'


def dec_pcx(data, start=16, thr=0xC0, mask=0x3F):
    p, out, rows = start, [], 0
    n = len(data)
    for y in range(H):
        got = 0
        while got < W:
            if p >= n:
                return out, rows, p, 'eof'
            b = data[p]; p += 1
            if b >= thr:
                cnt = b & mask
                if p >= n:
                    return out, rows, p, 'eof2'
                v = data[p]; p += 1
                if got + cnt > W:
                    return out, rows, p, 'overrun y=%d' % y
                out.extend([v] * cnt)
                got += cnt
            else:
                out.append(b)
                got += 1
        rows += 1
    return out, rows, p, 'ok'


def dec_words(data, start=16, order='cv', row_reset=True):
    p, out, rows = start, [], 0
    n = len(data)
    for y in range(H):
        got = 0
        while got < W:
            if p + 4 > n:
                return out, rows, p, 'eof row %d' % y
            a, b = struct.unpack_from('<HH', data, p)
            p += 4
            cnt, v = (a, b) if order == 'cv' else (b, a)
            if cnt == 0:
                break
            if got + cnt > W:
                return out, rows, p, 'overrun y=%d got=%d cnt=%d' % (y, got, cnt)
            out.extend([v] * cnt)
            got += cnt
        rows += 1
        if got != W:
            return out, rows, p, 'short y=%d got=%d' % (y, got)
    return out, rows, p, 'ok'


def report(name, fn, *a, **kw):
    try:
        out, rows, p, note = fn(*a, **kw)
    except Exception as e:
        print('  %-26s EXC %s: %s' % (name, type(e).__name__, e))
        return None
    ok = (len(out) == W * H) and (p == len(DATA)) and rows == H
    print('  %-26s px=%7d rows=%3d ptr=%6d/%6d  %-24s %s' % (
        name, len(out), rows, p, len(DATA), note, '<<< MATCH' if ok else ''))
    return (out, rows, p, note)


def quadrant_shp():
    """CHINAMAP.SHP 1280x960 -> 4 个 640x480 象限的 RGB565 值。"""
    sys.path.insert(0, r'F:\sanguo\tools')
    import export_assets as E
    d = open(os.path.join(ROOT, 'CHINAMAP.SHP'), 'rb').read()
    w, h, key, ox, oy, buf = E.shp_decode(d)
    print('CHINAMAP.SHP -> %dx%d key=%04X' % (w, h, key))
    qs = {}
    for i, (qx, qy) in enumerate([(0, 0), (640, 0), (0, 480), (640, 480)], 1):
        arr = []
        for y in range(480):
            base = ((qy + y) * w + qx) * 4
            for x in range(640):
                o = base + x * 4
                r, g, b = buf[o], buf[o + 1], buf[o + 2]
                # 反量化到 565 便于和查表值比较
                arr.append(((r >> 3) << 11) | ((g >> 2) << 5) | (b >> 3))
        qs[i] = arr
    return qs


def xtab(codes, q):
    """codes: list[int] 0..255 ; q: list[int] RGB565。返回每个 code 最常见的颜色。"""
    tab = defaultdict(Counter)
    for c, v in zip(codes, q):
        tab[c][v] += 1
    print('    code  n       top colors (RGB565:share)')
    for c in sorted(tab):
        tot = sum(tab[c].values())
        top = tab[c].most_common(3)
        s = '  '.join('%04X:%.0f%%' % (k, 100.0 * n / tot) for k, n in top)
        print('    %4d %7d  %s' % (c, tot, s))


if __name__ == '__main__':
    DATA = load(sys.argv[1] if len(sys.argv) > 1 else 'CHINAMAP1.MSK')
    print('file=%s bytes=%d body=%d  target=%dx%d' % (
        sys.argv[1] if len(sys.argv) > 1 else 'CHINAMAP1.MSK', len(DATA), len(DATA) - 16, W, H))
    print('hdr', DATA[:16].hex(' '))
    best = None
    for name, fn, kw in [
        ('pairs_cv_row', dec_pairs, dict(order='cv')),
        ('pairs_vc_row', dec_pairs, dict(order='vc')),
        ('pairs_cv_flat', dec_pairs_norow, dict(order='cv')),
        ('pairs_vc_flat', dec_pairs_norow, dict(order='vc')),
        ('bmprle8', dec_bmprle8, {}),
        ('pcx_C0', dec_pcx, dict(thr=0xC0, mask=0x3F)),
        ('pcx_80', dec_pcx, dict(thr=0x80, mask=0x7F)),
        ('words_cv', dec_words, dict(order='cv')),
        ('words_vc', dec_words, dict(order='vc')),
    ]:
        r = report(name, fn, DATA, 16, **kw)
        if r and len(r[0]) == W * H and r[2] == len(DATA):
            best = (name, r)
    if best:
        name, (out, rows, p, note) = best
        print('\n== 命中 %s，值分布：' % name)
        print('  ', Counter(out).most_common(20))
        print('  第一行前 40 个:', out[:40])
        print('  第 240 行前 40 个:', out[240 * W:240 * W + 40])
        qs = quadrant_shp()
        for i in (1, 2, 3, 4):
            print('\n== 与 CHINAMAP 象限 %d 交叉表 ==' % i)
            xtab(out, qs[i])
    else:
        print('\n未命中：没有候选同时满足 像素数/行对齐/耗尽文件。')
        print('  头 16 字节:', DATA[:16].hex(' '))
        # 看看按 pair 解码时行能否对齐
        for order in ('cv', 'vc'):
            out, rows, p, note = dec_pairs(DATA, 16, order=order)
            print('  pair %s 解到 %d px (%d 行) 后失败: %s @%d' % (order, len(out), rows, note, p))
