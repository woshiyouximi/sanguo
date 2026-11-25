import { loadData } from '../../game/src/data.ts';
import { createWorld, step, requestRetreat, unitCell, sampleStepOffsets, retreatStepPlan } from '../../game/src/core/battle.ts';
const data = loadData();
const w = createWorld({ data, seed: 4, a: { soldiers: 4 }, b: { soldiers: 4 } });
requestRetreat(w, 'B');
const sol = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
for (const u of w.units) if (u.side === 'B' && u !== sol[0] && u !== sol[1]) u.cd = 9999;
const stay = sol[0], gone = sol[1];
for (const [u, gx] of [[stay, 1], [gone, 0]]) { u.x = gx; u.y = 6; u.prevX = gx; u.prevY = 6; u.slide = undefined; u.cd = 0; }
const p = retreatStepPlan(gone);
console.log('plan', p, 'cell', unitCell(gone), 'flee', gone.flee, 'status', gone.status, 'rng', w.rng());
const s = sampleStepOffsets(p.sx, p.sy, p.w1, p.w2, w.rng);
console.log('first', JSON.stringify(s.first), 'second', JSON.stringify(s.second));
