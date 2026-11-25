/** 探针：施法点（aim）到不到影响结果？—— 若四个落点结果全同，说明脚本自选目标、玩家点地无意义 */
import { loadData } from './src/data.ts';
import { cast, createWorld, step } from './src/core/battle.ts';

const data = await loadData();
const pts: Array<[number, number]> = [[4, 6], [24, 6], [62, 6], [66, 2]];
const seqs = [1, 2, 50, 104, 61];
const out: any[] = [];
for (const seq of seqs) {
  const row: any = { seq };
  for (const [x, y] of pts) {
    const w = createWorld({ data, seed: 777, a: { general: { name: '張角', str: 70, int: 95, level: 30 } }, b: { general: { name: '公孫瓚', str: 86, int: 70, level: 20 } }, aiSides: [] } as any);
    w.sides.A.qi = 120000;
    for (let i = 0; i < 30; i++) step(w);
    const snap = () => ({
      foeHp: w.sides.B.general.hp,
      selfHp: w.sides.A.general.hp,
      alive: w.units.filter((u) => u.alive && !u.isGeneral).length,
    });
    const b0 = snap();
    const r = cast(w, 'A', seq, x, y);
    for (let i = 0; i < 400 && !w.over; i++) step(w);
    const b1 = snap();
    row[`${x},${y}`] = { ok: r.ok, hits: r.hits, dmg: r.damage, foeLoss: b0.foeHp - b1.foeHp, selfGain: b1.selfHp - b0.selfHp, aliveDelta: b1.alive - b0.alive };
  }
  out.push(row);
}
console.log(JSON.stringify(out));
