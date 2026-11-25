# -*- coding: utf-8 -*-
"""Assemble dump.txt from the per-function dumps + table/scan dumps."""
import struct, io, os, rd

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'dump.txt')

def d32(va, n):
    off = rd.va2off(va)
    return list(struct.unpack('<%di' % n, rd.data[off:off + 4 * n]))

SECTIONS = [
 ('[1] 战力计算：B 方 0x442EFA（写 unitB+0x70 = 0x4B0410）', ['f_442EFA.txt']),
 ('[1] 战力计算：A 方 0x443498（写 unitA+0x70 = 0x4A8AD0）', ['f_443498.txt']),
 ('[1] 战力写 0x96 初值 + 单位初始化 0x43A1C4', ['f_43A1C4.txt']),
 ('[1] 阵形 id 归属 0x43A0F6(side, v)：side0→[0x4A6674]=A 阵, side1→[0x4A6678]=B 阵', ['f_43A0F6.txt']),
 ('[1] 战力唯一调用者 0x443A3E / 其调用链 0x443B84', ['f_443A3E.txt', 'f_443B84.txt']),
 ('[1] 0x43A14D 溃逃概率（clamp(士気,4,50)*6，士气>50 返 -1）', ['f_43A14D.txt']),
 ('[1] WARINFO05 0x445DBF：(帯兵+騎兵)*unit+0x70 的综合战力显示', ['f_445DBF.txt']),
 ('[2] 命中判定 0x43D400 / 0x43D4CB', ['f_43D400.txt']),
 ('[2] 判定辅助：0x43B6A8 / 0x43B6C9 / 0x43BE08', ['f_43B6A8.txt', 'f_43B6C9.txt', 'f_43BE08.txt']),
 ('[3] 戦後結算 0x41048D（疲労 += 15+rand%8 / 15+秒/10，cap100）', ['f_41048D.txt']),
 ('[3] 戦後呼び出し 0x447424', ['f_447424.txt']),
 ('[3] 疲労倍率表 0x4103DE', ['f_4103DE.txt']),
 ('[3] 月末処理 0x41B1BF + 呼び出し 0x41B613', ['f_41B1BF.txt', 'f_41B613.txt']),
 ('[3] 疲労 UI/ソート 0x413C32 / 0x44EEA6', ['f_413C32.txt', 'f_44EEA6.txt']),
 ('[3] 道具加減 0x4088FA / 0x408BDC（疲労 = item+0x50 Tire）', ['f_4088FA.txt', 'f_408BDC.txt']),
 ('[4] INI：0x42D1A3 GENERAL / 0x42ECCC ITEM', ['f_42D1A3.txt']),
 ('[5] 表アクセス：0x430766 相克 / 0x4307AE 地形 / 0x4307E5 陣形 / 0x4491AC', ['f_430766.txt', 'f_4307AE.txt', 'f_4307E5.txt', 'f_4491AC.txt']),
 ('[5] 兵種表アクセス：0x406499 / 0x406501', ['f_406499.txt', 'f_406501.txt']),
 ('[6] 武将技効果値 0x43E72E / AI 目標選択 0x44D3E0 / 0x40A571', ['f_43E72E.txt', 'f_44D3E0.txt', 'f_40A571.txt']),
]

buf = io.StringIO()
w = buf.write
w('# ============================================================\n')
w('# Sango2.exe 1.05+ (三国群英传2 修正版) 反汇编转储 — 战力 / 疲劳 / 守将属性\n')
w('# ImageBase 0x400000, PE32, 文件: 三国群英传2 修正版 1.05+\\Sango2.exe\n')
w('# 生成: python rd.py (pefile + capstone 5.0.7), 由 _mkdump.py 汇总\n')
w('# 注意: rd.py 的反汇编注释里 "data_xxx" 是把立即数误当跳转目标, 忽略即可\n')
w('# ============================================================\n\n')

for title, files in SECTIONS:
    w('\n' + '#' * 78 + '\n')
    w('# ' + title + '\n')
    w('#' * 78 + '\n')
    for fn in files:
        if not os.path.exists(fn):
            w('\n;; MISSING FILE: %s\n' % fn)
            continue
        with io.open(fn, encoding='utf-8') as f:
            txt = f.read()
        w('\n;; ---------- %s ----------\n' % fn)
        w(txt if txt.endswith('\n') else txt + '\n')

# ---- tables ----
w('\n' + '#' * 78 + '\n# [7] 数据表（从 .rdata 直接读）\n#' * 1 + '#' * 77 + '\n')
w('\n=== 兵种表 0x4862C8, 13 项 x 0x38 (id/sprite, 无强度值) ===\n')
for i in range(13):
    base = 0x4862C8 + i * 0x38
    w('t%02d @%08X  %s\n' % (i, base, ' '.join('%6d' % v for v in d32(base, 6))))

w('\n=== 兵种相克表 0x48CD88, 13x13 dword, stride 0x34 (行=己方兵种bit, 列=敌方) ===\n')
for r in range(13):
    w('r%02d  %s\n' % (r, ' '.join('%4d' % v for v in d32(0x48CD88 + r * 0x34, 13))))

w('\n=== 地形表 0x48D030, 12 地形 x 13 兵种, stride 0x34 ===\n')
for r in range(12):
    w('T%02d  %s\n' % (r, ' '.join('%4d' % v for v in d32(0x48D030 + r * 0x34, 13))))

w('\n=== 阵法相克表 0x48D2A0, 11x11 dword, stride 0x2C (调用传入 (己阵, 敌阵)，行=己方) ===\n')
for r in range(11):
    w('F%02d  %s\n' % (r, ' '.join('%4d' % v for v in d32(0x48D2A0 + r * 0x2C, 11))))

w('\n=== 0x4103DE(v, idx) = v*K/100，跳表 @0x410471（7 项 dword）===\n')
JT = [0x41045A, 0x41044A, 0x41043A, 0x41046A, 0x410401, 0x410414, 0x410427]
KS = {0x41045A: 30, 0x41044A: 50, 0x41043A: 75, 0x41046A: 100, 0x410401: 150,
      0x410414: 200, 0x410427: 250}
jt = list(struct.unpack('<7I', rd.data[rd.va2off(0x410471):rd.va2off(0x410471) + 28]))
for i, tgt in enumerate(jt):
    w('  idx+3=%d (idx=%+d) -> %08X  K=%d%%\n' % (i, i - 3, tgt, KS.get(tgt, -1)))

# ---- scans ----
for fn in ('scan_3a_full.txt', 'scan_96.txt', 'disp3a.txt'):
    if os.path.exists(fn):
        with io.open(fn, encoding='utf-8') as f:
            txt = f.read()
        w('\n' + '#' * 78 + '\n# [8] SCAN: %s\n' % fn + '#' * 78 + '\n')
        w(txt if txt.endswith('\n') else txt + '\n')

# ---- absolute-slot writers ----
from capstone import x86
w('\n' + '#' * 78 + '\n# [9] 对 unit+0x70 两个槽的绝对寻址读写（Q1 决定性证据）\n' + '#' * 78 + '\n')
for ins in rd.fins():
    for op in ins.operands:
        if op.type == x86.X86_OP_MEM and op.mem.base == 0 and op.mem.index == 0 \
                and op.mem.disp in (0x4A8AD0, 0x4B0410):
            w('  %08X %-6s %-42s fn=%08X\n' % (ins.address, ins.mnemonic, ins.op_str,
                                               rd.func_at(ins.address)[0]))

# ---- disp 0x3A write points ----
w('\n' + '#' * 78 + '\n# [10] 全 .text 中 [reg+0x3A] 的写点（共 45 处中的写）\n' + '#' * 78 + '\n')
for ins in rd.fins():
    if not ins.operands:
        continue
    a = ins.operands[0]
    if a.type == x86.X86_OP_MEM and a.mem.disp == 0x3A and ins.mnemonic in ('mov', 'add', 'sub'):
        f = rd.func_at(ins.address)
        w('  %08X %-5s %-30s fn=%08X\n' % (ins.address, ins.mnemonic, ins.op_str, f[0] if f else 0))

with io.open(OUT, 'w', encoding='utf-8') as f:
    f.write(buf.getvalue())
print('wrote', OUT, len(buf.getvalue().splitlines()), 'lines')
