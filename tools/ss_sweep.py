# -*- coding: utf-8 -*-
"""Quick linear sweep over Smart Script code area to validate opcode table."""
import struct, sys, collections
sys.path.insert(0, r'F:\sanguo\tools')

OPS = {
 0x00:("NOP",0),0x01:("RET",1),0x02:("RETV",1),0x03:("PUSHN",1),
 0x04:("CALL",1),0x05:("VCALL",2),0x06:("PUSHI",1),0x07:("PUSHS",1),
 0x08:("LDSL",1),0x09:("LDSG",1),0x0A:("LDG",1),0x0B:("STL",1),
 0x0C:("STG",1),0x0D:("STE",1),0x0E:("POP",0),0x0F:("ADD",0),
 0x10:("FADD",0),0x11:("SCMP",0),0x12:("SUB",0),0x13:("FSUB",0),
 0x14:("MUL",0),0x15:("FMUL",0),0x16:("DIV",0),0x17:("FDIV",0),
 0x18:("MOD",0),0x19:("X19",0),0x1A:("NEG",0),0x1B:("FNEG",0),
 0x1C:("NOT",0),0x1D:("INCL",1),0x1E:("INCG",1),0x1F:("INCE",1),
 0x20:("DECL",1),0x21:("DECG",1),0x22:("DECE",1),0x23:("AND",0),
 0x24:("OR",0),0x25:("XOR",0),0x26:("EQ",0),0x27:("EQ",0),
 0x28:("SEQ",0),0x29:("NE",0),0x2A:("NE",0),0x2B:("SNE",0),
 0x2C:("GT",0),0x2D:("FGT",0),0x2E:("SGT",0),0x2F:("GE",0),
 0x30:("FGE",0),0x31:("SGE",0),0x32:("LT",0),0x33:("FLT",0),
 0x34:("SLT",0),0x35:("LE",0),0x36:("FLE",0),0x37:("SLE",0),
 0x38:("LNOT",0),0x39:("LAND",0),0x3A:("LOR",0),0x3B:("JMP",1),
 0x3C:("JZ",1),0x3D:("JNZ",1),0x3E:("SHL",0),0x3F:("SHR",0),
 0x40:("CASE",2),0x41:("NOP",0),0x42:("WAIT",0),0x43:("NOP",0),
 0x44:("NOP",0),0x45:("X45",0),0x46:("X46",0),0x47:("X47",0),
 0x48:("I2F",0),0x49:("I2S",0),0x4A:("F2I",0),0x4B:("F2S",0),
 0x4C:("X4C",0),0x4D:("X4D",0),0x4E:("X4E",1),0x4F:("X4F",1),
 0x50:("LDGI",1),0x51:("STLI",1),0x52:("STGI",1),0x53:("STEI",1),
 0x54:("INCLI",1),0x55:("INCGI",1),0x56:("INCEI",1),0x57:("DECLI",1),
 0x58:("DECGI",1),0x59:("DECEI",1),
}

def parse(path):
    b = open(path,'rb').read()
    symoff, symcnt, stroff, strcnt, unk, end = struct.unpack_from('<6I', b, 0x18)
    syms=[]
    for i in range(symcnt):
        code, argc, nameoff, sid = struct.unpack_from('<4I', b, symoff+i*16)
        # name
        p = nameoff
        if p < len(b):
            e = b.index(b'\0', p)
            nm = b[p:e].decode('gbk','replace')
        else:
            nm='?'
        syms.append((code, argc, nm, sid, nameoff))
    return b, syms, dict(symoff=symoff,symcnt=symcnt,stroff=stroff,strcnt=strcnt,end=end)

def sweep(path):
    b, syms, hdr = parse(path)
    starts = {s[0] for s in syms}
    pc = 0x40
    limit = hdr['symoff']
    freq = collections.Counter()
    unknown = []
    insns = 0
    while pc + 4 <= limit:
        op = struct.unpack_from('<I', b, pc)[0]
        freq[op]+=1
        if op not in OPS:
            unknown.append(pc)
            pc += 4
            continue
        n = OPS[op][1]
        pc += 4 + 4*n
        insns += 1
    return b, syms, hdr, freq, unknown, insns, starts

if __name__ == '__main__':
    for f in [r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO', r'F:\sanguo\extract\pak\SCRIPT\SYSTEM.SO']:
        b, syms, hdr, freq, unknown, insns, starts = sweep(f)
        total = insns + len(unknown)
        print(f)
        print('  hdr', hdr, 'sym', len(syms))
        print('  insns', insns, 'unknown dwords', len(unknown), 'ratio %.3f%%' % (100.0*len(unknown)/max(total,1)))
        print('  unknown offsets', [hex(x) for x in unknown[:20]])
        print('  top ops', [(OPS.get(k,('?',0))[0], hex(k), v) for k,v in freq.most_common(20)])
        print('  X19', freq[0x19], 'X45', freq[0x45], 'X46', freq[0x46], 'X47', freq[0x47], 'X4C', freq[0x4C], 'X4D', freq[0x4D], 'X4E', freq[0x4E], 'X4F', freq[0x4F])
        print('  last pc', hex(0x40), 'limit', hex(hdr['symoff']))
