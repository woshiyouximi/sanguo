import json, io, sys
p = sys.argv[1]
n = int(sys.argv[2]) if len(sys.argv) > 2 else 5
d = json.load(io.open(p, encoding='utf-8'))
print('sheet', d['sheet'])
print('HEADER:', ' | '.join(map(str, d['header'])))
for r in d['rows'][:n]:
    print('-', ' | '.join(map(str, r)))
