import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\campaign.html')
t = p.read_text(encoding='utf-8')

old = "const cities = (scenario.cities || []).slice(0, 24);"
new = """const cities = (scenario.cities || []).slice(0, 24);

// 我方麾下武将：按 CITY 是否在我方城池里筛，取武+智最高的当出征主将
const generals = await (await fetch('../data/generals.json')).json();
function commander() {
  const pool = generals.filter((g) => g.NAME !== '盜賊' && save.owned.includes(g.CITY));
  if (!pool.length) return null;
  return pool.sort((a, b) => (b.STR + b.INT) - (a.STR + a.INT))[0];
}"""
assert old in t
t = t.replace(old, new, 1)

old2 = """      <span>出 征</span><small>${enemy ? '目標：' + selected : '先選一座敵城'}</small></div>`);"""
new2 = """      <span>出 征</span><small>${enemy ? '目標 ' + selected + (commander() ? ' · 主將 ' + commander().NAME : '') : '先選一座敵城'}</small></div>`);"""
assert old2 in t
t = t.replace(old2, new2, 1)

old3 = """      bstr: String(str), bint: String(Math.max(30, 140 - str)),
    });"""
new3 = """      bstr: String(str), bint: String(Math.max(30, 140 - str)),
    });
    const g = commander();
    if (g) q.set('gen', g.NAME);"""
assert old3 in t
t = t.replace(old3, new3, 1)
p.write_text(t, encoding='utf-8')
print('commander wired')
