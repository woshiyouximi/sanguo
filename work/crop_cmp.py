from PIL import Image
im = Image.open(r'F:\sanguo\work\sp_120.png')
# 左上（敌方）与左下（我方）各裁一块拼起来放大
a = im.crop((95, 200, 245, 350)).resize((300, 300), Image.LANCZOS)
b = im.crop((110, 560, 260, 710)).resize((300, 300), Image.LANCZOS)
out = Image.new('RGB', (620, 320), (20, 22, 26))
out.paste(a, (0, 10)); out.paste(b, (320, 10))
out.save(r'F:\sanguo\work\sp_compare.png')
print('ok')
