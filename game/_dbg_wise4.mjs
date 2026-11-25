import { loadData } from './src/data.ts';
import { createWorld, step, unitCell } from './src/core/battle.ts';
import { planStrategy, sideEngaged } from './src/core/strategy.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 11, a: { strategy: 6, general: { str: 80, int: 60, level: 1 } }, b: { strategy: 17, general: { str: 80, int: 60, level: 1 } } });
const aUnit = w.units.find((u) => u.side === 'A' && u.alive && !u.isGeneral);
const bUnit = w.units.find((u) => u.side === 'B' && u.alive && !u.isGeneral);
aUnit.x = bUnit.x; aUnit.y = bUnit.y;
console.log('before cells', unitCell(aUnit), unitCell(bUnit));
step(w);
console.log('after step', { tick: w.tick, cellsA: unitCell(aUnit), cellsB: unitCell(bUnit), ax: aUnit.x, bx: bUnit.x, aliveA: aUnit.alive, aliveB: bUnit.alive, engagedA: sideEngaged(w, 'A'), engagedB: sideEngaged(w, 'B') });
console.log('planA', planStrategy(w, 'A', aUnit)?.name, 'planB', planStrategy(w, 'B', bUnit)?.name);
console.log('used', w.army.A.used, w.army.B.used, 'events', w.strategyEvents.length);
