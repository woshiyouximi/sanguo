from PIL import Image
jobs = [("g1", (470, 720, 780, 900)), ("m2", (330, 300, 780, 420)), ("m3", (560, 620, 780, 780)), ("d1", (300, 480, 700, 640))]
for name, box in jobs:
    im = Image.open(rf"F:\sanguo\work\ui_bg_{name}.png").convert("RGB").crop(box)
    im = im.resize((im.width*2, im.height*2), Image.LANCZOS)
    im.save(rf"F:\sanguo\work\_zoom_{name}.png")
    print(name, box, im.size)
