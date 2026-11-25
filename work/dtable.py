import os
base = r'F:\sanguo\extract\pak'
for name in ['SANGO.15','SANGO.20','SANGO.IDX','MINGASC.20','OLDASC.15']:
    p = os.path.join(base, name)
    d = open(p,'rb').read()
    print('==', name, len(d))
    for i in range(0, 64, 16):
        print('  %04X' % i, d[i:i+16].hex(' '))
    print('  tail:', d[-32:].hex(' '))
