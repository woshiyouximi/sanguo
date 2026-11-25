"""三行對照條：before / gridShade 版 / gridWeave 版，同一塊空區（設計 300,340-750,470）。"""
from PIL import Image

box = (300, 340, 750, 470)
names = [
    ("before750_deploy.png", "before"),
    ("after750_deploy.png", "gridShade(seam)"),
    ("weave750_deploy.png", "gridWeave(new)"),
]
w = box[2] - box[0]
h = box[3] - box[1]
out = Image.new("RGB", (w, (h + 8) * len(names)), (0, 0, 0))
for i, (n, _) in enumerate(names):
    im = Image.open("work\\cocos_render4\\" + n).convert("RGB")
    out.paste(im.crop(box), (0, i * (h + 8)))
out.save("work\\cocos_render4\\cmp_bands.png")
print("saved cmp_bands.png", out.size, [n for n, _ in names])
