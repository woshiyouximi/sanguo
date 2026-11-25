// 159 临时调试：半月斬(50) 在 20 个 seed 下的击杀数（判断 spellKills=0 是骰运还是语义回归）
import { cast, createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const rows = [];
for (let seed = 1; seed <= 20; seed++) {
  const w = createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
  const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length;
  const cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
  const a = w.units.find((u) => u.isGeneral && u.side === 'A');
  a.x = cx - 1.4;
  a.y = cy;
  a.prevX = a.x;
  a.prevY = a.y;
  cast(w, 'A', 50, cx, cy, 24);
  for (let i = 0; i < 400 && (w.sessions.length > 0 || w.stats.spellKillsA === 0); i++) step(w);
  rows.push({ seed, kills: w.stats.spellKillsA, dmg: w.stats.spellDamageA });
}
const withKills = rows.filter((r) => r.kills > 0).length;
console.log(`20 个 seed 里 spellKillsA>0 的有 ${withKills} 个`);
console.log(rows.map((r) => `${r.seed}:${r.kills}/${r.dmg}`).join(' '));
