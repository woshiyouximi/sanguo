import json, os
base = r'F:\sanguo\extract\json'
def load(n):
    return json.load(open(os.path.join(base, 'xls_%s.json' % n), encoding='utf-8'))
for n in ['阵形','城池','路径','军师技','增技','恢技','增体','恢体']:
    d = load(n)
    print('== %s  %dx%d' % (n, len(d['rows']), len(d['header'])))
    print('   header:', d['header'][:14])
    for r in d['rows'][:5]:
        print('   ', r[:14])
    print()
