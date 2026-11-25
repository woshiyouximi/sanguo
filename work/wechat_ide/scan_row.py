from PIL import Image
import sys
p = r"F:\sanguo\work\wechat_ide\shots\v2_00_boot.png"
im = Image.open(p).convert("RGB")
W,H = im.size
px = im.load()
rows=[]
for y in range(895, 995):
    n=0
    for x in range(210, 520, 2):
        r,g,b = px[x,y]
        if r>40 and r-b>18 and g-b>8 and r>=g:
            n+=1
    rows.append((y,n))
for y,n in rows:
    if n>20: print(y,n)
