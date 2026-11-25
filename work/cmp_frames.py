from PIL import Image
import os
root = r'F:\sanguo\game\assets\anim'
out = Image.new('RGB', (360, 220), (210, 210, 210))
for i, d in enumerate(('walk_back', 'walk_front')):
    im = Image.open(os.path.join(root, d, 'f005.png')).convert('RGBA')
    bg = Image.new('RGBA', im.size, (210, 210, 210, 255))
    bg.alpha_composite(im)
    out.paste(bg.convert('RGB').resize((160, 208)), (20 + i * 175, 6))
out.save(r'F:\sanguo\work\frames_cmp.png')
print('ok', Image.open(os.path.join(root, 'walk_front', 'f005.png')).size)
