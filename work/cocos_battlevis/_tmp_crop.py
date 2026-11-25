from PIL import Image
im = Image.open(r"work\cocos_verify3\05_battle.png")
print(im.size)
# crop around A general page coords (441,857) and B (435,571)
for name, cx, cy in [("A",441,857),("B",435,571)]:
    box = (max(0,cx-110), max(0,cy-110), min(im.width,cx+110), min(im.height,cy+110))
    c = im.crop(box).resize(((box[2]-box[0])*3,(box[3]-box[1])*3), Image.LANCZOS)
    out = rf"work\cocos_battlevis\dbg_05_crop_{name}.png"
    c.save(out)
    print(name, box, out)
