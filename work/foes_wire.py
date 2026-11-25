import pathlib

# ---------- 1) deploy.html：真守将 ----------
p = pathlib.Path(r'F:\sanguo\game\web\deploy.html')
t = p.read_text(encoding='utf-8')

t = t.replace("""import { listWisdomChoices, wiseHintOf } from '../dist/core/wises.js';""",
"""import { listWisdomChoices, wiseHintOf } from '../dist/core/wises.js';
import { battleSetup, garrisonOf } from '../dist/core/garrison.js';""", 1)

t = t.replace("""const [scen, generals, troops, forms, wises] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()),
  fetch('../data/generals.json').then((r) => r.json()),
  fetch('../data/troops.json').then((r) => r.json()),
  fetch('../data/formations.json').then((r) => r.json()),
  fetch('../data/wises.json').then((r) => r.json()),
]);""",
"""const [scen, generals, troops, forms, wises, garRaw] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()),
  fetch('../data/generals.json').then((r) => r.json()),
  fetch('../data/troops.json').then((r) => r.json()),
  fetch('../data/formations.json').then((r) => r.json()),
  fetch('../data/wises.json').then((r) => r.json()),
  fetch('../data/garrison.json').then((r) => r.json()),
]);""", 1)

t = t.replace("""const garrison = Math.min(Math.floor((city.POPULATION || 0) / 2500) + 110, 600);""",
"""// 守军与守将：优先取 garrison.json（五个剧本各自的真实配置），缺了才退回人口估算
const GDATA = { scenarios: scen, generals, garrison: garRaw };
const enemy = (() => {
  try { return battleSetup(GDATA, SCEN_IDX, target, 100); }
  catch { return { enemyGeneral: { name: '守將', str: 70, int: 60 }, enemyTroops: 100, enemyOfficers: [] }; }
})();
const garrison = (() => {
  try { const g = garrisonOf(GDATA, SCEN_IDX, target); if (g) return g.garrison; } catch {}
  return Math.min(Math.floor((city.POPULATION || 0) / 2500) + 110, 600);
})();""", 1)

t = t.replace("""    bstr: String(Math.min(100, 50 + Math.floor((city.DEFENSE || 0) / 8))),
    bint: String(Math.max(30, 140 - Math.min(100, 50 + Math.floor((city.DEFENSE || 0) / 8)))),""",
"""    bgen: enemy.enemyGeneral.name,
    bstr: String(enemy.enemyGeneral.str),
    bint: String(enemy.enemyGeneral.int),""", 1)

t = t.replace("""`敵軍 ${garrison} 兵（騎兵 0）· 防御 ${city.DEFENSE ?? '—'}<br>` +""",
"""`敵軍 ${garrison} 兵 · 守將 ${enemy.enemyGeneral.name}（武 ${enemy.enemyGeneral.str} / 智 ${enemy.enemyGeneral.int}）<br>` +""", 1)
p.write_text(t, encoding='utf-8')
print('deploy patched')

# ---------- 2) main.js：守将名 ----------
p2 = pathlib.Path(r'F:\sanguo\game\web\main.js')
m = p2.read_text(encoding='utf-8')
m = m.replace("""    city: q.get('city') || null,""",
"""    city: q.get('city') || null,
    bGen: q.get('bgen') || null,""", 1)
m = m.replace("""      general: { name: DEFEND ? '來犯之將' : (cfg.city ? '守將' : '張角'), str: cfg.bStr, int: cfg.bInt, level: 5 },""",
"""      general: { name: DEFEND ? '來犯之將' : (cfg.bGen || (cfg.city ? '守將' : '張角')), str: cfg.bStr, int: cfg.bInt, level: 5 },""", 1)
p2.write_text(m, encoding='utf-8')
print('main patched')
