// R88 调试：cast()（逐帧会话）与 runSkill()（同步）两条路上 spawnSoldier 的调用轨迹。
import { cast, createWorld, step, QI_MAX } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const mk = () => {
  const w = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = w.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  w.sides.A.general.qi = QI_MAX;
  return w;
};

for (const path of ['cast', 'runSkill']) {
  const w = mk();
  const dbg = [];
  globalThis.__spawnDbg = dbg;
  const n0 = w.units.length;
  if (path === 'cast') {
    cast(w, 'A', 5, 20, 6.5);
    for (let i = 0; i < 400; i++) step(w);
  } else {
    runSkill(w, 'A', 509, 20, 6.5);
  }
  globalThis.__spawnDbg = undefined;
  const A = w.units.filter((u) => u.side === 'A' && !u.isGeneral && u.alive).length;
  const B = w.units.filter((u) => u.side === 'B' && !u.isGeneral && u.alive).length;
  console.log(`[${path}] 调用 ${dbg.length} 次，units ${n0}->${w.units.length}，A活 ${A} B活 ${B}，maxHpA=${w.sides.A.general.maxHp}`);
  for (const d of dbg) console.log('   ', d);
}
