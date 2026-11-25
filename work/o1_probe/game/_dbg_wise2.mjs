import { loadData } from './src/data.ts';
import { createWorld, step } from './src/core/battle.ts';


const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 11, a: { strategy: 6, general: { str: 80, int: 60, level: 1 } }, b: { strategy: 17, general: { str: 80, int: 60, level: 1 } } });
const aUnit = w.units.find((u) => u.side === 'A' && u.alive && !u.isGeneral);
const bUnit = w.units.find((u) => u.side === 'B' && u.alive && !u.isGeneral);
aUnit.x = bUnit.x; aUnit.y = bUnit.y;
console.log('before', { bUsed: w.army.B.used, bSeq: w.army.B.seq, aUsed: w.army.A.used, over: w.over });
step(w);
console.log('after', { tick: w.tick, bUsed: w.army.B.used, bSeq: w.army.B.seq, aUsed: w.army.A.used, bAtkMod: w.army.B.atkMod, over: w.over, events: w.strategyEvents.map((e) => [e.side, e.seq, e.name, e.cancelled]) });
console.log('aliveB', w.units.filter((u) => u.side === 'B' && u.alive).length, 'aliveA', w.units.filter((u) => u.side === 'A' && u.alive).length);
