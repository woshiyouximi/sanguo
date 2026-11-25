import sys,struct
sys.path.insert(0,r'F:\sanguo\tools')
from smartscript import SOFile,OPS
for path in [r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO',r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO']:
    so=SOFile(path); st=sorted(f['off'] for f in so.funcs)+[so.code_end]
    bad=[]; lastops={}
    for i,f in enumerate(so.funcs):
        end=st[i+1]; pc=f['off']; last=None
        while pc+4<=end:
            op=struct.unpack_from('<i',so.data,pc)[0]
            if op not in OPS: bad.append((f['name'],hex(pc),'unknown')); break
            kinds=OPS[op][1]; n=2 if kinds in ('YF','CO') else (1 if kinds else 0)
            last=op; pc+=4+4*n
        if pc!=end: bad.append((f['name'],hex(pc),hex(end)))
        if last not in (0x01,0x02): bad.append((f['name'],'lastop',hex(last) if last is not None else None))
        lastops[last]=lastops.get(last,0)+1
    print(path.split('\\')[-1],'funcs',len(so.funcs),'bad',len(bad),bad[:6],'lastops',lastops)
