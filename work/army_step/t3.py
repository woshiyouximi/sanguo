import sys,struct
sys.path.insert(0,r"F:\sanguo\work\army_step")
import rq
rb=rq.rb
anch=[]
for a in range(33):
    v=struct.unpack("<6h", rb(0x485DA8+a*0x0C,12))
    anch.append(v[5])
print("anchors:", anch)
# 每个阵形的 x 极值（5 个分区合并）
rows=[struct.unpack("<5i", rb(0x485B10+r*0x14,20)) for r in range(9)]
print("formation  anchor  rawXmax  cellXmax(N=100)  cellXmax(N=200)")
for f in range(9):
    xs=[]
    for c in range(5):
        p=rows[f][c]
        if p<0x400000 or p>0x600000: continue
        n=0
        while True:
            x,y=struct.unpack("<2h", rb(p+n*4,4))
            if abs(x)>40 or abs(y)>40: break
            xs.append(x); n+=1
            if n>400: break
    if not xs: continue
    for N in (100,200):
        off=(200-N)//25
        print("  %d      %2d      %3d       %3d            %3d"%(f,anch[f],max(xs),anch[f]+max(xs)+off,anch[f]+max(xs)+off))
print()
print("A 侧格X = 71 - (表X + 锚 + (200-N)/25)")
for f in range(9):
    pass
