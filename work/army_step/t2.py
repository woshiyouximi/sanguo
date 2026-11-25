import sys,struct
sys.path.insert(0,r"F:\sanguo\work\army_step")
import rq
rb=rq.rb
print("== 0x485B10 rows (33 x 5 dwords) ==")
rows=[]
for r in range(33):
    vals=struct.unpack("<5i", rb(0x485B10+r*0x14,20))
    rows.append(vals)
    print(r, [hex(v) for v in vals])
def pairs(p,n=40):
    return struct.unpack("<%dh"%(2*n), rb(p,4*n))
print("== row0 ptr0 extent ==")
seen=set()
for r in range(0,33):
    for c in range(5):
        p=rows[r][c]
        if p<0x400000 or p>0x600000 or p in seen: continue
        seen.add(p)
        d=pairs(p,30)
        xs=[d[i] for i in range(0,len(d),2)]; ys=[d[i+1] for i in range(0,len(d),2)]
        print("row%2d slot%d ptr=%08x  x[%d..%d] y[%d..%d]"%(r,c,p,min(xs),max(xs),min(ys),max(ys)))
