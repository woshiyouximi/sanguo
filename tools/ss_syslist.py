import re, json, collections
tab=json.load(open(r'F:\sanguo\export\script\syscall_table.json',encoding='utf-8'))
host={int(k):v for k,v in tab.items()}
agg=collections.defaultdict(lambda: {'n':0,'args':set(),'ret':set(),'files':collections.Counter()})
for fn,label in [(r'F:\sanguo\export\script\magic_so.dis.txt','MAGIC'),(r'F:\sanguo\export\script\system_so.dis.txt','SYSTEM')]:
    for line in open(fn,encoding='utf-8'):
        m=re.search(r'SYSCALL\s+0x([0-9A-Fa-f]+),\s*0x([0-9A-Fa-f]+)',line)
        if not m: continue
        sid=int(m.group(1),16); fl=int(m.group(2),16)
        a=agg[sid]; a['n']+=1; a['args'].add(fl&0xffff); a['ret'].add(fl>>16); a['files'][label]+=1
print('distinct',len(agg))
for sid in sorted(agg):
    a=agg[sid]
    print('0x%03X n=%-4d argc=%s ret=%s host=0x%X %s'%(sid,a['n'],sorted(a['args']),sorted(a['ret']),host.get(sid,0),dict(a['files'])))
