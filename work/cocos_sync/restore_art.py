"""原作美术复位：从 game/web 的源素材生成 bundle 用的压缩产物。

产物（staging，由 restore_art.mjs 复制进 assets/bundles/res）：
  anim/general/index.json + unit_*.png   武将小人图集（原作 PAK 抽帧，按动作子集重排）
  bg/policy/palais_01..05.webp           朝堂远景（640×480 → q85）
  bg/policy/floor_01..05.webp            底边 24 列纵向拉伸 + 模糊的柔焦地面
  map/chinamap.png                       1280×960 原作大地图（用 PNG，不用 webp：微信分包里 webp 读不出来，见 project/84 §11）
  map/city_1..4.png                      城点四分档图元
  map/point.png                          光标

幂等：输出按源文件签名（size+mtime）缓存，签名不变就整组跳过；否则重写。
"""
from __future__ import annotations

import hashlib
import json
import os
import sys

from PIL import Image, ImageEnhance, ImageFilter

ROOT = r'F:\sanguo'
WEB = os.path.join(ROOT, 'game', 'web')
OUT = os.path.join(ROOT, 'work', 'cocos_art', 'gen')

ANIM_SRC = os.path.join(WEB, 'anim', 'general')
MAP_SRC = os.path.join(WEB, 'assets', 'map')
POLICY_SRC = os.path.join(WEB, 'assets', 'bg', 'policy')

# 保留的 body 动作：只有 slot 1（直劍）。Weapon/Horse 在 generals.json 里全是 null，
# 参考实现缺省 slot1 / H900，所以多出来的 3 个槽位与 7 匹马运行时用不到。
BODY_ACTS = [('Wait:1', 1), ('Attack:1', 1), ('Walk', 0), ('Death', 0)]
PAGE_W = 1024
PAD = 1
PALETTE_TR = 255


def log(msg: str) -> None:
    print(msg, flush=True)


def sig_of(paths: list[str]) -> str:
    h = hashlib.sha256()
    for p in paths:
        st = os.stat(p)
        h.update(f'{p}|{st.st_size}|{int(st.st_mtime)}|'.encode('utf-8'))
    return h.hexdigest()[:16]


def load_stamp() -> dict:
    p = os.path.join(OUT, '.stamp.json')
    try:
        with open(p, encoding='utf-8') as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_stamp(stamp: dict) -> None:
    with open(os.path.join(OUT, '.stamp.json'), 'w', encoding='utf-8') as f:
        json.dump(stamp, f, ensure_ascii=False, indent=1)


def out_size(path: str) -> int:
    return os.path.getsize(path) if os.path.exists(path) else -1


# ---------------------------------------------------------------------------
# anim/general：按 unit 行式紧排，调色板原样搬（像素逐点不变）
# ---------------------------------------------------------------------------

def pack_anim(index: dict) -> list[dict]:
    pages = index['pages']
    groups = index['groups']
    actions = index['actions']
    page_of = {}
    frame_of = {}
    for p in pages:
        for sp in p['sprites']:
            page_of[sp['name']] = p
            frame_of[sp['name']] = sp

    # 每个 unit 页要保留哪些 group
    plan: dict[str, list[str]] = {}
    for p in pages:
        unit = p['unit']
        keys: list[str] = []
        if unit == 'H':
            keys = [k for k in groups if k.startswith('H900:')]
        elif unit.startswith('W:'):
            # W700 的帧只在 W:A 这张源表上；其余 W 页不重复打包
            keys = []
            if unit == 'W:A':
                keys = [k for k in groups if k.startswith('W700:')]
        else:
            for act, _slot in BODY_ACTS:
                k = f'{unit}:{act}'
                if k in groups:
                    keys.append(k)
        keys = [k for k in keys if k in groups and groups[k]]
        if keys:
            plan[unit] = keys

    out_pages = {}
    out_groups = {}
    out_actions = {}
    total_frames = 0
    for unit, keys in plan.items():
        # 页内所有帧名（group 顺序，允许 group 内重复 → 页内 sprite 只放一份）
        names: list[str] = []
        seen = set()
        for k in keys:
            for nm in groups[k]:
                if nm not in seen:
                    if nm not in frame_of:
                        raise SystemExit(f'frame missing: {unit} {k} {nm}')
                    seen.add(nm)
                    names.append(nm)
        sheets = {page_of[nm]['file'] for nm in names}
        if len(sheets) != 1:
            raise SystemExit(f'{unit}: frames span sheets {sorted(sheets)}')
        sheet = sheets.pop()

        # 行式紧排（宽 1024，1px 间距），页高按列累计
        x = 0
        y = 0
        row_h = 0
        placed = {}
        for nm in names:
            sp = frame_of[nm]
            if x + sp['w'] > PAGE_W:
                x = 0
                y += row_h + PAD
                row_h = 0
            placed[nm] = (x, y)
            x += sp['w'] + PAD
            row_h = max(row_h, sp['h'])
        height = y + row_h

        im = Image.open(os.path.join(ANIM_SRC, sheet))
        if im.mode != 'P':
            raise SystemExit(f'{sheet} not palette mode: {im.mode}')
        tr = int(im.info.get('transparency', 255))
        palette = im.getpalette()

        used = set()
        crops = {}
        for nm in names:
            sp = frame_of[nm]
            crop = im.crop((sp['x'], sp['y'], sp['x'] + sp['w'], sp['y'] + sp['h']))
            crops[nm] = crop
            for v in crop.getdata():
                used.add(int(v))
        used.discard(tr)
        order = sorted(used) + [tr]
        new_pal = []
        for idx in order:
            new_pal.extend(palette[idx * 3: idx * 3 + 3])
        lut = [0] * 256
        for new_i, old_i in enumerate(order):
            lut[old_i] = new_i

        canvas = Image.new('P', (PAGE_W, height), len(order) - 1)
        canvas.putpalette(new_pal)
        sprites = []
        for nm in names:
            sp = frame_of[nm]
            x0, y0 = placed[nm]
            crop = crops[nm]
            remapped = crop.point(lut)
            canvas.paste(remapped, (x0, y0))
            sprites.append({
                'name': nm, 'x': x0, 'y': y0,
                'w': sp['w'], 'h': sp['h'], 'ox': sp['ox'], 'oy': sp['oy'],
            })
        canvas.info['transparency'] = len(order) - 1
        fname = f'{unit.replace(":", "_")}.png'
        path = os.path.join(OUT, 'anim', 'general', fname)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        canvas.save(path, optimize=True)

        for k in keys:
            out_groups[k] = list(groups[k])
            meta = dict(actions[k])
            out_actions[k] = meta
        out_pages[unit] = {'file': fname, 'w': PAGE_W, 'h': height, 'sprites': sprites}
        total_frames += len(sprites)
        log(f'  page {unit:4s} {PAGE_W}x{height:<4d} frames={len(sprites):3d} {out_size(path):>8,d} B')

    index_out = {
        'meta': {
            'format': 2,
            'anchor': 'draw top-left at (unitX - ox, unitY - oy)',
            'pages': len(out_pages),
            'frames': total_frames,
            'note': 'SANGUO2 PAK SHAPE\\MAJOR subset; bodies keep Wait:1/Attack:1/Walk/Death',
        },
        'pages': out_pages,
        'groups': out_groups,
        'actions': out_actions,
    }
    path = os.path.join(OUT, 'anim', 'general', 'index.json')
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(index_out, f, ensure_ascii=False, separators=(',', ':'))
    log(f'  index.json {out_size(path):,d} B groups={len(out_groups)}')
    # 清掉旧版本残留的页（例如早先多打的 W_B..W_D）
    keep = {p['file'] for p in out_pages.values()}
    for f in os.listdir(os.path.dirname(path)):
        if f.endswith('.png') and f not in keep:
            os.remove(os.path.join(os.path.dirname(path), f))
            log(f'  stale removed: {f}')
    return [path]


# ---------------------------------------------------------------------------
# bg/policy：PALAIS 转 webp + 预烘柔焦地面
# ---------------------------------------------------------------------------

def build_policy() -> list[dict]:
    made = []
    for n in range(1, 6):
        src = os.path.join(POLICY_SRC, f'palais_0{n}.png')
        im = Image.open(src).convert('RGB')
        dst = os.path.join(OUT, 'bg', 'policy', f'palais_0{n}.webp')
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        im.save(dst, 'WEBP', quality=85, method=6)
        made.append(dst)
        log(f'  palais_0{n}.webp {out_size(dst):,d} B')

        # 与 city.html 的 .art-floor 同源：取最底 24 列，纵向拉伸成 750×318，再模糊/压暗
        floor_src = Image.open(src).convert('RGB')
        w, h = floor_src.size
        strip = floor_src.crop((0, h - 24, w, h)).resize((750, 318), Image.BICUBIC)
        strip = strip.filter(ImageFilter.GaussianBlur(9))
        strip = ImageEnhance.Brightness(strip).enhance(0.56)
        strip = ImageEnhance.Color(strip).enhance(0.92)
        fdst = os.path.join(OUT, 'bg', 'policy', f'floor_0{n}.webp')
        strip.save(fdst, 'WEBP', quality=80, method=6)
        made.append(fdst)
        log(f'  floor_0{n}.webp  {out_size(fdst):,d} B')
    return made


# ---------------------------------------------------------------------------
# map：原作大地图 + 城点图元
# ---------------------------------------------------------------------------

def build_map() -> list[dict]:
    made = []
    mapping = [
        ('chinamap.png', 'chinamap.png'),
        ('city_1.png', 'city_1.png'),
        ('city_2.png', 'city_2.png'),
        ('city_3.png', 'city_3.png'),
        ('city_4.png', 'city_4.png'),
        ('point.png', 'point.png'),
    ]
    for src_name, dst_name in mapping:
        dst = os.path.join(OUT, 'map', dst_name)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        with open(os.path.join(MAP_SRC, src_name), 'rb') as f:
            data = f.read()
        with open(dst, 'wb') as f:
            f.write(data)
        made.append(dst)
        log(f'  map/{dst_name} {len(data):,d} B')
    return made


def main() -> int:
    os.makedirs(OUT, exist_ok=True)
    index_path = os.path.join(ANIM_SRC, 'index.json')
    index = json.load(open(index_path, encoding='utf-8'))
    src_files = [index_path] + sorted(
        {os.path.join(ANIM_SRC, p['file']) for p in index['pages']}
    )
    anim_sig = sig_of(src_files)
    policy_sig = sig_of([os.path.join(POLICY_SRC, f'palais_0{n}.png') for n in range(1, 6)])
    map_sig = sig_of([os.path.join(MAP_SRC, f) for f in
                      ['chinamap.png', 'city_1.png', 'city_2.png', 'city_3.png', 'city_4.png', 'point.png']])

    stamp = load_stamp()
    wrote = 0
    if stamp.get('anim') != anim_sig or not os.path.exists(os.path.join(OUT, 'anim', 'general', 'index.json')):
        log('[anim/general] regenerate')
        pack_anim(index)
        stamp['anim'] = anim_sig
        wrote += 1
    else:
        log('[anim/general] unchanged, skip')
    if stamp.get('policy') != policy_sig:
        log('[bg/policy] regenerate')
        build_policy()
        stamp['policy'] = policy_sig
        wrote += 1
    else:
        log('[bg/policy] unchanged, skip')
    if stamp.get('map') != map_sig:
        log('[map] regenerate')
        build_map()
        stamp['map'] = map_sig
        wrote += 1
    else:
        log('[map] unchanged, skip')
    save_stamp(stamp)

    total = 0
    for base, _dirs, files in os.walk(OUT):
        for f in files:
            if f.startswith('.'):
                continue
            total += os.path.getsize(os.path.join(base, f))
    log(f'staging total {total:,d} B ({total / 1048576:.2f} MB), regenerated groups {wrote}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
