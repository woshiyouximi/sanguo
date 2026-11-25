import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, step } from '../../game/src/core/battle.ts';
const data = loadData();
const w = createWorld({ data, seed: 7, a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: 56, int: 95, level: 2 } }, b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: 69, int: 63, level: 2 } }, aiSides: { A: false, B: false } });
const a = w.units.find((u) => u.isGeneral && u.side === 'A');
const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length;
const cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
a.x = cx - 1.4; a.y = cy; a.prevX = a.x; a.prevY = a.y;
console.log('B general hp', w.sides.B.general.hp, '/', w.sides.B.general.maxHp);
const r = cast(w, 'A', 50, undefined, undefined, 24);
const s = w.sessions[0];
console.log('cast', r.ok, 'frames', s?.frames, 'seq', JSON.stringify(s?.seq)?.slice(0, 200));
for (let t = 0; t < 40; t++) {
  const before = s ? { frame: s.frame, killed: s.killed, hits: s.hits, done: s.done } : null;
  step(w);
  if (s) console.log('t' + t, 'frame', s.frame, 'hits', s.hits, 'killed', s.killed, 'dmgA', w.stats.spellDamageA, 'genHp', w.sides.B.general.hp, 'aliveB', w.sides.B.aliveCount);
}
