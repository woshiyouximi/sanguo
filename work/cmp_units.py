from PIL import Image, ImageDraw
import os, glob

def load(p):
    im = Image.open(p).convert('RGBA')
    return im

# 原作：弓箭兵（FORCE 里 M + 兵种 + H/动作 + 帧），取几帧找带弓的
cands = sorted(glob.glob(r'F:\sanguo\export\png\SHAPE\FORCE\*.png'))[:400]
orig_archer = None
for p in cands:
    im = load(p)
    if im.width >= 40 and im.height >= 40:
        orig_archer = (p, im)
        break

# 原作：武将（MAJOR\BODY）
orig_body = load(r'F:\sanguo\export\png\SHAPE\MAJOR\BODY\L0A10005.png')

# 我们：弓兵背面 + 朴刀
our_bow = load(r'F:\sanguo\project\anim\units_v1\archer_back\f008.png')
our_blade = load(r'F:\sanguo\project\anim\units_v1\walk_side\f004.png')

W, H = 960, 520
sheet = Image.new('RGB', (W, H), (16, 19, 25))
d = ImageDraw.Draw(sheet)

def paste_scaled(im, box, maxw, maxh):
    r = min(maxw / im.width, maxh / im.height)
    nw, nh = max(1, int(im.width * r)), max(1, int(im.height * r))
    im2 = im.resize((nw, nh), Image.NEAREST if r >= 2 else Image.LANCZOS)
    x = box[0] + (maxw - nw) // 2
    y = box[1] + (maxh - nh) // 2
    sheet.paste(im2, (x, y), im2)

# 左：原作
if orig_archer:
    paste_scaled(orig_archer[1], (20, 40), 300, 380)
paste_scaled(orig_body, (340, 40), 200, 380)
# 右：我们
paste_scaled(our_bow, (560, 40), 170, 380)
paste_scaled(our_blade, (760, 40), 170, 380)

d.text((20, 12), "Sango2 original (FORCE archer / MAJOR body)", fill=(200, 205, 215))
d.text((560, 12), "ours (units atlas, 80x104)", fill=(216, 179, 106))
d.text((20, 440), "orig 46-94px sprites, 8 actions, single side view + mirror", fill=(140, 146, 158))
d.text((20, 462), "ours: real back/front split, 17 frames walk, AI pose strength 0.65 for attack", fill=(140, 146, 158))
d.text((20, 484), "note: orig archer frame picked arbitrarily for scale reference", fill=(110, 116, 128))
sheet.save(r'F:\sanguo\project\img\compare_units.png')
print('saved', sheet.size, orig_archer[0] if orig_archer else None)
