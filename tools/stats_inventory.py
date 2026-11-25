"""全量盘点 extract/pak 目录：按扩展名 / 顶层目录 / SHAPE 二级目录统计。"""
import os, collections, json, sys

ROOT = r'F:\sanguo\extract\pak'
OUT = r'F:\sanguo\work\inventory.json'


def main():
    ext = collections.Counter()
    extb = collections.Counter()
    dirs = collections.Counter()
    dirb = collections.Counter()
    sub = collections.Counter()
    sizes = collections.defaultdict(list)
    tot = 0
    files = 0
    for dp, dn, fn in os.walk(ROOT):
        rel = os.path.relpath(dp, ROOT)
        for f in fn:
            p = os.path.join(dp, f)
            s = os.path.getsize(p)
            tot += s
            files += 1
            e = os.path.splitext(f)[1].upper() or '<none>'
            ext[e] += 1
            extb[e] += s
            top = rel.split(os.sep)[0] if rel != '.' else '<root>'
            dirs[top] += 1
            dirb[top] += s
            sizes[e].append(s)
            if top == 'SHAPE':
                parts = rel.split(os.sep)
                sub[parts[1] if len(parts) > 1 else '<SHAPE root>'] += 1

    def rng(lst):
        return [min(lst), max(lst), sum(lst) // len(lst)] if lst else [0, 0, 0]

    rep = {
        'root': ROOT,
        'files': files,
        'bytes': tot,
        'by_ext': {e: {'count': ext[e], 'bytes': extb[e], 'min': rng(sizes[e])[0],
                       'max': rng(sizes[e])[1], 'avg': rng(sizes[e])[2]}
                   for e in ext},
        'by_topdir': {d: {'count': dirs[d], 'bytes': dirb[d]} for d in dirs},
        'shape_subdirs': dict(sub.most_common()),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(rep, f, ensure_ascii=False, indent=1)

    print('files=%d bytes=%d' % (files, tot))
    print('--- ext')
    for e, c in ext.most_common():
        lo, hi, av = rng(sizes[e])
        print('%-9s %6d %12d  min=%-8d max=%-8d avg=%d' % (e, c, extb[e], lo, hi, av))
    print('--- top dirs')
    for d, c in dirs.most_common():
        print('%-20s %6d %12d' % (d, c, dirb[d]))
    print('--- SHAPE subdirs')
    for d, c in sub.most_common():
        print('%-24s %6d' % (d, c))
    print('wrote', OUT)


if __name__ == '__main__':
    main()
