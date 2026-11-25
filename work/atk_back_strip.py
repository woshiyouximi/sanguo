import os, glob
from PIL import Image
d = r'F:\sanguo\project\anim\attack_back'
files = sorted(glob.glob(os.path.join(d, 'raw_*.png')))[1:34]   # 跳过 raw_000（那是驱动视频本身）
sel = files[::3]
w, h = 200, 346
sheet = Image.new('RGB', (w*len(sel), h), (30,30,34))
for i, f in enumerate(sel):
    sheet.paste(Image.open(f).convert('RGB').resize((w,h), Image.LANCZOS), (i*w, 0))
sheet.save(r'F:\sanguo\work\atk_back_strip.png')
print('sel', len(sel), sheet.size)
