from PIL import Image, ImageChops

full = Image.open(r"F:\sanguo\work\cocos_battlevis\10_cal_full.png").convert("RGB")
top = Image.open(r"F:\sanguo\work\cocos_battlevis\10_cal_clipTop.png").convert("RGB")
print("full", full.size, "clipTop", top.size)
ref = full.crop((0, 0, top.size[0], top.size[1]))
d = ImageChops.difference(ref, top)
print("top-strip bbox diff", d.getbbox())
h = d.convert("L").histogram()
print("top differing>8:", sum(h[8:]), "of", top.size[0] * top.size[1])
