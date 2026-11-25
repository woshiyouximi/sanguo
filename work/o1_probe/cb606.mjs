// 606：统计碰撞回调触发次数 + 指令账（同步模型），验证 358291 + n*k 的算术恒等式
import { loadData } from './game/src/data.ts';
import { createWorld } from './game/src/core/battle.ts';
import { runSkill, startSkill } from './game/src/core/smartscript/runtime.ts';

const dir = new URL('./game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir });
const script = data.magics.find((m) => m.SEQUENCE === 95).SCRIPT;

const mk = (seed) => {
  const world = createWorld({
    data, seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.hp = Math.round(world.sides.A.general.maxHp * 0.4);
  return world;
};

for (const seed of [7, 1, 13]) {
  const w1 = mk(seed);
  const r = runSkill(w1, 'A', script, 20, 6.5);
  const w2 = mk(seed);
  const s = startSkill(w2, 'A', script, 20, 6.5);
  let n = 0;
  while (!s.done && n++ < 4000) s.advance();
  console.log(`seed=${seed} 同步 指令=${r.stats.instructions} syscall=${r.stats.syscalls} 物件=${r.stats.objects} | 逐帧 帧=${s.frames.length} 指令=${s.summary().stats.instructions} syscall=${s.summary().stats.syscalls}`);
}
