import sys,struct
sys.path.insert(0,".")
import rq
t={0x444B0F:"allRush",0x444ACB:"allWait",0x4449A9:"frontFwd",0x444A35:"spread",0x444A80:"center",0x44554A:"retreat",0x44501B:"ambush",0x44505C:"lrFwd",0x444EEB:"allFwdCenter"}
lo,hi=0x480000,0x4C0000
data=rq.rb(lo,hi-lo)
hits=[]
for i in range(0,len(data)-4,4):
    v=struct.unpack_from("<I",data,i)[0]
    if v in t: hits.append((lo+i,v,t[v]))
print(len(hits))
for a,v,n in hits: print("0x%06X -> 0x%06X %s"%(a,v,n))
