import json, collections

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
miss = collections.Counter()
total = 0
for o in d['objects']:
    for m in o.get('missing') or []:
        miss[m] += 1
        total += 1
print('缺失 token 总数', total)
for k, v in miss.most_common():
    print('  %-30s x%d' % (k, v))
