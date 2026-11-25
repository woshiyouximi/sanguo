// R88 补兵探针：7 条「伏兵」系技能 cast 前后 world.units 的变化 + skillMarks 的 summoned。
// 用法：cd F:\sanguo\game && node ..\work\vmfix_units.mjs
import { cast, createWorld, step, QI_MAX } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const seqs = [5, 17, 19, 31, 37, 57, 81];

for (const seq of seqs) {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const cnt = () => ({
    total: world.units.length,
    aAlive: world.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length,
    bAlive: world.units.filter((u) => u.side === 'B' && !u.isGeneral && u.alive).length,
  });
  const c0 = cnt();
  const r = cast(world, 'A', seq, 20, 6.5);
  const c1 = cnt();
  const spawned = world.units.slice(c0.total);
  for (let i = 0; i < 400; i++) step(world);
  const c2 = cnt();
  const marks = (world.skillMarks ?? []).map((k) => ({ s: k.summoned, m: k.miss ? 1 : 0 }));
  const ms = marks.reduce((s, k) => s + (k.s ?? 0), 0);
  console.log(
    `seq=${seq} ${m?.NAME ?? ''} ok=${r.ok} units ${c0.total}->${c1.total}->${c2.total}` +
      ` A活 ${c0.aAlive}->${c1.aAlive}->${c2.aAlive} B活 ${c0.bAlive}->${c1.bAlive}->${c2.bAlive}` +
      ` 新兵=${spawned.length} markSummon=${ms} marks=${JSON.stringify(marks)}`,
  );
  for (const u of spawned.slice(0, 3)) {
    console.log(`   新兵 side=${u.side} x=${u.x} y=${u.y} prevX=${u.prevX} prevY=${u.prevY} alive=${u.alive} isGeneral=${!!u.isGeneral}`);
  }
}
