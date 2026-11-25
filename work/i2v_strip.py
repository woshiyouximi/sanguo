from PIL import Image
import os
d = r'F:\sanguo\cloud\_test_i2v_out'
fs = sorted([f for f in os.listdir(d) if f.endswith('.png')])
print(len(fs), fs[:2], fs[-1])
pick = [fs[0], fs[len(fs)//2], fs[-1]]
ims = [Image.open(os.path.join(d,f)).convert('RGB') for f in pick]
w,h = ims[0].size
sheet = Image.new('RGB',(w*3+20,h),(20,20,22))
for i,im in enumerate(ims): sheet.paste(im,(i*(w+10),0))
sheet.thumbnail((1200,600))
sheet.save(r'F:\sanguo\work\i2v_strip.jpg', quality=88)
print('saved', sheet.size)
