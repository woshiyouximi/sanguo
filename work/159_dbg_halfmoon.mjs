// 159 临时调试：半月斬(50) 在兵堆中心落点为什么不再杀兵？
import { cast, createWorld, step } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const w = createWorld({
  data,
  seed: 7,
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
console.log(`落点 (${cx.toFixed(2)}, ${cy.toFixed(2)})，A 主将 (${a.x.toFixed(2)}, ${a.y.toFixed(2)})`);
const r = cast(w, 'A', 50, cx, cy, 24);
console.log(`cast ok=${r.ok} hits=${r.hits} killed=${r.killed} done=${w.sessions.length === 0}`);
for (let i = 0; i < 60; i++) {
  step(w);
  const s = w.sessions[0];
  if (s && s.frames.length) {
    const f = s.frames[s.frames.length - 1];
    if (f.hits > 0 || f.killed > 0) console.log(`  tick+${i} frame=${f.frame} hits=${f.hits} killed=${f.killed}`);
  }
}
console.log(`spellKillsA=${w.stats.spellKillsA} spellDamageA=${w.stats.spellDamageA} marks=${JSON.stringify(w.skillMarks)}`);
