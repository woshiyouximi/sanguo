# -*- coding: utf-8 -*-
import json, os
J = r'F:\sanguo\extract\json'
for name in ['兵种', '阵形', '武将技', '军师技', '物品', '城池', '路径', '增技', '恢技', '增体', '恢体']:
    d = json.load(open(os.path.join(J, 'xls_%s.json' % name), encoding='utf-8'))
    print('---', name, 'rows=%d' % len(d['rows']))
    for i, h in enumerate(d['header']):
        print('   [%d] %r' % (i, h))
