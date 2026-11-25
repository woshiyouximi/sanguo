# -*- coding: utf-8 -*-
"""rows85: 反汇编 Sango2.exe 的 VA 区间，输出 UTF-8。

用法：
    python dis85.py 0x427A84 0x200            # 反汇编
    python dis85.py 0x427A84 0x200 -o out.txt # 写文件
    python dis85.py --xref 0x48B2E8           # 找引用该字符串的 push
    python dis85.py --str 0x427EF5            # 打印该 VA 处的串
字符串按 cp950（Big5）解，解不出再退回 latin1。
"""
import sys
import pefile
from capstone import Cs, CS_ARCH_X86, CS_MODE_32

EXE = r"C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe"
pe = pefile.PE(EXE, fast_load=True)
IB = pe.OPTIONAL_HEADER.ImageBase
SEC = [(s.VirtualAddress, s.Misc_VirtualSize, s.PointerToRawData, s.SizeOfRawData,
        s.Name.rstrip(b'\0').decode('latin1')) for s in pe.sections]
data = open(EXE, 'rb').read()


def va2off(va):
    rva = va - IB
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if vaddr <= rva < vaddr + max(vsize, rsize):
            return ptr + (rva - vaddr)
    return None


def off2va(off):
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if ptr <= off < ptr + rsize:
            return IB + vaddr + (off - ptr)
    return None


def cstr(va, maxlen=96):
    o = va2off(va)
    if o is None:
        return None
    e = data.find(b'\0', o, o + maxlen)
    if e < 0:
        return None
    b = data[o:e]
    if len(b) < 2:
        return None
    for enc in ('cp950', 'latin1'):
        try:
            s = b.decode(enc)
        except Exception:
            continue
        if enc == 'latin1' and not all(0x20 <= c < 0x7f for c in b):
            continue
        return s if enc == 'latin1' else s
    return None


def show_str(va):
    o = va2off(va)
    if o is None:
        print('VA %08X: not mapped' % va)
        return
    e = data.find(b'\0', o, o + 200)
    b = data[o:e]
    out = []
    for enc in ('cp950', 'latin1'):
        try:
            out.append('%s=%r' % (enc, b.decode(enc)))
        except Exception:
            out.append('%s=<fail>' % enc)
    print('VA %08X len=%d  %s' % (va, len(b), '  '.join(out)))


def xref_str(target_va):
    """找所有 push/mov imm32 == target_va 的指令地址（线性扫 .text）。"""
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    hits = []
    for vaddr, vsize, ptr, rsize, nm in SEC:
        if nm != '.text':
            continue
        blob = data[ptr:ptr + rsize]
        base = IB + vaddr
        for ins in md.disasm(blob, base):
            if ins.mnemonic in ('push', 'mov', 'cmp') and ins.op_str.startswith('0x'):
                try:
                    v = int(ins.op_str, 16)
                except ValueError:
                    continue
                if v == target_va:
                    hits.append(ins.address)
    for h in hits:
        print('xref %08X' % h)
    if not hits:
        print('xref: none')


def disasm(va, n, out=None):
    off = va2off(va)
    md = Cs(CS_ARCH_X86, CS_MODE_32)
    lines = []
    for ins in md.disasm(data[off:off + n], va):
        txt = ins.mnemonic + ' ' + ins.op_str
        cm = ''
        if ins.mnemonic in ('push', 'mov', 'cmp', 'call') and '0x' in ins.op_str:
            parts = ins.op_str.split(', ')
            for p in parts:
                if p.startswith('0x'):
                    try:
                        s = cstr(int(p, 16))
                    except ValueError:
                        continue
                    if s and len(s) >= 2:
                        cm = '   ; "%s"' % s
                        break
        lines.append('%08X  %-34s%s' % (ins.address, txt, cm))
    text = '\n'.join(lines) + '\n'
    if out:
        open(out, 'w', encoding='utf-8', newline='\n').write(text)
        print('wrote %s (%d lines)' % (out, len(lines)))
    else:
        sys.stdout.write(text)


if __name__ == '__main__':
    a = sys.argv[1:]
    if a and a[0] == '--str':
        show_str(int(a[1], 16))
    elif a and a[0] == '--xref':
        xref_str(int(a[1], 16))
    else:
        va = int(a[0], 16)
        n = int(a[1], 16) if len(a) > 1 and not a[1].startswith('-o') else 0x200
        out = None
        if '-o' in a:
            out = a[a.index('-o') + 1]
        disasm(va, n, out)
