import sys
sys.path.insert(0,".")
import rq
out=[]
hdr="idx  base      rng0 rng1  f08  f0C  f10  f14  f18 | dur0 dur1 dur2(+1C,+20,+24,+28) | f2C f30 f34"
out.append(hdr)
for i in range(13):
    a=0x4862bc+i*0x38
    v=[rq.u32(a+k*4) for k in range(14)]
    out.append("%2d %08X  %4d %4d %4d %4d %4d %4d %4d | %4d %4d %4d %4d | %4d %4d %4d"%(
        i,a,v[0],v[1],v[2],v[3],v[4],v[5],v[6],v[7],v[8],v[9],v[10],v[11],v[12],v[13]))
txt="\n".join(out)
open(r"F:\sanguo\work\orig_battle_behavior\07b_unit_table_4862BC.txt","w",encoding="utf-8").write(txt)
print(txt)
