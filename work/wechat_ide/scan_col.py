from PIL import Image
im = Image.open(r"F:\sanguo\work\wechat_ide\shots\v2_palette.png").convert("RGB")
px = im.load()
prev=None
for y in range(830, 880):
    r,g,b = px[400,y]
    print(y, (r,g,b))
