# -*- coding: utf-8 -*-
"""只读：展开 0x48EE78 的 198 项命令对象指针表，统计去重后逐个反汇编入口前 24 字节。

输出：work/battle_audit/cmd_obj_table.txt
"""
import struct
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
data = open(EXE, "rb").read()
SEC = [(s.Name.rstrip(b"\0").decode(), s.VirtualAddress, s.Misc_VirtualSize,
        s.PointerToRawData, s.SizeOfRawData) for s in pe.sections]


def va2off(va):
    rva = va - IB
    for n, v, vs, p, rs in SEC:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


TBL = 0x48EE78
md = Cs(CS_ARCH_X86, CS_MODE_32)
out = open(r"F:\sanguo\work\battle_audit\cmd_obj_table.txt", "w", encoding="utf-8")
vals = []
for i in range(198):
    off = va2off(TBL + i * 4)
    vals.append(struct.unpack_from("<I", data, off)[0])
seen = []
for v in vals:
    if v not in seen:
        seen.append(v)
out.write("198 项，去重 %d 个入口\n\n" % len(seen))
for g in range(33):
    row = vals[g * 6:g * 6 + 6]
    out.write("组%02d: %s\n" % (g, " ".join("%08X" % x for x in row)))
out.write("\n=== 去重入口 ===\n")
for v in seen:
    out.write("\n--- %08X ---\n" % v)
    off = va2off(v)
    code = data[off:off + 40]
    for ins in md.disasm(code, v):
        out.write("  %08X %-8s %s\n" % (ins.address, ins.mnemonic, ins.op_str))
        if ins.address - v > 20:
            break
out.close()
print("distinct", len(seen))
