#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
save_fields.py — 抽取"存档段序列化函数"的字段写入点（原始指令，不做寄存器推断）。

用法:
    python save_fields.py <VA> <SIZE> [--full] [--base=REG[,REG...]]

默认只打印:
    * 写入 [reg+disp]（base 不是 ebp 的）—— 即"记录字段写入"
    * 所有 call（带目标地址 + 提示名）
    * push 立即数（作为 call 参数上下文）
每行前缀是**指令地址**，便于核对对齐。

--full  打印全部指令（含 ebp 局部变量与比较/跳转），用于人工确认控制流
--base  额外标注：把出现的绝对全局地址换成符号名（默认开启）
"""
import sys
from capstone import Cs, CS_ARCH_X86, CS_MODE_32
from capstone.x86 import X86_OP_MEM, X86_OP_REG, X86_OP_IMM

EXE = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\Sango2.exe'

GLOBALS = {
    0x4BD218: 'sec1_base', 0x4BD270: 'sec2_base', 0x4BD26C: 'sec3_base',
    0x4BD220: 'sec5_base', 0x4BD21C: 'sec6_base',
    0x4BD224: 'save_buf', 0x4BD268: 'save_hdr', 0x4BD274: 'save_cursor',
    0x4BD278: 'TotalCity', 0x4BD380: 'StartYear', 0x4BD390: 'CurYear',
    0x4BD394: 'TotalKing', 0x4BD3A8: 'TotalGeneral',
    0x4A64F0: 'PlayerKing', 0x4A64F4: 'PlayerKing2',
    0x4A64BC: 'MonthFlag', 0x4A64FC: 'YearFlag', 0x4A6440: 'Phase',
    0x4A6444: 'unk444', 0x4C30E0: 'MonthTimer', 0x4C30D8: 'unkD8',
    0x4C30DC: 'unkDC', 0x4A79C8: 'CmdFlags', 0x4C6AA0: 'CityPtrTable',
    0x4A6170: 'CityPool', 0x4A6180: 'GenPool', 0x4A6194: 'KingUsed',
}

CALL_HINT = {
    0x409430: 'Xform(King*)', 0x406A75: 'Xform(Gen*)', 0x40530B: 'Xform(City*)',
    0x405336: 'ObjAt_City(i)', 0x405450: 'CityAt(i)', 0x40945B: 'KingAt(i)',
    0x406A4A: 'Xform2(A)', 0x4387C2: 'Xform(Obj3*)', 0x43884C: 'Obj3At(i)?',
    0x46DF10: 'memcpy', 0x46DC60: 'strcpy', 0x46DC00: 'strcpy/strncpy',
    0x422DE1: 'map?', 0x422DAB: 'map?', 0x422DCA: 'map?', 0x422E52: 'map?',
    0x422E1D: 'map?', 0x422E3B: 'map?', 0x408EC3: 'blk7',
    0x40947B: 'KingStat1', 0x409485: 'KingStat2', 0x40948F: 'KingStat3',
    0x405356: 'CityStat1', 0x405360: 'CityStat2', 0x40536A: 'CityStat3',
    0x406A98: 'GenStat1', 0x406AA2: 'GenStat2', 0x406AAC: 'GenStat3',
    0x43886C: 'Obj3Stat1', 0x438876: 'Obj3Stat2', 0x438880: 'Obj3Stat3',
    0x4388BB: 'Obj3Global', 0x468799: 'sub468799', 0x455AB2: 'WriteFile',
    0x455A10: 'Open', 0x455A36: 'Close', 0x455C67: 'ChDir', 0x450451: 'free',
    0x46DAE0: 'memset', 0x450440: 'malloc?', 0x4082D9: 'sub4082D9',
    0x409C1D: 'sub409C1D', 0x409D19: 'sub409D19',
}

_md = Cs(CS_ARCH_X86, CS_MODE_32)
_md.detail = True


def off(va):
    return va - 0x400000 - 0x1000 + 0x400


def gname(va):
    return GLOBALS.get(va, 'g_%X' % va)


def annotate(text):
    import re
    def rep(m):
        v = int(m.group(1), 16)
        return gname(v) if v in GLOBALS else m.group(0)
    return re.sub(r'0x([0-9a-f]{5,8})\b', rep, text)


def main():
    va = int(sys.argv[1], 16)
    size = int(sys.argv[2], 0)
    full = '--full' in sys.argv
    mon = [a.split('=', 1)[1] for a in sys.argv if a.startswith('--mon=')]
    mon = mon[0].split(',') if mon else []
    data = open(EXE, 'rb').read()
    code = data[off(va):off(va) + size]
    pend = []
    for ins in _md.disasm(code, va):
        txt = '%s %s' % (ins.mnemonic, ins.op_str)
        show = full
        if ins.mnemonic == 'call' and ins.operands and ins.operands[0].type == X86_OP_IMM:
            t = ins.operands[0].imm & 0xFFFFFFFF
            print('%-9X CALL 0x%-8X %-16s  args[%s]' % (ins.address, t, CALL_HINT.get(t, ''), ', '.join(pend)))
            pend = []
            continue
        if ins.mnemonic == 'push' and ins.operands:
            o = ins.operands[0]
            if o.type == X86_OP_IMM:
                pend.append('0x%X' % (o.imm & 0xFFFFFFFF))
            elif o.type == X86_OP_MEM:
                pend.append(annotate(ins.op_str.replace('push ', '')))
            else:
                pend.append('reg')
            pend = pend[-4:]
            continue
        if ins.mnemonic.startswith('mov') and ins.operands:
            d = ins.operands[0]
            if d.type == X86_OP_MEM and (not d.mem.base or _rn(d.mem.base) != 'ebp'):
                print('%-9X WRITE %s' % (ins.address, annotate(txt)))
                continue
        if mon:
            hit = False
            for o in ins.operands:
                if o.type == X86_OP_MEM and o.mem.base and _rn(o.mem.base) in mon:
                    hit = True
            if hit:
                print('%-9X SRC   %s' % (ins.address, annotate(txt)))
                continue
        if full:
            print('%-9X       %s' % (ins.address, annotate(txt)))


def _rn(reg):
    return _md.reg_name(reg)


if __name__ == '__main__':
    main()
