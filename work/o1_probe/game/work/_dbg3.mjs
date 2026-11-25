import { loadData } from '../src/data.ts';
import { cast, createWorld, skillMarksOf, step } from '../src/core/battle.ts';
const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const row = (n) => data.generals.find((g) => g.NAME === n);
const ga = row('張角'), gb = row('張勳');
const w = createWorld({ data, seed: 7, aiSides: [], a: { soldiers: 20, troop: 2, formation: 0, general: { name: ga.NAME, str: ga.STR, int: ga.INT, level: 5 } }, b: { soldiers: 20, troop: 2, formation: 0, general: { name: gb.NAME, str: gb.STR, int: gb.INT, level: 5 } } });
const B = w.units.find((u) => u.side === 'B' && u.isGeneral);
const A = w.units.find((u) => u.side === 'A' && u.isGeneral);
console.log('A', A.x, A.y, 'B', B.x, B.y, 'aim', B.x - 20);
const r = cast(w, 'A', 2, B.x - 20, B.y, 24);
let i = 0;
for (; i < 400; i++) { step(w); if (skillMarksOf(w).some((m) => m.miss)) break; }
console.log('stopped tick', i, 'marks', JSON.stringify(skillMarksOf(w)), 'dmg', w.stats.spellDamageA);
