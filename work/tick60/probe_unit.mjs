import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: 'F:/sanguo/game/data/' });
const w = createWorld({ data, seed: 7 });
engage(w);
const s = w.units.find((u) => u.side === 'A' && !u.isGeneral);
console.log('keys', Object.keys(s || {}).join(','));
const bx = w.units.filter((u) => u.side === 'B').map((u) => u.x);
const ax = w.units.filter((u) => u.side === 'A').map((u) => u.x);
console.log('A x range', Math.min(...ax), Math.max(...ax), 'B x range', Math.min(...bx), Math.max(...bx));
console.log('sample B', JSON.stringify(w.units.find((u) => u.side === 'B')));
