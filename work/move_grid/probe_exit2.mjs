import { loadData } from '../../game/src/data.ts';
import { createWorld, step, requestRetreat, unitCell } from '../../game/src/core/battle.ts';
const data = loadData();
const w = createWorld({ data, seed: 4, a: { soldiers: 4 }, b: { soldiers: 4 } });
requestRetreat(w, 'B');
const soldiers = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
const stay = soldiers[0], gone = soldiers[1];
for (const u of w.units) if (u.side === 'B' && u !== stay && u !== gone) u.cd = 9999;
for (const [u, gx] of [[stay, 1], [gone, 0]]) { u.x = gx; u.y = 6; u.prevX = gx; u.prevY = 6; u.slide = undefined; u.cd = 0; }
console.log('before', w.units.filter((u) => u.side === 'B').map((u) => `${u.isGeneral ? 'G' : 'S'}${unitCell(u).gx},${unitCell(u).gy},cd${u.cd}`).join(' '));
step(w);
console.log('after', w.units.filter((u) => u.side === 'B').map((u) => `${u.isGeneral ? 'G' : 'S'}${unitCell(u).gx},${unitCell(u).gy}`).join(' '), 'hasGone', w.units.includes(gone), 'slide', JSON.stringify(gone.slide), 'flee', gone.flee);
