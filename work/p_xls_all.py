# -*- coding: utf-8 -*-
import json, os, collections

J = r'F:\sanguo\extract\json'
for fn in sorted(os.listdir(J)):
    if not fn.startswith('xls_'):
        continue
    obj = json.load(open(os.path.join(J, fn), encoding='utf-8'))
    print('=' * 70)
    print(fn, type(obj).__name__)
    if isinstance(obj, list):
        print('  list len', len(obj))
        for i, item in enumerate(obj[:3]):
            if isinstance(item, list):
                print('  [%d] len=%d %s' % (i, len(item), [str(x)[:14] for x in item[:20]]))
            else:
                print('  [%d] %r' % (i, item))
    elif isinstance(obj, dict):
        print('  keys', list(obj.keys()))
        for k, v in obj.items():
            if isinstance(v, list):
                print('  %s: list len %d' % (k, len(v)))
                for item in v[:3]:
                    if isinstance(item, list):
                        print('     len=%d %s' % (len(item), [str(x)[:14] for x in item[:20]]))
                    else:
                        print('     %r' % (item,))
            else:
                print('  %s: %r' % (k, v))
