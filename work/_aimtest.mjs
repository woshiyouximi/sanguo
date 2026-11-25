import { createWorld, cast, step } from './dist/core/battle.js';
import { loadData } from './dist/core/data.js';
const data = await loadData();
const pts = [[4,6],[24,6],[62,6],[66,2]];
const seqs = [1,2,50,104,61];
const out = [];
for (const seq of seqs) {
  const row = { seq };
  for (const [x,y] of pts) {
    const w = createWorld({ data, seed: 777, a:{general:{name:'張角',str:70,int:95,level:30}}, b:{general:{name:'公孫瓚',str:86,int:70,level:20}}, aiSides:[] });
    w.sides.A.qi = 120000;
    for (let i=0;i<30;i++) step(w);
    const before = { foeDead:0, ownDead:0, foeHp:w.sides.B.general.hp, selfHp:w.sides.A.general.hp, alive:w.units.filter(u=>u.alive&&!u.isGeneral).length };
    const r = cast(w, 'A', seq, x, y);
    for (let i=0;i<400 && !w.over;i++) step(w);
    const after = { foeDead:0, ownDead:0, foeHp:w.sides.B.general.hp, selfHp:w.sides.A.general.hp, alive:w.units.filter(u=>u.alive&&!u.isGeneral).length };
    row[`${x},${y}`] = { ok:r.ok, hits:r.hits, dmg:r.damage, foeHp: before.foeHp - after.foeHp, selfHp: after.selfHp - before.selfHp, aliveDelta: after.alive - before.alive, over:w.over };
  }
  out.push(row);
}
console.log(JSON.stringify(out, null, 1));
