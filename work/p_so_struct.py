# -*- coding: utf-8 -*-
import struct, sys
sys.path.insert(0, r'F:\sanguo\tools')
import smartscript as SS

so = SS.SOFile(r'F:\sanguo\extract\pak\SCRIPT\MAGIC.SO')
d = so.data
print('len=%d ver=0x%X code_start=0x%X sym_off=0x%X sym_cnt=%d str_off=0x%X str_cnt=%d marker=0x%X data_end=0x%X'
      % (len(d), so.ver, so.code_start, so.sym_off, so.sym_cnt, so.str_off, so.str_cnt, so.marker, so.data_end))
print('code_end=0x%X' % so.code_end)
print('funcs=%d strings=%d' % (len(so.funcs), len(so.names)))
mag = [f for f in so.funcs if f['name'].startswith('Magic')]
print('Magic* funcs=%d  first=%s  last=%s' % (len(mag), mag[0] if mag else None, mag[-1] if mag else None))
for f in mag[:8]:
    print('  #%d off=0x%X argc=%d num=%d name=%s' % (f['idx'], f['off'], f['argc'], f['num'], f['name']))
print('--- 前 12 个 func ---')
for f in so.funcs[:12]:
    print('  #%d off=0x%X argc=%d num=%d name=%s' % (f['idx'], f['off'], f['argc'], f['num'], f['name']))
print('--- 字符串表前 20 ---')
for i, s in enumerate(so.names[:20]):
    print('  [%d] %s' % (i, s))
# shape 类字符串
sh = [(i, s) for i, s in enumerate(so.names) if s.lower().startswith('magic\\')]
print('shape 字符串 %d 个，前 10:' % len(sh))
for i, s in sh[:10]:
    print('  [%d] %s' % (i, s))
