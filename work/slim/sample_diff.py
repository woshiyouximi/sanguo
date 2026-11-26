# -*- coding: utf-8 -*-
"""抽样验证：把构建产物里的 png（未瘦）与出包里的 webp（已瘦）逐像素比 mean abs diff。

用法：
  python sample_diff.py <未瘦的 native 目录> <出包的 native 目录> <源工程 assets 根> [每组抽几张]

分组靠源工程里的 *.png.meta（里面写着 uuid），所以能报出 /bg/hero/face 这类业务目录，
不用去解 config.ef49b.json 里的 22 字符压缩 uuid。
"""
import io
import json
import os
import re
import sys

from PIL import Image

UUID_RE = re.compile(r'"uuid"\s*:\s*"([0-9a-fA-F-]{36})"')


def uuid_of_meta(meta_path):
    try:
        with open(meta_path, 'r', encoding='utf-8', errors='replace') as f:
            head = f.read(4096)
    except OSError:
        return None
    m = UUID_RE.search(head)
    return m.group(1).lower() if m else None


def index_source(assets_root, bundle='res'):
    """uuid -> 'bg/orig/bg03.png' 形式的相对路径"""
    out = {}
    base = os.path.join(assets_root, 'bundles', bundle)
    for dirpath, _dirs, files in os.walk(base):
        for n in files:
            if not n.lower().endswith('.png.meta'):
                continue
            u = uuid_of_meta(os.path.join(dirpath, n))
            if not u:
                continue
            rel = os.path.relpath(os.path.join(dirpath, n[:-5]), base).replace('\\', '/')
            out[u] = rel
    return out


def find_native(root, uuid, ext):
    d = os.path.join(root, uuid[:2])
    if not os.path.isdir(d):
        return None
    hits = [n for n in os.listdir(d) if n.startswith(uuid + '.') and n.lower().endswith('.' + ext)]
    return os.path.join(d, sorted(hits)[0]) if hits else None


def load_rgba(path):
    im = Image.open(path)
    im.load()
    return im.convert('RGBA')


def madiff(a, b):
    """只在原图 alpha>0 的可见像素上比 RGB 平均绝对误差 + alpha 平均绝对误差。"""
    pa, pb = a.load(), b.load()
    w, h = a.size
    if b.size != a.size:
        return None, None, 0
    tot_r = tot_a = 0
    vis = 0
    for y in range(h):
        for x in range(w):
            r1, g1, b1, a1 = pa[x, y]
            if a1 == 0:
                continue
            r2, g2, b2, a2 = pb[x, y]
            tot_r += abs(r1 - r2) + abs(g1 - g2) + abs(b1 - b2)
            tot_a += abs(a1 - a2)
            vis += 1
    if vis == 0:
        return None, None, 0
    return tot_r / (3.0 * vis), tot_a / float(vis), vis


def main(argv):
    if len(argv) < 4:
        print(__doc__)
        return 2
    raw_root, slim_root, assets_root = argv[1], argv[2], argv[3]
    per_group = int(argv[4]) if len(argv) > 4 else 2
    explicit = argv[5].split(',') if len(argv) > 5 and argv[5].strip() != '' else None
    src = index_source(assets_root)
    conv = []
    for uuid, rel in src.items():
        png = find_native(slim_root, uuid, 'webp')
        if not png:
            continue
        conv.append((uuid, rel, png))
    conv.sort(key=lambda t: t[1])
    print('已转换（有 webp）的源素材：%d 个' % len(conv))

    groups = {}
    for uuid, rel, _p in conv:
        parts = rel.split('/')
        key = '/'.join(parts[:2]) if len(parts) > 2 else (parts[0] if len(parts) > 1 else '(root)')
        groups.setdefault(key, []).append(uuid)
    print('--- 分组 ---')
    for k in sorted(groups):
        print('  %-28s %d' % (k, len(groups[k])))

    picks = []
    if explicit:
        for needle in explicit:
            hit = [t for t in conv if needle in t[1]]
            if not hit:
                print('!! 没有已转换的素材匹配 %r' % needle)
                continue
            picks.append((hit[0][0], hit[0][1]))
    else:
        for want in ('bg/', 'hero', 'face'):
            got = 0
            for k in sorted(groups):
                if want not in (k + '/'):
                    continue
                for u in groups[k]:
                    if got >= per_group:
                        break
                    if any(p[0] == u for p in picks):
                        continue
                    picks.append((u, next(r for U, r, _ in conv if U == u)))
                    got += 1
            if got == 0:
                print('!! 组 %s 里没有已转换的素材' % want)

    print('\n--- 抽样 %d 张 ---' % len(picks))
    print('%-40s %10s %10s %8s %8s' % ('assetPath', 'png B', 'webp B', 'rgb', 'alpha'))
    worst = 0.0
    tot = 0.0
    for uuid, rel in picks:
        png = find_native(raw_root, uuid, 'png')
        webp = find_native(slim_root, uuid, 'webp')
        if not png or not webp:
            print('%-40s 缺文件 png=%s webp=%s' % (rel, bool(png), bool(webp)))
            continue
        a = load_rgba(png)
        b = load_rgba(webp)
        d_rgb, d_a, vis = madiff(a, b)
        if d_rgb is None:
            print('%-40s 尺寸不一致 %s vs %s' % (rel, a.size, b.size))
            continue
        print('%-40s %10d %10d %8.2f %8.2f  (%dx%d, 可见像素 %d)'
              % (rel, os.path.getsize(png), os.path.getsize(webp), d_rgb, d_a, a.size[0], a.size[1], vis))
        worst = max(worst, d_rgb)
        tot += d_rgb
    if picks:
        print('\n平均 rgb_diff=%.2f  最差=%.2f  （阈值 2.0 为「观感无差」参考线，webp 灰度见报告）'
              % (tot / len(picks), worst))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
