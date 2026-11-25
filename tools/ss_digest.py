import sys,json,re
sys.path.insert(0,r'F:\sanguo\tools')
import sango_dis as sd
sysc=json.load(open(r'F:\sanguo\export\script\syscall_table.json'))
used=[int(k) for k in sysc]
img=sd.image if hasattr(sd,'image') else None
import pefile
pe=pefile.PE(r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe')
mem=pe.get_memory_mapped_image(); BASE=0x400000
def d(va,n=60):
    off=va-BASE
    out=[]
    for ins in sd.md.disasm(mem[off:off+n],va):
        out.append('%s %s'%(ins.mnemonic,ins.op_str))
        if ins.mnemonic=='ret': break
    return out
def calls(va):
    res=[];strings=[];imms=[]
    for l in d(va,120):
        m=re.match(r'call (0x[0-9a-f]+)',l)
        if m: res.append(m.group(1)); continue
        m=re.match(r'push (0x[0-9a-f]+)',l)
        if m:
            v=int(m.group(1),16)
            if 0x47f000<=v<0x4d5000:
                try: strings.append(sd.read_cstr(mem,v-BASE))
                except Exception: imms.append(hex(v))
            else: imms.append(hex(v))
        m=re.match(r'mov (?:dword ptr )?\[(0x[0-9a-f]+)\]',l)
        if m:
            v=int(m.group(1),16)
            if 0x480000<=v<0x4d5000: imms.append('['+hex(v)+']')
    return res,strings,imms
print('id    handler    calls / strings')
for sid in sorted(int(x) for x in sysc):
    va=sysc[str(sid)]
    if not (0x100<=sid<=0x220): continue
    c,s,i=calls(va)
    print('0x%03X 0x%X  calls=%s  str=%s  imm=%s'%(sid,va,','.join(c[:5]),'|'.join(s[:3]),','.join(i[:6])))
