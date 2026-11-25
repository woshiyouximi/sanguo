import re, collections
rows = []
pat = re.compile(r'^([0-9A-F]{8})\t(\d+)\t(.*)\t?(.*)$')
for line in open(r'F:\sanguo\work\funcmap3.tsv', encoding='utf-8', errors='replace'):
    line = line.rstrip('\n')
    m = pat.match(line)
    if m:
        rows.append((int(m.group(1),16), int(m.group(2)), m.group(3), m.group(4)))
print('rows', len(rows))
pages = collections.defaultdict(lambda: [0,0,[]])
for va, sz, strs, calls in rows:
    pg = va >> 12
    pages[pg][0] += 1
    if strs:
        pages[pg][1] += 1
        if len(pages[pg][2]) < 6:
            pages[pg][2].append(strs[:80])
tot = len(rows)
print('pages with functions:', len(pages))
for pg in sorted(pages):
    n, ns, ss = pages[pg]
    if n >= 8:
        print('%05X  fns=%4d strfns=%4d | %s' % (pg<<12, n, ns, ' ; '.join(ss[:3])))
