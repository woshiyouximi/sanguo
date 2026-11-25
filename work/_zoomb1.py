from PIL import Image
im = Image.open(r"F:\sanguo\work\ui_bg_b1.png").convert("RGB").crop((0, 0, 780, 130))
im = im.resize((im.width, im.height*2), Image.LANCZOS)
im.save(r"F:\sanguo\work\_zoom_b1.png")
print(im.size)
