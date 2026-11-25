import pathlib
p = pathlib.Path(r'F:\sanguo\game\web\main.js')
t = p.read_text(encoding='utf-8')

old = """function readConfig() {
  return {
    seed: Math.max(1, Number.parseInt(el.seed.value, 10) || 1),
    aTroop: Number(el.troopA.value),
    aForm: Number(el.formA.value),
    bTroop: Number(el.troopB.value),
    bForm: Number(el.formB.value),
  };
}"""
new = """function readConfig() {
  // 大地图带过来的参数（campaign.html → index.html?city=…&soldiers=…&bstr=…）
  const q = new URLSearchParams(location.search);
  const num = (k, dflt) => {
    const v = Number.parseInt(q.get(k) ?? '', 10);
    return Number.isFinite(v) ? v : dflt;
  };
  return {
    seed: Math.max(1, Number.parseInt(el.seed.value, 10) || 1),
    aTroop: Number(el.troopA.value),
    aForm: Number(el.formA.value),
    bTroop: Number(el.troopB.value),
    bForm: Number(el.formB.value),
    city: q.get('city') || null,
    aSoldiers: num('soldiers', 100),
    bSoldiers: num('bsoldiers', 100),
    bStr: num('bstr', 70),
    bInt: num('bint', 88),
  };
}"""
assert old in t
t = t.replace(old, new)

t = t.replace("""      soldiers: 100,
      morale: 60,
      general: { name: '關羽', str: 97, int: 75, level: 6 },""",
"""      soldiers: cfg.aSoldiers,
      morale: 60,
      general: { name: '關羽', str: 97, int: 75, level: 6 },""")

t = t.replace("""      soldiers: 100,
      morale: 60,
      general: { name: '張角', str: 70, int: 88, level: 5 },""",
"""      soldiers: cfg.bSoldiers,
      morale: 60,
      general: { name: cfg.city ? '守將' : '張角', str: cfg.bStr, int: cfg.bInt, level: 5 },""")

p.write_text(t, encoding='utf-8')
print('cfg params wired')
