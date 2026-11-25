from PIL import Image, ImageChops

a = Image.open(r"F:\sanguo\work\cocos_battlevis\02_battle_t3.png").convert("RGB")
print("full", a.size)
c = a.crop((337, 671, 537, 871)).resize((600, 600), Image.NEAREST)
c.save(r"F:\sanguo\work\cocos_battlevis\dbg_fullcrop_A.png")
b = Image.open(r"F:\sanguo\work\cocos_battlevis\03_general_A.png").convert("RGB")
print("clip", b.size)
d = ImageChops.difference(c, b)
print("bbox diff", d.getbbox())
hist = d.convert("L").histogram()
nonzero = sum(hist[8:])
print("pixels differing >8:", nonzero, "of", 600 * 600)
