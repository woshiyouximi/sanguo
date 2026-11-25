# -*- coding: utf-8 -*-
import io
p = r'F:\sanguo\work\cocos_render3\patch_report_161.py'
s = io.open(p, encoding='utf-8').read()
s = s.replace("    '''### 目标 4", "    r'''### 目标 4")
s = s.replace("s = s[:i] + '''## §3", "s = s[:i] + r'''## §3")
s = s.replace("    '生成脚本 ", "    r'生成脚本 ")
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('patched')
