from PIL import Image
im = Image.open(r'F:\sanguo\work\sp_120.png')
# 单个敌兵（左上第一排）与我方倒数第二排，各放大 5 倍
enemy = im.crop((110, 215, 160, 280)).resize((250, 325), Image.NEAREST)
mine  = im.crop((120, 570, 170, 635)).resize((250, 325), Image.NEAREST)
out = Image.new('RGB', (520, 340), (240, 240, 240))
out.paste(enemy, (5, 8)); out.paste(mine, (265, 8))
out.save(r'F:\sanguo\work\sp_zoom.png')
print('ok')
