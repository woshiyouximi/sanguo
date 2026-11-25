// 159 §3 探针：7 条「補兵類」武将技真的出兵了吗？
//
// 用法：cd F:\sanguo\game && node ..\work\159_probe_summon.mjs
//
// 对 seq 5/17/19/31/37/57/81 各打一次（A 方主将在 x=24/y=6.5，20v20，气力满），
// 逐 tick 推到会话结束（≤600 tick），打印「出兵前后该方活兵数」+ 本次施法的脚本实例数
// （>1 说明脚本里真的走了 `0x312 延迟调用 / 0x314 到点唤醒`，L0 的实例队列生效）。
import { cast, createWorld, step, QI_MAX } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const seqs = [5, 17, 19, 31, 37, 57, 81];

const aliveSoldiers = (world, side) =>
  world.units.filter((u) => u.side === side && !u.isGeneral && u.alive).length;

let allOk = true;
for (const seq of seqs) {
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;

  const before = aliveSoldiers(world, 'A');
  const r = cast(world, 'A', seq, 20, 6.5);
  let maxInstances = 0;
  for (let i = 0; i < 600 && world.sessions.length > 0; i++) {
    for (const s of world.sessions) maxInstances = Math.max(maxInstances, s.instanceCount);
    step(world);
  }
  const after = aliveSoldiers(world, 'A');
  const delta = after - before;
  if (delta < 1) allOk = false;
  console.log(
    `seq=${String(seq).padStart(3)} ${m?.NAME ?? '?'}  A 方活兵 ${before} -> ${after}  (${delta >= 0 ? '+' : ''}${delta})` +
      `  ok=${r.ok} hits=${r.hits} 实例数=${maxInstances} 会话残留=${world.sessions.length}`,
  );
}
console.log(allOk ? 'RESULT 7/7 都出兵' : 'RESULT 有技能没出兵');
