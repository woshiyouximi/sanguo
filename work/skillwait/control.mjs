// 控制组：完全相同的世界 + 400 tick，但**不放技能**。用来量出"普通战斗噪声"。
import { cast, createWorld, step, QI_MAX } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

function run(castSeq) {
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  const hpB0 = world.sides.B.general.hp;
  const hpA0 = world.sides.A.general.hp;
  const aliveB0 = world.units.filter((u) => u.side === 'B' && u.alive).length;
  if (castSeq) cast(world, 'A', castSeq, 20, 6.5);
  for (let i = 0; i < 400; i++) step(world);
  const marks = world.skillMarks ?? [];
  return {
    dmgB: hpB0 - world.sides.B.general.hp,
    dmgA: hpA0 - world.sides.A.general.hp,
    killed: aliveB0 - world.units.filter((u) => u.side === 'B' && u.alive).length,
    markDmg: marks.reduce((s, k) => s + (k.damage ?? 0), 0),
    markKills: marks.reduce((s, k) => s + (k.kills ?? 0), 0),
    markHeal: marks.reduce((s, k) => s + (k.healed ?? 0), 0),
    markSummon: marks.reduce((s, k) => s + (k.summoned ?? 0), 0),
    marks: marks.length,
    units: world.units.length,
  };
}
console.log('CONTROL(no cast)  :', JSON.stringify(run(0)));
for (const s of [1, 2, 4, 8, 10, 3, 5, 110]) console.log(`cast ${String(s).padStart(3)}          :`, JSON.stringify(run(s)));
