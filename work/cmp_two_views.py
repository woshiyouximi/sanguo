from PIL import Image
import os
d = r'F:\sanguo\project\art_ref'
a = Image.open(os.path.join(d,'soldier_back.png')).convert('RGB')
b = Image.open(os.path.join(d,'soldier_front.png')).convert('RGB')
w,h = a.size
sheet = Image.new('RGB',(w*2+20,h),(20,20,22))
sheet.paste(a,(0,0)); sheet.paste(b,(w+20,0))
sheet.save(os.path.join(d,'_two_views.jpg'), quality=90)
print(sheet.size)
