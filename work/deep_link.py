import pathlib
p = pathlib.Path(r'F:\sanguo\proto\ui\app.js')
t = p.read_text(encoding='utf-8')
old = "    if (SG.screens[start]) { hist = [{ id: 'p1', param: null }]; render(start, null, 'fade'); }"
new = ("    var startParam = q.get('name') ? { name: q.get('name') } : null;\n"
       "    if (SG.screens[start]) { hist = [{ id: 'p1', param: null }]; render(start, startParam, 'fade'); }")
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('deep link param')
