import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')
old = """      soldiers: cfg.aSoldiers,
      morale: 60,
      general: { name: '關羽', str: 97, int: 75, level: 6 },"""
new = """      soldiers: cfg.aSoldiers,
      morale: 60,
      general: cfg.aGeneral,"""
assert old in t
t = t.replace(old, new)

old2 = """    bStr: num('bstr', 70),
    bInt: num('bint', 88),
  };"""
new2 = """    bStr: num('bstr', 70),
    bInt: num('bint', 88),
    aGeneral: generalFromQuery(),
  };"""
assert old2 in t
t = t.replace(old2, new2)

helper = """
// 从 ?gen=<姓名> 取主将；找不到就退回关羽（原型默认值）
function generalFromQuery() {
  const q = new URLSearchParams(location.search).get('gen') || '關羽';
  const rows = (state.data && state.data.generals && state.data.generals.rows) || [];
  const hit = rows.find((r) => r.NAME === q);
  if (!hit) return { name: q, str: 97, int: 75, level: 6 };
  return { name: hit.NAME, str: hit.STR, int: hit.INT, level: 6 };
}

function readConfig() {"""
t = t.replace("\nfunction readConfig() {", helper, 1)
p.write_text(t, encoding='utf-8')
print('general wired')
