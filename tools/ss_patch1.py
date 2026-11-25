import re
p=r'F:\sanguo\tools\smartscript.py'
s=open(p,encoding='utf-8').read()
s=s.replace("""def slot_name(idx):
    return ('arg%d' % (-idx - 1)) if idx < 0 else ('loc%d' % idx)""",
"""LOC_OPS = (0x08, 0x0B, 0x1D, 0x20, 0x4E, 0x51, 0x54, 0x57)
GLB_OPS = (0x09, 0x0C, 0x1E, 0x21, 0x4F, 0x52, 0x55, 0x58)


def slot_name(op, idx):
    if op in GLB_OPS:
        return 'g%d' % idx
    if op in LOC_OPS:
        return ('arg%d' % (-idx)) if idx < 0 else ('loc%d' % idx)
    return str(idx)""")
s=s.replace("""            vals.append(slot_name(v) if op in (0x08, 0x09, 0x0B, 0x0C, 0x4E, 0x4F) else str(v))""",
"""            vals.append(slot_name(op, v))""")
s=s.replace("""            vals = [str(sid), '0x%X' % (flags & 0xffffffff)]""",
"""            vals = ['0x%X' % sid, '0x%X' % (flags & 0xffffffff)]""")
open(p,'w',encoding='utf-8').write(s)
print('patched')
