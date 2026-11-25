from PIL import Image
import os
D = r"F:\sanguo\export\png\SHAPE\BG"
names = ["BG00A","BG00B","MG00A","FG00A"]
ims = [Image.open(os.path.join(D,n+".png")).convert("RGB") for n in names]
H = sum(i.height for i in ims); W = max(i.width for i in ims)
out = Image.new("RGB",(W,H))
y=0
for im in ims:
    out.paste(im,(0,y)); y+=im.height
out.save(r"F:\sanguo\work\_probe_bg_stack.jpg", quality=88)
print(out.size)
# 另看 B 组
names2 = ["BG00B","MG00B","FG00B"]
ims2=[Image.open(os.path.join(D,n+".png")).convert("RGB") for n in names2]
H2=sum(i.height for i in ims2); W2=max(i.width for i in ims2)
o2=Image.new("RGB",(W2,H2)); y=0
for im in ims2:
    o2.paste(im,(0,y)); y+=im.height
o2.save(r"F:\sanguo\work\_probe_bg_stack2.jpg", quality=88)
print(o2.size)
