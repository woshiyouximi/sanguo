import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """  const rows = (state.data && state.data.generals && state.data.generals.rows) || [];"""
new = """  const g = state.data && state.data.generals;
  const rows = Array.isArray(g) ? g : (g && g.rows) || [];"""
assert old in t
p.write_text(t.replace(old, new), encoding='utf-8')
print('rows shape fixed')
