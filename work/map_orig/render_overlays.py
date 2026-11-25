# -*- coding: utf-8 -*-
"""验收图 + campaign 预览。

产物（全部落 work/map_orig/）：
  overlay_1280.png   CHINAMAP 1280x960 + 60 城 pos_xy（CITY01-04 图元），5 剧本各打一次小方符
  scen_1..5.png      每剧本一张，图元按 POPULATION 四分位定 1..4 档，城名按势力着色
  campaign_preview.png  750x500 contain 模拟（左：裸几何 / 右：加 .bgveil 后的成品观感）

图例一律放地图**下方**的页脚条，不压任何城（首版放画布内压住了 雲南）。
"""
import json, os, collections, itertools
from PIL import Image, ImageDraw, ImageFont

ROOT = r'F:\sanguo'
OUT = os.path.join(ROOT, r'work\map_orig')
MAP = os.path.join(ROOT, r'export\png\SHAPE\MAP\CHINAMAP.png')
ASSETS = os.path.join(ROOT, r'game\web\assets\map')

base = Image.open(MAP).convert('RGB')
W, H = base.size
scen = json.load(open(os.path.join(ROOT, r'game\data\scenarios.json'), encoding='utf-8'))
cities = scen[0]['cities']

# ---- 档位：人口四分位（15/15/15/15；12 座关隘 POP=0 自然落 1 档）----
order = sorted(cities, key=lambda c: (c['POPULATION'], c['_index']))
tier = {c['NAME']: 1 + min(3, r * 4 // len(order)) for r, c in enumerate(order)}
sprite = {k: Image.open(os.path.join(ASSETS, 'city_%d.png' % k)).convert('RGBA') for k in (1, 2, 3, 4)}
point = Image.open(os.path.join(ASSETS, 'point.png')).convert('RGBA')

# ---- 势力配色（全剧本同一 key 同色）----
RAINBOW = ['#E4443B', '#4E8EF7', '#3FBF7F', '#E8A33D', '#B05CE0', '#25C7C7',
           '#F16CA0', '#8FC03A', '#D8C34A', '#7E8FF0', '#C4713F', '#5FB8E8',
           '#D055B8', '#6FC46F', '#E07B4F', '#9AA6D8', '#C9A227', '#4FB0A5']
# scen1 的 12 座关隘 KING 是整数 1..12（不是君主名）→ 一律当空城
def king_of(c):
    return c['KING'] if isinstance(c['KING'], str) else ''
kings = []
for s in scen:
    for c in s['cities']:
        nm = king_of(c)
        if nm and nm not in kings:
            kings.append(nm)
COLOR = {k: RAINBOW[i % len(RAINBOW)] for i, k in enumerate(kings)}
EMPTY = '#8A9099'
SC5 = ['#FF4D4D', '#4DA6FF', '#52E08A', '#FFC24D', '#C77DFF']

LEGH = 100          # 页脚图例条高度
GOLD = (216, 179, 106)


def font(sz, bold=False):
    for p in ((r'C:\Windows\Fonts\msyhbd.ttc' if bold else r'C:\Windows\Fonts\msyh.ttc'),
              r'C:\Windows\Fonts\msyh.ttc', r'C:\Windows\Fonts\simhei.ttf'):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()


F12, F13, F15, F18 = font(12), font(13), font(15), font(18, True)


def compose(city_list, title, sub, k=1.0, colors=None, badges=None, legend=True):
    im = Image.new('RGB', (W, H + (LEGH if legend else 0)), (12, 15, 20))
    im.paste(base, (0, 0))
    d = ImageDraw.Draw(im, 'RGBA')

    # 城图元（透明合成，锚点=画布中心）
    for c in city_list:
        x, y = c['pos_xy']
        sp = sprite[tier[c['NAME']]]
        if k != 1.0:
            sp = sp.resize((max(1, round(sp.width * k)), max(1, round(sp.height * k))), Image.LANCZOS)
        im.paste(sp, (round(x - sp.width / 2), round(y - sp.height / 2)), sp)

    # 城名：上/下交替 + 黑描边
    for i, c in enumerate(city_list):
        x, y = c['pos_xy']
        hh = sprite[tier[c['NAME']]].height * k
        ty = y - hh / 2 - 20 if i % 2 == 0 else y + hh / 2 + 4
        d.text((x, ty), c['NAME'], font=F15, fill=(255, 255, 255), anchor='ma',
               stroke_width=3, stroke_fill=(0, 0, 0))
        if colors:
            col = colors(c)
            r = 4
            d.ellipse([x + sprite[tier[c['NAME']]].width * k / 2 - r,
                       y - hh / 2 - r * 2,
                       x + sprite[tier[c['NAME']]].width * k / 2 + r,
                       y - hh / 2], fill=col, outline=(0, 0, 0))
        if badges:
            for j, bc in enumerate(badges):
                bx, by = x - 10 + j * 5, y - hh / 2 - 9
                d.rectangle([bx, by, bx + 3, by + 3], fill=bc, outline=(0, 0, 0))

    # 标题条
    d.rectangle([0, 0, W, 30], fill=(10, 13, 18, 214))
    d.text((10, 5), title, font=F18, fill=(243, 224, 180))
    if sub:
        d.text((W - 10, 8), sub, font=F13, fill=(170, 178, 190), anchor='ra')
    d.text((W - 10, H - 20), '圖元 ×%.2f' % k, font=F13, fill=(210, 215, 225),
           anchor='ra', stroke_width=2, stroke_fill=(0, 0, 0))

    # 页脚图例（3 列网格，不压地图）
    if legend:
        cnt = collections.Counter(king_of(c) for c in city_list)
        named = sorted([kv for kv in cnt.items() if kv[0]], key=lambda kv: -kv[1])
        rows = named[:8] + [('', cnt.get('', 0))]
        rest = sum(n for _, n in named[8:])
        if rest:
            rows.append(('其他 %d 勢力' % (len(named) - 8), rest))
        d.rectangle([0, H, W, H + LEGH], fill=(13, 16, 22))
        d.text((10, H + 6), '勢力（城數）', font=F13, fill=GOLD)
        per = 5
        for i, (nm, n) in enumerate(rows):
            col, row = i // per, i % per
            bx = 10 + col * 250
            by = H + 26 + row * 14
            d.rectangle([bx, by + 3, bx + 8, by + 11], fill=COLOR.get(nm, EMPTY))
            d.text((bx + 13, by), '%s %d' % (nm or '空城', n), font=F12, fill=(226, 230, 236))
        d.text((W - 10, H + LEGH - 16), '城圖元檔位=人口四分位；城名上下交替',
               font=F12, fill=(140, 147, 158), anchor='ra')
    return im


# ============ 1) overview + 每剧本 ============
ov = compose(cities, 'CHINAMAP 1280×960 + 60 城 pos_xy（CITY01–04 圖元）',
             '5 個劇本座標逐點相同；小方塊 5 色＝5 劇本各打一次', k=1.0, badges=SC5)
p = os.path.join(OUT, 'overlay_1280.png')
ov.save(p)
print('overlay_1280.png %dx%d %.0f KB' % (ov.width, ov.height, os.path.getsize(p) / 1024))

for i, s in enumerate(scen):
    cs = s['cities']
    im = compose(cs, '劇本 %d／5　%s（%d 年）' % (i + 1, s['system']['TIME'], s['system']['YEAR']),
                 '%s　%d 勢力／%d 城已占' % (s['file'],
                                            len({king_of(c) for c in cs if king_of(c)}),
                                            sum(1 for c in cs if king_of(c))),
                 k=1.0, colors=lambda c: COLOR.get(king_of(c), EMPTY))
    pp = os.path.join(OUT, 'scen_%d.png' % (i + 1))
    im.save(pp)
    print('scen_%d.png %dx%d %.0f KB' % (i + 1, im.width, im.height, os.path.getsize(pp) / 1024))

# ============ 2) campaign 750x500 contain 预览 ============
VIEW_W, VIEW_H = 750, 500
S = min(VIEW_W / W, VIEW_H / H)          # contain 比例
BOXW, BOXH = W * S, H * S
BOX_L, BOX_T = (VIEW_W - BOXW) / 2, (VIEW_H - BOXH) / 2


def design(x, y):
    """原图 px → 750x500 design px（compute by hand, 与 mapProj.ts 同式）"""
    return BOX_L + x * S, BOX_T + y * S


K_REC = 0.65   # 推荐图元缩放（design px 下的倍数，1.0 = 原图像素 1:1）


def label_boxes(fsz, only=None):
    """逐城算城名包围盒（design px），only 为筛选谓词；用于量化叠字。"""
    fx = font(fsz)
    out = []
    for i, c in enumerate(cities):
        if only and not only(c):
            continue
        x, y = design(*c['pos_xy'])
        sw = sprite[tier[c['NAME']]].width * S * K_REC
        sh = sprite[tier[c['NAME']]].height * S * K_REC
        tw = fx.getlength(c['NAME'])
        ty = y - sh / 2 - fsz - 2 if i % 2 == 0 else y + sh / 2 + 1
        out.append((c['NAME'], x - tw / 2, ty, x + tw / 2, ty + fsz))
    return out


def label_overlaps(fsz, only=None):
    b = label_boxes(fsz, only)
    bad = []
    for (n1, l1, t1, r1, b1), (n2, l2, t2, r2, b2) in itertools.combinations(b, 2):
        if l1 < r2 - 0.01 and l2 < r1 - 0.01 and t1 < b2 - 0.01 and t2 < b1 - 0.01:
            bad.append((n1, n2))
    return len(b), bad


def panel(veil, k, fsz, label, only=None):
    im = Image.new('RGB', (VIEW_W, VIEW_H), (8, 10, 14))
    m = base.resize((round(BOXW), round(BOXH)), Image.LANCZOS)
    im.paste(m, (round(BOX_L), round(BOX_T)))
    if veil:
        # .bgveil: linear-gradient(rgba(10,14,20,.58) -> .72)
        ov2 = Image.new('RGBA', (VIEW_W, VIEW_H))
        px = ov2.load()
        for yy in range(VIEW_H):
            a = 0.58 + (0.72 - 0.58) * yy / (VIEW_H - 1)
            for xx in range(0, VIEW_W):
                px[xx, yy] = (10, 14, 20, int(round(a * 255)))
        im = Image.alpha_composite(im.convert('RGBA'), ov2).convert('RGB')
    d = ImageDraw.Draw(im, 'RGBA')
    fx = font(fsz)
    drawn = []
    for i, c in enumerate(cities):
        x, y = design(*c['pos_xy'])
        sp = sprite[tier[c['NAME']]]
        sw, sh = max(1, round(sp.width * S * k)), max(1, round(sp.height * S * k))
        sp2 = sp.resize((sw, sh), Image.LANCZOS)
        im.paste(sp2, (round(x - sw / 2), round(y - sh / 2)), sp2)
        drawn.append((c['NAME'], x, y, sw, sh))
    d = ImageDraw.Draw(im, 'RGBA')
    for i, (nm, x, y, sw, sh) in enumerate(drawn):
        ty = y - sh / 2 - fsz - 2 if i % 2 == 0 else y + sh / 2 + 1
        d.text((x, ty), nm, font=fx, fill=(228, 232, 240), anchor='ma',
               stroke_width=1, stroke_fill=(0, 0, 0))
    d.rectangle([0, 0, VIEW_W - 1, VIEW_H - 1], outline=(216, 179, 106, 160))
    d.rectangle([0, 0, VIEW_W, 22], fill=(10, 13, 18, 216))
    d.text((8, 4), label, font=F13, fill=(243, 224, 180))
    return im, drawn


# 找"最大不重叠 k"：图元矩形两两相交即算重叠
def overlap_pairs(k):
    bad = []
    for a, b in itertools.combinations(cities, 2):
        ax, ay = design(*a['pos_xy'])
        bx, by = design(*b['pos_xy'])
        aw = sprite[tier[a['NAME']]].width * S * k / 2
        ah = sprite[tier[a['NAME']]].height * S * k / 2
        bw = sprite[tier[b['NAME']]].width * S * k / 2
        bh = sprite[tier[b['NAME']]].height * S * k / 2
        if abs(ax - bx) < aw + bw and abs(ay - by) < ah + bh:
            bad.append((a['NAME'], b['NAME'], ((ax - bx) ** 2 + (ay - by) ** 2) ** .5))
    return bad


print('\n=== 750x500 contain: s=%.6f  box=%.2fx%.2f @ (%.2f,%.2f) ===' % (S, BOXW, BOXH, BOX_L, BOX_T))
for k in (1.0, 0.85, 0.75, 0.7, 0.65, 0.6, 0.55, 0.5):
    op = overlap_pairs(k)
    print('  k=%.2f  图元重叠对=%2d  例:%s' % (k, len(op),
          ' '.join('%s/%s' % (a, b) for a, b, _ in sorted(op, key=lambda t: t[2])[:4])))

print('\n叠字审计（城名 12 上下交替，图元 k=%.2f）:' % K_REC)
for fsz in (14, 13, 12, 11, 10):
    n, bad = label_overlaps(fsz)
    print('  %2dpx 全 60 城：%2d/%d 对重叠  %s' % (fsz, len(bad), n * (n - 1) // 2,
          ' '.join('%s/%s' % t for t in bad[:5])))
n, bad = label_overlaps(14, lambda c: tier[c['NAME']] == 4)
print('  14px 仅档4(15 城)：%2d 对重叠' % len(bad))
n, bad = label_overlaps(12, lambda c: tier[c['NAME']] == 4)
print('  12px 仅档4(15 城)：%2d 对重叠' % len(bad))

GAP = 14
panels = [
    panel(False, 1.00, 12, 'A  圖元 ×1.00（原图 1:1）· 城名 12px'),
    panel(False, K_REC, 12, 'B  圖元 ×%.2f · 城名 12px' % K_REC),
    panel(True, K_REC, 12, 'C  圖元 ×%.2f + .bgveil(.58→.72) 成品观感' % K_REC),
]
sheet = Image.new('RGB', (VIEW_W * 3 + GAP * 2 + 24, VIEW_H + 100), (16, 18, 23))
for i, (im, _) in enumerate(panels):
    sheet.paste(im, (12 + i * (VIEW_W + GAP), 40))
d = ImageDraw.Draw(sheet, 'RGBA')
d.text((12, 8), 'campaign.html 地圖區模拟　750×500　contain 等比不裁切　s=%.4f　留边 左右 %.1f / 上下 %.1f px'
       % (S, BOX_L, max(BOX_T, 0.0)), font=F18, fill=(243, 224, 180))
_, n1 = label_overlaps(12)
_, n4 = label_overlaps(12, lambda c: tier[c['NAME']] == 4)
d.text((12, VIEW_H + 50),
       '建议：底图 contain 成 %.1f×%.1f @x=%.1f；图元 ×%.2f（档1-4 宽 %.1f/%.1f/%.1f/%.1f design px）；'
       '城名 12px 上下交替时全 60 城只叠 %d 对（北平/南皮、平原/界橋、徐州/都陽、壽春/合肥）'
       % (BOXW, BOXH, BOX_L, K_REC, sprite[1].width * S * K_REC, sprite[2].width * S * K_REC,
          sprite[3].width * S * K_REC, sprite[4].width * S * K_REC, len(n1)),
       font=F13, fill=(226, 230, 236))
d.text((12, VIEW_H + 68),
       '图元矩形重叠：k=1.00…0.50 全程 %d 对（几何不撞）→ 瓶颈是字不是图。只画档4 城名时 %d 对重叠。'
       '最近城距 徐州–都陽 37.6 原图 px = 19.6 design px，3 字 12px 名宽约 36px。'
       % (len(overlap_pairs(1.0)), len(n4)), font=F13, fill=(170, 178, 190))
d.text((12, VIEW_H + 86),
       'A=原图 1:1（图元 11–25 px）；B=×0.65（更清爽，推荐）；C=B+.bgveil 成品观感。'
       '若地图区是 750×900（现 campaign 画布）：plotRect 得 s=0.5654、上下各留 178.6 px 空。',
       font=F13, fill=(140, 147, 158))
pp = os.path.join(OUT, 'campaign_preview.png')
sheet.save(pp)
print('\ncampaign_preview.png %dx%d %.0f KB' % (sheet.width, sheet.height, os.path.getsize(pp) / 1024))

# ============ 3) 报告用数字 ============
import collections as C
print('\n档位分布:', dict(C.Counter(tier.values())))
for k in (1, 2, 3, 4):
    nm = [c['NAME'] for c in cities if tier[c['NAME']] == k]
    print('  档%d (city_%d.png %dx%d → design %.1fx%.1f @k=%.2f): %s'
          % (k, k, sprite[k].width, sprite[k].height,
             sprite[k].width * S * K_REC, sprite[k].height * S * K_REC, K_REC, ' '.join(nm)))
near = sorted((((a['pos_xy'][0] - b['pos_xy'][0]) ** 2 + (a['pos_xy'][1] - b['pos_xy'][1]) ** 2) ** .5,
               a['NAME'], b['NAME']) for a, b in itertools.combinations(cities, 2))[:5]
print('\n最近城距（原图 px / design px）:')
for dd, a, b in near:
    print('  %s–%s  %.1f px  → %.1f design px' % (a, b, dd, dd * S))
