import struct, sys
sys.path.insert(0,".")
import rq
lines=[]
for i in range(13):
    a=0x4862d8+i*0x38
    vals=[rq.u32(a+k*4) for k in range(14)]
    lines.append("%2d %08X : "%(i,a)+" ".join("%d"%v for v in vals))
    lines.append("            hex: "+" ".join("%08X"%v for v in vals))
txt="\n".join(lines)
open(r"F:\sanguo\work\orig_battle_behavior\07_anim_table_4862D8.txt","w",encoding="utf-8").write(txt)
print(txt)
