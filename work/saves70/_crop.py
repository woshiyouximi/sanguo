from PIL import Image

src = r'F:\sanguo\work\saves70\map_forces.png'
im = Image.open(src).convert('RGB')
# 中原一带（洛陽/虎牢/陳留），看城環粗細與色相
box = (300, 430, 600, 720)
crop = im.crop(box).resize(((box[2] - box[0]) * 3, (box[3] - box[1]) * 3), Image.NEAREST)
crop.save(r'F:\sanguo\work\saves70\_crop.png')
print('ok', crop.size)
