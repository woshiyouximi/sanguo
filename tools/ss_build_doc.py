# -*- coding: utf-8 -*-
import io, sys
p = r'F:\sanguo\docs\04-脚本引擎SmartScript.md'
s = open(p, encoding='utf-8').read()
s = s.replace('| MAGIC.SO.OLD | 259,496 (0x3F5A8) | 0x3D460 | 454 | 0x3F0C0 | 314 | 0x79 | 0x3F5A8-0x48 | 0x40–0x3A??? |',
              '| MAGIC.SO.OLD | 259,496 (0x3F5A8) | 0x3D460 | 454 | 0x3F0C0 | 314 | 0x79 | 0x3F5A8-0x48 | 0x40–0x3C435 |')
s = s.replace('### 8.4 `ExplodeRound`（@?，argc=3，Magic8 的实现）',
              '### 8.4 `ExplodeRound`（@0xF228，argc=3，Magic8 的实现）')
s = s.replace('| 0x1F8 (Magic4) | — | `Spout` | 0 |', '| 0x1F8 (Magic4) | 0x3AB78 | `Spout` | 0 |')
s = s.replace('| 0x1F9 (Magic5) | — | `Powder` | 0 |', '| 0x1F9 (Magic5) | 0x3AB90 | `Powder` | 0 |')
s = s.replace('| 0x1FA (Magic6) | — | `RollTub` | 0 |', '| 0x1FA (Magic6) | 0x3ABA8 | `RollTub` | 0 |')
s = s.replace('| 0x1FB (Magic7) | — | `OnFire` | 0 |', '| 0x1FB (Magic7) | 0x3ABC0 | `OnFire` | 0 |')
old = '''注意：宿主参数是**正序**压栈的（arg1 先压），所以脚本里 `arg1` 反而在更深的槽位？——实测 `LDSL arg1 = -2`、`arg2 = -3` 的约定说明宿主在压栈时做了反转（或 `push` 顺序为 argc..1）。反汇编显示 `0x4650E0` 按 `[entry+4]` 循环调用 `0x467CE0`，压栈顺序与“arg1 在栈顶”一致，因此脚本侧 `arg1 = frame-2` 成立 [确认，与 3.3 一致]。'''
new = '''`0x4650E0` 按 `[entry+4]` 循环压入 argc 个参数，逐参压栈的具体顺序未逐行确认；脚本侧可观察到的结果是 `arg1 = frame-2`、`arg2 = frame-3`（即 arg1 位于栈顶方向、更靠近返回地址），这与 3.3 的栈帧图一致 [确认]。'''
assert old in s
s = s.replace(old, new)
opt = open(r'F:\sanguo\export\script\_opcode_table.md', encoding='utf-8').read()
syt = open(r'F:\sanguo\export\script\_syscall_table.md', encoding='utf-8').read()
assert '{{OPCODE_TABLE}}' in s and '{{SYSCALL_TABLE}}' in s
s = s.replace('{{OPCODE_TABLE}}', opt).replace('{{SYSCALL_TABLE}}', syt)
open(p, 'w', encoding='utf-8').write(s)
print('written', len(s), 'chars', s.count('\n'), 'lines')
