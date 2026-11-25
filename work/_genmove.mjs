import { createWorld, step } from '../game/dist/core/battle.js';
const w = createWorld({ seed: 7, terrain: 7 });
for (const t of [0, 40, 80, 200, 400, 800]) {
  while (w.tick < t && !w.over) step(w);
  const gs = w.units.filter((u) => u.isGeneral);
  console.log('tick', w.tick, gs.map((u) => `${u.side}:x=${u.x.toFixed(2)},y=${u.y},cd=${u.cd},slide=${u.slide ? 1 : 0},hp=${Math.round(u.hp)}`).join(' | '), 'tickA', w.sides.A.alive, 'tickB', w.sides.B.alive, 'over', !!w.over);
}

