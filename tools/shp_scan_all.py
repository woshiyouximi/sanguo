"""扫描全部 SHP 头部：统计色键/尺寸/热点/校验，输出 work/shp_scan.json。"""
import os, struct, json, collections, sys, time

ROOT = r'F:\sanguo\extract\pak\SHAPE'
OUT = r'F:\sanguo\work\shp_scan.json'


def main():
    t0 = time.time()
    keys = collections.Counter()
    fmt = collections.Counter()
    wdist = collections.Counter()
    hdist = collections.Counter()
    offr = [0, 0]
    bad = []
    recs = []
    n = 0
    for dp, dn, fn in os.walk(ROOT):
        for f in fn:
            if not f.upper().endswith('.SHP'):
                continue
            p = os.path.join(dp, f)
            rel = os.path.relpath(p, ROOT).replace('\\', '/')
            data = open(p, 'rb').read()
            n += 1
            if len(data) < 0x24 or data[:4] != b'TLHS':
                bad.append((rel, 'magic', data[:8].hex()))
                continue
            a, b, c, d = struct.unpack_from('<4I', data, 4)
            key, w, cnt, offx, offy = struct.unpack_from('<5I', data, 0x10)
            offx = struct.unpack_from('<i', data, 0x1C)[0]
            offy = struct.unpack_from('<i', data, 0x20)[0]
            fmt[(a, b, c, d)] += 1
            keys[key] += 1
            wdist[w] += 1
            hdist[cnt] += 1
            offr[0] = min(offr[0], offx)
            offr[1] = max(offr[1], offx)
            err = ''
            if 0x24 + 4 * cnt > len(data):
                err = 'offtable'
            else:
                o0 = struct.unpack_from('<I', data, 0x24)[0]
                if o0 != 0x24 + 4 * cnt:
                    err = 'off0=%x expect=%x' % (o0, 0x24 + 4 * cnt)
            if err:
                bad.append((rel, err, len(data)))
            recs.append([rel, w, cnt, key, offx, offy, len(data), err])
    print('scanned %d shp in %.1fs' % (n, time.time() - t0))
    print('fmt fields (a,b,c,d) counts:', fmt.most_common(6))
    print('keys:', [(hex(k), v) for k, v in keys.most_common(10)])
    print('widths:', sorted(wdist.items())[:20], '...total distinct', len(wdist))
    print('heights:', sorted(hdist.items())[:20], '...total distinct', len(hdist))
    print('offx range', offr)
    print('bad:', len(bad))
    for x in bad[:20]:
        print('  ', x)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump({'keys': {str(k): v for k, v in keys.items()},
               'fmt': {str(k): v for k, v in fmt.items()},
               'w': dict(wdist), 'h': dict(hdist), 'bad': bad,
               'records': recs}, open(OUT, 'w', encoding='utf-8'))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
