import sys, struct
sys.path.insert(0,r'F:\sanguo\tools')
import pefile
pe=pefile.PE(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe')
mem=pe.get_memory_mapped_image(); BASE=0x400000
tstart=0x1000; tsize=0x7D38E
targets={0x4650E0:'RunById',0x4653F0:'RunByName',0x4654C0:'RunByPtr',0x464F60:'LoadScript',0x465700:'VMUpdate',0x467F10:'VMStep',0x4658C0:'CurScript?',0x465820:'FindObj'}
for tgt,name in targets.items():
    hits=[]
    for off in range(tstart,tstart+tsize-5):
        if mem[off]==0xE8:
            rel=struct.unpack_from('<i',mem,off+1)[0]
            if (BASE+off+5+rel)&0xffffffff==tgt: hits.append(BASE+off)
    print(name,hex(tgt),'callers',[hex(h) for h in hits][:15],'n=',len(hits))
