import sys,struct
sys.path.insert(0,r'F:\sanguo\tools')
from smartscript import SOFile,OPS
so=SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
st=sorted(f['off'] for f in so.funcs)+[so.code_end]
for i,f in enumerate(so.funcs):
    if not f['name'].startswith('Magic'): continue
    pc=f['off']; calls=[]; args=[]
    while pc+4<=st[i+1]:
        op=struct.unpack_from('<i',so.data,pc)[0]
        if op not in OPS: pc+=4; continue
        kinds=OPS[op][1]; cnt=2 if kinds in ('YF','CO') else (1 if kinds else 0)
        if op==4:
            t=struct.unpack_from('<i',so.data,pc+4)[0]
            tf=so.by_off.get(t); calls.append(tf['name'] if tf else hex(t))
        if op==6: args.append(struct.unpack_from('<i',so.data,pc+4)[0])
        pc+=4+4*cnt
    print('%-10s -> %-22s args=%s'%(f['name'],calls[0] if calls else '?',args))
