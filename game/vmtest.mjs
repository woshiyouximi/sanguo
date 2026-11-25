import { createWorld, step, cast } from './dist/core/battle.js';
import { readFileSync } from 'node:fs';
const d = (p) => JSON.parse(readFileSync('data/' + p, 'utf8'));
const data = {
  scenarios: d('scenarios.json'), generals: d('generals.json'), magics: d('magics.json'),
  wises: d('wises.json'), troops: d('troops.json'), formations: d('formations.json'),
  terrains: d('terrains.json'), items: d('items.json'), garrison: d('garrison.json'),
};
const g = (name) => { const r = data.generals.find((x) => x.NAME === name); return { name, str: r.STR, int: r.INT, level: 20 }; };
const w = createWorld({ data, seed: 11, a: { general: g('關羽'), soldiers: 100, troop: 2, formation: 0, morale: 60 }, b: { general: g('張飛'), soldiers: 100, troop: 10, formation: 3, morale: 60 } });
for (let i = 0; i < 240; i++) step(w);
console.log('units alive', w.units.filter(u => u.alive).length, 'tick', w.tick);
for (const seq of [1, 50, 104]) {
  const r = cast(w, 'A', seq, 36, 6);
  console.log(seq, JSON.stringify({ ok: r.ok, reason: r.reason, killed: r.killed, healed: r.healed, mp: r.mp }));
}
