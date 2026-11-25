import { loadData } from './src/data.ts';
import { createWorld, step } from './src/core/battle.ts';

const data = loadData({ dir: new URL('./data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const gA = { name: '關羽', str: 97, int: 75, level: 6 };
const gB = { name: '張角', str: 70, int: 88, level: 5 };
const w = createWorld({ data, seed: 7, terrain: 7, a: { general: gA, troop: 2, formation: 0 }, b: { general: gB, troop: 10, formation: 1 } });
const marks = [0, 40, 80, 160, 320, 640, 960];
for (const t of marks) {
  while (w.tick < t && !w.over) step(w);
  const gs = w.units.filter((u) => u.isGeneral);
  console.log('tick', w.tick, gs.map((u) => u.side + ':x=' + u.x.toFixed(2) + ',y=' + u.y + ',cd=' + u.cd + ',slide=' + (u.slide ? 1 : 0) + ',hp=' + Math.round(u.hp) + '/cmax=' + (u.cdMax ?? '-')).join(' | '), 'alive', w.sides.A.alive, w.sides.B.alive, 'over', !!w.over);
}
