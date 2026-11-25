import { loadData } from './src/data.ts';
import { createWorld, step, unitCell } from './src/core/battle.ts';
import { planStrategy, sideEngaged, tickStrategy } from './src/core/strategy.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 11, a: { strategy: 6, general: { str: 80, int: 60, level: 1 } }, b: { strategy: 17, general: { str: 80, int: 60, level: 1 } } });
const aUnit = w.units.find((u) => u.side === 'A' && u.alive && !u.isGeneral);
const bUnit = w.units.find((u) => u.side === 'B' && u.alive && !u.isGeneral);
aUnit.x = bUnit.x; aUnit.y = bUnit.y;
console.log('cells', unitCell(aUnit), unitCell(bUnit), 'dist', Math.hypot(aUnit.x - bUnit.x, aUnit.y - bUnit.y));
console.log('engaged A', sideEngaged(w, 'A'), 'B', sideEngaged(w, 'B'));
console.log('plan A', planStrategy(w, 'A', aUnit));
console.log('plan B', planStrategy(w, 'B', bUnit));
tickStrategy(w);
console.log('after tickStrategy', w.strategyEvents.map((e) => [e.side, e.seq, e.name]), w.army.A.used, w.army.B.used);
