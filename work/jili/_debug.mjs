// 临时调试：军师技派发为何没生效
import { loadData } from '../../game/src/data.ts';
import { createWorld, step } from '../../game/src/core/battle.ts';

const dataDir = new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir: dataDir });
const world = createWorld({
  data, seed: 12345,
  aiSides: { A: false, B: false },
  a: { soldiers: 100, troop: 0, formation: 0, strategy: 12 },
  b: { soldiers: 100, troop: 0, formation: 0 },
});
console.log('army.A before:', JSON.stringify({ seq: world.army.A.seq, used: world.army.A.used, flags: world.army.A.flags, mpRegen: world.army.A.mpRegen }));
for (let i = 0; i < 2400; i++) {
  step(world);
  if (world.tick % 200 === 0) {
    const a = world.army.A;
    const A = world.sides.A.general;
    const engaged = world.units.some((u) => {
      if (u.side !== 'A') return false;
      const foe = world.units.find((v) => v.side === 'B' && v.alive);
      return foe && Math.hypot(u.x - foe.x, u.y - foe.y) <= 3;
    });
    console.log(`t=${world.tick} seq=${a.seq} used=${a.used} flags=${a.flags} mpRegen=${a.mpRegen} mp=${A.mp}/${A.mpMax} over=${world.over} engagedAny=${engaged}`);
  }
  if (world.over) { console.log('over at', world.tick, world.endReason); break; }
}
