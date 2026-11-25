# -*- coding: utf-8 -*-
"""抽取 system_so / magic_so 里 SYSCALL 0x301（播声音）前 6 行内 PUSHS 的注释串。"""
import re
import io

OUT = io.StringIO()
pat_pushs = re.compile(r'PUSHS\s+\d+\s+;\s*"([^"]*)"')
for f in ['export/script/system_so.dis.txt', 'export/script/magic_so.dis.txt']:
    lines = open(f, encoding='utf-8', errors='replace').read().splitlines()
    rec = []
    for i, l in enumerate(lines):
        if 'SYSCALL' in l and '0x301' in l:
            snd = '?'
            for c in reversed(lines[max(0, i - 6):i]):
                m = pat_pushs.search(c)
                if m:
                    snd = m.group(1)
                    break
            func = '?'
            for c in reversed(lines[max(0, i - 400):i]):
                mf = re.search(r';\s*func\s+#(\d+)\s+(\S+)', c)
                if mf:
                    func = '#%s %s' % (mf.group(1), mf.group(2))
                    break
            rec.append((func, snd))
    OUT.write('== %s : 0x301 x%d ==\n' % (f, len(rec)))
    for func, snd in rec:
        OUT.write('%s\t%s\n' % (func, snd))
    OUT.write('\n')

open('work/battle_audit/sound_301_names.txt', 'w', encoding='utf-8').write(OUT.getvalue())
print('ok')
