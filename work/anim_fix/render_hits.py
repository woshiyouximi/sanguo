# 把 dump_hits.json 里的 sprite 指令用 Pillow 合成成 PNG（等价于浏览器里 ctx.drawImage 的那一层）。
# 用途：不开浏览器也能肉眼验证「挥砍只在出手时 / 受击白闪 / 尸体放倒」。
import json, math, os
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
GAME = os.path.abspath(os.path.join(HERE, '..', '..', 'game'))
SHEETS = {
    'units_00.png': Image.open(os.path.join(GAME, 'web', 'anim', 'units_00.png')).convert('RGBA'),
    'actions_00.png': Image.open(os.path.join(GAME, 'web', 'anim', 'actions_00.png')).convert('RGBA'),
}
dump = json.load(open(os.path.join(HERE, 'hits_dump.json'), encoding='utf8'))

# 以命中点为圆心裁一小块，放大看动作
fx, fy = dump['focus']
CROP = (int(fx) - 150, int(fy) - 130, int(fx) + 150, int(fy) + 90)
SCALE = 2.6
BG = (150, 120, 82, 255)

def panel(p):
    img = Image.new('RGBA', (750, 1334), BG)
    for s in p['sprites']:
        sheet = SHEETS[s['sheet']]
        src = sheet.crop((s['sx'], s['sy'], s['sx'] + s['sw'], s['sy'] + s['sh']))
        w = max(1, int(round(s['w']))); h = max(1, int(round(s['h'])))
        src = src.resize((w, h), Image.LANCZOS)
        if s['alpha'] < 1:
            a = src.getchannel('A').point(lambda v: int(v * s['alpha']))
            src.putalpha(a)
        if abs(s['rot']) > 1e-4 and s['comp'] != 'lighter':
            deg = -math.degrees(s['rot'])
            big = src.rotate(deg, resample=Image.BICUBIC, expand=True)
            # 绕「脚底中心」旋转：把旋转后的图摆回去
            px = int(round(s['x'] - big.width / 2))
            py = int(round(s['y'] - big.height / 2))
        else:
            big = src
            px = int(round(s['x'] - w / 2))
            py = int(round(s['y'] - h))
        img.alpha_composite(big, (px, py)) if 0 <= px < 750 and 0 <= py < 1334 else None
        if s['comp'] == 'lighter':
            # 白闪：近似成「整张提亮」，比 canvas 的 lighter 弱一点，够看
            img.alpha_composite(big, (px, py)) if 0 <= px < 750 and 0 <= py < 1334 else None
    return img.crop(CROP).resize((int((CROP[2] - CROP[0]) * SCALE), int((CROP[3] - CROP[1]) * SCALE)), Image.LANCZOS)

panels = [panel(p) for p in dump['panels']]
cw, ch = panels[0].size
cols, rows = 4, 2
sheet = Image.new('RGBA', (cw * cols, ch * rows), (20, 20, 24, 255))
for i, im in enumerate(panels):
    px, py = (i % cols) * cw, (i // cols) * ch
    sheet.alpha_composite(im, (px, py))
    tag = f"t{dump['panels'][i]['tick']}"
    if dump['panels'][i]['tick'] == dump['hitTick']:
        tag += "  <- HIT"
    d = ImageDraw.Draw(sheet)
    d.rectangle((px + 4, py + 4, px + 118, py + 26), fill=(0, 0, 0, 200))
    d.text((px + 10, py + 8), tag, fill=(255, 220, 120, 255))
sheet.convert('RGB').save(os.path.join(HERE, 'hits_seq.png'))
print('hits_seq.png', sheet.size, 'ticks', [p['tick'] for p in dump['panels']])
