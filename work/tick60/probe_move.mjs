import { loadData } from '../../game/src/data.ts';
import { createWorld, step, TICK_HZ } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 7 });
engage(w);
const s = w.units.find((u) => u.side === 'A' && !u.isGeneral);
const g = w.units.find((u) => u.side === 'A' && u.isGeneral);
console.log('units', w.units.length, 'soldier@', s?.x, s?.y, 'general@', g?.x, g?.y);
for (let t = 0; t <= 200; t++) {
  if (t % 20 === 0) console.log('tick', t, 'sol', s?.x, s?.y, 'hp', s?.hp, 'gen', g?.x, g?.y);
  step(w);
}
