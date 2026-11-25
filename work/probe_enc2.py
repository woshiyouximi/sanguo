# -*- coding: utf-8 -*-
import os
BASE = r'F:\sanguo\extract\pak'
for f in ['THINGS.INI', 'MAGIC.INI', 'TIMES1.INI', 'TIMES5.INI', 'SANGO.INI',
          'COMBINE.INI', 'MESSAGE.INI']:
    raw = open(os.path.join(BASE, f), 'rb').read()
    print('%-12s bytes=%d highbytes=%d' % (f, len(raw), sum(1 for b in raw if b >= 0x80)))
    for enc in ('gbk', 'cp950', 'big5', 'utf-8'):
        try:
            t = raw.decode(enc)
            # count simplified-only vs traditional-only chars roughly
            print('   %-6s OK  cjk=%d' % (enc, sum(1 for ch in t if 0x4E00 <= ord(ch) <= 0x9FFF)))
        except UnicodeDecodeError as e:
            print('   %-6s FAIL at %d: %s' % (enc, e.start, e.reason))
    # sample raw bytes of a NAME line
    for line in raw.split(b'\r\n'):
        if line.strip().lower().startswith(b'name'):
            print('   raw:', line[:40])
            for enc in ('gbk', 'cp950'):
                try:
                    print('     %-6s %s' % (enc, line.decode(enc)))
                except Exception as ex:
                    print('     %-6s %s' % (enc, ex))
            break
