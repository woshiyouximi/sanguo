import json, collections, os, re

d = json.load(open(r'F:\sanguo\work\things_parsed.json', encoding='utf-8'))
obj = collections.Counter()
for o in d['objects']:
    m = re.match(r'\\?[Mm][Aa][Gg][Ii][Cc]\\(\d{3})', o['directory'] or '')
    if m:
        obj[m.group(1)] += 1

base = r'F:\sanguo\extract\pak\SHAPE\MAGIC'
files = {}
for name in os.listdir(base):
    p = os.path.join(base, name)
    if os.path.isdir(p):
        files[name] = len(os.listdir(p))
print('目录 对象数 文件数')
tobj = tfile = 0
for k in sorted(set(obj) | set(files)):
    tobj += obj.get(k, 0)
    tfile += files.get(k, 0)
    print('%s %3d %4d' % (k, obj.get(k, 0), files.get(k, 0)))
print('合计 对象 %d 文件 %d 目录数 %d' % (tobj, tfile, len(set(obj) | set(files))))
