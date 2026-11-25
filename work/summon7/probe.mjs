// 補兵七条探针（R171）：用 `game/dist/core/*.js`（web 实际加载的那份产物）跑真实战斗流程。
// 每条技：createWorld → cast() → 跑 400 tick，量四个数：
//   新兵数   = A 方非主将活兵增量
//   markSummon = world.skillMarks 里这条技记的 summoned（飘字/结算面板读的就是它）
//   misses   = 带 miss:true 的标记条数（"打空了"才冒 MISS，補兵技必须 0）
//   A 存活   = 施放后 A 方非主将活兵数
// 用法：cd F:\sanguo\game && node ..\work\summon7\probe.mjs
import { cast, createWorld, step, QI_MAX } from '../../game/dist/core/battle.js';
import { loadData } from '../../game/src/data.ts';

const dir = new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir });
const SEQ = [5, 17, 19, 31, 37, 57, 81];
const TICKS = 400;

const aliveOf = (w, side) => w.units.filter((u) => u.side === side && !u.isGeneral && u.alive).length;

function probe(seq) {
  const world = createWorld({
    data,
    seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: '甲', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: '乙', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24;
  g.y = 6.5;
  g.prevX = g.x;
  g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const before = aliveOf(world, 'A');
  const marks0 = world.skillMarks.length;
  const r = cast(world, 'A', seq, 20, 6.5);
  for (let i = 0; i < TICKS; i++) step(world);
  const marks = world.skillMarks.slice(marks0);
  return {
    seq,
    name: data.magics.find((m) => m.SEQUENCE === seq)?.NAME ?? '?',
    castOk: r !== false,
    before,
    after: aliveOf(world, 'A'),
    markSummon: marks.reduce((n, m) => n + (m.summoned ?? 0), 0),
    misses: marks.filter((m) => m.miss).length + world.skillMarks.filter((m) => m.miss).length * 0,
    aliveA: aliveOf(world, 'A'),
    sessions: world.sessions.length,
    over: world.over,
  };
}

const rows = SEQ.map(probe);
const pad = (s, n) => String(s).padEnd(n);
console.log(pad('seq', 5) + pad('技名', 10) + pad('新兵', 6) + pad('markSummon', 12) + pad('misses', 8) + pad('A存活', 7) + 'cast');
let bad = 0;
for (const r of rows) {
  const add = r.after - r.before;
  const ok = add > 0 && r.markSummon > 0 && r.misses === 0 && r.castOk;
  if (!ok) bad++;
  console.log(
    pad(r.seq, 5) + pad(r.name, 10) + pad(`${add > 0 ? '+' : ''}${add}`, 6) +
      pad(r.markSummon, 12) + pad(r.misses, 8) + pad(r.aliveA, 7) + (ok ? 'ok' : '★FAIL'),
  );
}
console.log(`\nRESULT ${rows.length - bad}/${rows.length} 出兵（新兵>0 且 markSummon>0 且 misses=0）`);
if (bad) process.exitCode = 1;
