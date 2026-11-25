# -*- coding: utf-8 -*-
import os
EXE = (r'C:\Users\liutian\Downloads\sgqyzzwb_146364'
       r'\三国群英传2 修正版 1.05+\Sango2.exe')
exe = open(EXE, 'rb').read()
print('size', len(exe))
for n in [b'accept', b'ACCEPT', b'death', b'defense', b'hit01', b'silence',
          b'yell02', b'att01', b'flaysword', b'bg07a', b'death3']:
    i = exe.find(n)
    print('%-12s %s' % (n.decode(), hex(i) if i >= 0 else 'NOT FOUND'))
i = exe.find(b'ACCEPT')
if i >= 0:
    print('context:', exe[i - 90:i + 40])
