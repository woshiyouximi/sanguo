import json, collections, re

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
by = collections.defaultdict(list)
for o in d['objects']:
    m = re.match(r'\\?[Mm][Aa][Gg][Ii][Cc]\\(\d{3})', o['directory'] or '')
    if m:
        by[m.group(1)].append(o['name'])
for k in sorted(by):
    names = by[k]
    print('%s n=%-3d %s' % (k, len(names), '、'.join(n.replace('\t', ' ') for n in names[:6])))
