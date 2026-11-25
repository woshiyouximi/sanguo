# -*- coding: utf-8 -*-
"""反汇编 Magic1..Magic4 的函数体（证据用）。"""
import sys
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS

so = SS.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
so.code_end = 0x3B6A0
so.by_off = {f['off']: f for f in so.funcs}
lines, stats, unk, tot = SS.disassemble(so)
want = ('Magic1 ', 'Magic2 ', 'Magic3 ', 'Magic4 ', 'Heal', 'CreateHolyLight')
out = []
keep = False
for ln in lines:
    if ln.startswith('; func #'):
        keep = any(w in ln for w in want)
    if keep:
        out.append(ln)
txt = '\n'.join(out)
open(r'F:\sanguo\work\dis_magicmap_magic1_4.txt', 'w', encoding='utf-8').write(txt)
print(txt[:3500])
print('... 共 %d 行，已写 dis_magicmap_magic1_4.txt' % len(out))
