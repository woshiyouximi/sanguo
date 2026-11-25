// 物件落点诊断：cast 后列出全部特效物件（resource 1000..90000）与其到落点的距离。
// 用法：node work/skillwait/objdiag.mjs <seq> [seq...]
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

for (const arg of process.argv.slice(2)) {
  const seq = Number(arg);
  const m = data.magics.find((x) => x.SEQUENCE === seq);
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const r = cast(world, 'A', seq, 20, 6.5);
  const s = world.sessions[0] ?? null;
  let ticks = 0;
  while (world.sessions.length && ticks < 600) { step(world); ticks++; }
  const sum = s?.summary?.();
  const objs = (sum?.objects ?? []).map((o) => ({ ...o, d: Math.hypot(o.x - 20, o.y - 6.5) }));
  const live = objs.filter((o) => o.resource >= 1000 && o.resource <= 90000);
  console.log(`\n=== seq ${seq} ${m.NAME} hits=${s?.hits} killed=${s?.killed} frames=${s?.frames.length} ticks=${ticks} reason=${(s?.reason || '').slice(0, 40)}`);
  console.log(`  objects=${objs.length} 在特效资源带内=${live.length}  落点(20,6.5)`);
  for (const o of live.slice(0, 12)) console.log(`    res${String(o.resource).padStart(6)} (${o.x.toFixed(1)},${o.y.toFixed(1)}) angle=${o.angle} d=${o.d.toFixed(1)} dead=${o.dead}`);
}
