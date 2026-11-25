from PIL import Image
im = Image.open(r"F:\sanguo\work\cocos_verify\h01_cmd6.png")
for name, box in (("h01_crop_top_left", (55, 5, 385, 120)), ("h01_crop_top_right", (495, 5, 835, 120))):
    im.crop(box).resize(((box[2]-box[0])*4, (box[3]-box[1])*4), Image.LANCZOS).save(r"F:\sanguo\work\cocos_verify\%s.png" % name)
print("ok")
