from PIL import Image

im = Image.open(r'F:\sanguo\work\saves70\map_forces.png').convert('RGB')
for name, box in {
    'top': (0, 236, 750, 336),
    'bot': (0, 820, 750, 910),
}.items():
    c = im.crop(box)
    c = c.resize((c.width * 2, c.height * 2), Image.NEAREST)
    c.save(fr'F:\sanguo\work\saves70\_band_{name}.png')
    print(name, c.size)
