import sys, struct
sys.path.insert(0,r'F:\sanguo\tools')
import smartscript as ss
for p in [r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO.OLD', r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO.OLD']:
    so=ss.SOFile(p); print(p, 'code_end 0x%X'%so.code_end, 'funcs',len(so.funcs))
so=ss.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
for f in so.funcs:
    if f['name'] in ('ExplodeRound','Magic4','Magic5','Magic6','Magic7','Spout','Powder','RollTub','OnFire'):
        print(f['name'], hex(f['off']), f['argc'])
