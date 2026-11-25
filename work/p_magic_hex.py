# -*- coding: utf-8 -*-
import re
p = r'F:\sanguo\extract\pak\MAGIC.INI'
raw = open(p, 'rb').read()
# print first 1400 bytes as hex+cp950 lines
start = 0
chunk = raw[:900]
for line in chunk.split(b'\r\n')[:24]:
    try:
        dec = line.decode('cp950')
    except Exception as e:
        dec = '<ERR %s>' % e
    print(repr(line[:70]))
    print('    cp950:', dec[:70])
