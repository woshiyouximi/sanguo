# 量化「M/N 是不是真的不同色」：对每套图集的 back/front（我方/敌方）帧算不透明像素的平均色
# 用法: python measure_palette.py
from PIL import Image
import json, os, sys

ROOT = r'F:\sanguo'


def load(path):
    return json.load(open(path, encoding='utf-8'))


def stat(img, s, page_h):
    x, y, w, h = s['x'], s['y'], s['w'], s['h']
    box = (x, page_h - y - h, x + w, page_h - y - h + h)
    crop = img.crop(box).convert('RGBA')
    px = list(crop.getdata())
    op = [p for p in px if p[3] > 200]
    if not op:
        return None
    n = len(op)
    r = sum(p[0] for p in op) / n
    g = sum(p[1] for p in op) / n
    b = sum(p[2] for p in op) / n
    red = sum(1 for p in op if p[0] > p[2] + 30)
    blue = sum(1 for p in op if p[2] > p[0] + 30)
    return dict(n=n, r=r, g=g, b=b, red=red / n, blue=blue / n)


def force_table():
    j = load(os.path.join(ROOT, 'game', 'web', 'anim', 'units.json'))
    img = Image.open(os.path.join(ROOT, 'game', 'web', 'anim', 'units_00.png')).convert('RGBA')
    ph = j['pages'][0]['h']
    names = {s['name']: s for s in j['pages'][0]['sprites']}
    print('== FORCE (game/web/anim/units.json) ==')
    print('group\tM_rgb\tM_red%%\tM_blue%%\tN_rgb\tN_red%%\tN_blue%%\tdRGB')
    for key, grp in j['groups'].items():
        a = stat(img, names[grp['back'][0]], ph) if grp.get('back') else None
        b = stat(img, names[grp['front'][0]], ph) if grp.get('front') else None
        if not a or not b:
            print(key, 'MISSING')
            continue
        d = (b['r'] - a['r'], b['g'] - a['g'], b['b'] - a['b'])
        print('%s\t(%d,%d,%d)\t%.0f\t%.0f\t(%d,%d,%d)\t%.0f\t%.0f\t%+d,%+d,%+d' % (
            key, a['r'], a['g'], a['b'], a['red'] * 100, a['blue'] * 100,
            b['r'], b['g'], b['b'], b['red'] * 100, b['blue'] * 100, d[0], d[1], d[2]))


def compare(cocos_json, cocos_png, pairs, title):
    j = load(cocos_json)
    img = Image.open(cocos_png).convert('RGBA')
    ph = j['pages'][0]['h']
    names = {s['name']: s for s in j['pages'][0]['sprites']}
    print('\n== %s ==' % title)
    for label, ka, kb in pairs:
        a = stat(img, names[ka], ph) if ka in names else None
        b = stat(img, names[kb], ph) if kb in names else None
        if not a or not b:
            print('%-10s MISSING %s / %s' % (label, ka in names, kb in names))
            continue
        d = (b['r'] - a['r'], b['g'] - a['g'], b['b'] - a['b'])
        print('%-10s A=(%d,%d,%d) red%.0f%% blue%.0f%%   B=(%d,%d,%d) red%.0f%% blue%.0f%%   dB=%+d,%+d,%+d' % (
            label, a['r'], a['g'], a['b'], a['red'] * 100, a['blue'] * 100,
            b['r'], b['g'], b['b'], b['red'] * 100, b['blue'] * 100, d[0], d[1], d[2]))


if __name__ == '__main__':
    force_table()
    compare(os.path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim', 'atlas.json'),
            os.path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim', 'atlas_00.png'),
            [('walk', 'walk_back_f000', 'walk_front_f000'),
             ('walk8', 'walk_back_f008', 'walk_front_f008')],
            'Cocos bundle atlas.json: walk_back vs walk_front')
    compare(os.path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim', 'units.json'),
            os.path.join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim', 'units_00.png'),
            [('archer', 'archer_back_f000', 'archer_front_f000'),
             ('archer8', 'archer_back_f008', 'archer_front_f008')],
            'Cocos bundle units.json: archer_back vs archer_front')
