import json, pathlib, re
t = pathlib.Path(r'F:\sanguo\proto\ui\data_ui.js').read_text(encoding='utf-8')
print('bytes', len(t))
m = re.search(r'generals\s*:\s*\[', t)
print('has generals array', bool(m))
# 数一下 top-level roster 里的条目：用 SG.ui.generals 的 name 字段
names = re.findall(r'name:"([^"]{1,4})"', t)
print('name-like entries', len(names), names[:8])
