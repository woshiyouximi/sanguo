import sys,struct,json
sys.path.insert(0,r'F:\sanguo\tools')
from smartscript import SOFile,OPS
sysc=json.load(open(r'F:\sanguo\export\script\syscall_table.json'))
use={}
for path in [r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO',r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO']:
    so=SOFile(path); n=path.split('\\')[-1]
    pc=so.code_start
    while pc+4<=so.code_end:
        op=struct.unpack_from('<i',so.data,pc)[0]
        if op not in OPS: pc+=4; continue
        kinds=OPS[op][1]; cnt=2 if kinds in ('YF','CO') else (1 if kinds else 0)
        if op==5:
            sid,fl=struct.unpack_from('<2i',so.data,pc+4)
            d=use.setdefault(sid,{'n':0,'files':{},'argc':set(),'ret':set()})
            d['n']+=1; d['files'][n]=d['files'].get(n,0)+1
            d['argc'].add(fl&0xffff); d['ret'].add((fl>>16)&0xffff)
        pc+=4+4*cnt
for sid in sorted(use):
    d=use[sid]; h=sysc.get(str(sid),0)
    print('0x%03X  n=%-4d argc=%-8s ret=%-6s host=0x%X  %s'%(sid,d['n'],sorted(d['argc']),sorted(d['ret']),h,d['files']))
print('total distinct',len(use))
