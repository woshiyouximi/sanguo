// 606 帧数对"布局/派生"的敏感性：扫多个 seed（只 startSkill 逐帧跑完）
import { loadData } from '../../game/src/data.ts';
import { createWorld } from '../../game/src/core/battle.ts';
import { startSkill } from '../../game/src/core/smartscript/runtime.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const script = data.magics.find((m) => m.SEQUENCE === 95).SCRIPT;

for (const seed of [1, 2, 3, 7, 11, 13, 23, 42]) {
  const world = createWorld({
    data, seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  const s = startSkill(world, 'A', script, 20, 6.5);
  let n = 0;
  while (!s.done && n++ < 4000) s.advance();
  const per = s.frames.map((f) => f.killed);
  const at = [];
  for (let i = 0; i < per.length; i++) if (per[i]) at.push(`${i}:${per[i]}`);
  console.log(`seed=${seed} 帧=${s.frames.length} 合计=${s.killed} 指令=${s.summary().stats.instructions} syscall=${s.summary().stats.syscalls} 物件=${s.summary().stats.objects} 杀=${at.join(' ')}`);
}
