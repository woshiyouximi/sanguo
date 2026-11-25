import sys,struct
sys.path.insert(0,".")
import rq
# find all dwords equal to given targets within the mapped image
def findptr(targets):
    hits=[]
    lo,hi=0x400000,0x47F000
    data=rq.rb(lo,hi-lo)
    for i in range(0,len(data)-4,4):
        v=struct.unpack_from("<I",data,i)[0]
        if v in targets:
            hits.append((lo+i,v))
    return hits
t={0x444B0F:"allRush",0x444ACB:"allWait",0x4449A9:"frontFwd",0x444A35:"spread",0x444A80:"center",0x44554A:"retreat",0x444E36:"allBack",0x444CCF:"leftFwd"}
hits=findptr(set(t))
out=[]
for a,v in hits:
    out.append("0x%06X -> 0x%06X %s"%(a,v,t[v]))
txt="\n".join(out)
print(txt[:4000])
open(r"F:\sanguo\work\orig_battle_behavior\10_cmd_pointer_table.txt","w",encoding="utf-8").write(txt)
