import xlrd, json, os, csv

SRC = r'C:\Users\liutian\Downloads\sgqyzzwb_146364\三国群英传2 修正版 1.05+\群英2宝典修订版.xls'
OUT = r'F:\sanguo\extract\json'


def fix(s):
    if not isinstance(s, str):
        return s
    s = s.strip()
    if not s:
        return s
    try:
        b = s.encode('latin-1')
    except UnicodeEncodeError:
        return s
    for enc in ('gbk', 'gb18030'):
        try:
            return b.decode(enc)
        except UnicodeDecodeError:
            continue
    return s


wb = xlrd.open_workbook(SRC, encoding_override='latin-1')
os.makedirs(OUT, exist_ok=True)
index = []
for sh in wb.sheets():
    name = fix(sh.name)
    rows = []
    for r in range(sh.nrows):
        row = [fix(sh.cell_value(r, c)) for c in range(sh.ncols)]
        while row and (row[-1] == '' or row[-1] is None):
            row.pop()
        rows.append(row)
    while rows and not rows[0]:
        rows.pop(0)
    if not rows:
        continue
    header = rows[0]
    body = rows[1:]
    fn = os.path.join(OUT, 'xls_%s.json' % name.replace('/', '_'))
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump({'sheet': name, 'header': header, 'rows': body}, f, ensure_ascii=False, indent=1)
    index.append({'sheet': name, 'rows': len(body), 'cols': len(header), 'file': fn})
    print('%-10s rows=%-4d cols=%-3d header=%s' % (name, len(body), len(header), ' | '.join(map(str, header[:8]))))
with open(os.path.join(OUT, 'xls_index.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f, ensure_ascii=False, indent=1)
print('done')
