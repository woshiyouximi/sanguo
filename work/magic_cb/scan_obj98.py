"""扫描 Sango2.exe 的 .text，找出所有以 +0x98 为内存位移的指令及其所在函数。

用法:
  scan_obj98.py                 # 全扫描，只打印命中的指令（带前后各 3 条上下文）
  scan_obj98.py <VA> <size>     # 反汇编指定范围
"""
import sys
import pefile
import capstone

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"

pe = pefile.PE(EXE, fast_load=True)
data = open(EXE, "rb").read()
IB = pe.OPTIONAL_HEADER.ImageBase
SECTIONS = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData)
            for s in pe.sections]

md = capstone.Cs(capstone.CS_ARCH_X86, capstone.CS_MODE_32)
md.detail = True


def va2off(va):
    rva = va - IB
    for v, vs, p, rs in SECTIONS:
        if v <= rva < v + max(vs, rs):
            return p + (rva - v)
    return None


def text_range():
    for v, vs, p, rs in SECTIONS:
        # .text 通常是第一个可执行节
        return IB + v, min(vs, rs)


def disasm(va, size):
    off = va2off(va)
    return list(md.disasm(data[off:off + size], va))


def dump(va, size):
    print("; ==== %08X .. +%d ====" % (va, size))
    for ins in disasm(va, size):
        print("  %08X  %-20s %-7s %s" % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str))


def fmt(ins):
    return "  %08X  %-20s %-7s %s" % (ins.address, ins.bytes.hex(), ins.mnemonic, ins.op_str)


def main():
    if len(sys.argv) >= 3:
        va = int(sys.argv[1], 16)
        if va < IB:
            va += IB
        dump(va, int(sys.argv[2], 0))
        return

    lo, size = text_range()
    ins_list = disasm(lo, size)
    print("; .text %08X .. %08X, %d instructions" % (lo, lo + size, len(ins_list)))
    for i, ins in enumerate(ins_list):
        hit = False
        for op in ins.operands:
            if op.type == capstone.x86.X86_OP_MEM and op.mem.disp == 0x98 and op.mem.base != 0:
                hit = True
        if not hit:
            continue
        print("\n; ---- hit at %08X ----" % ins.address)
        for j in range(max(0, i - 4), min(len(ins_list), i + 5)):
            print(fmt(ins_list[j]) + ("   <<<<<" if j == i else ""))


main()
