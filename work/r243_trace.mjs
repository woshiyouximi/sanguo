import { createWorld, step, nearestEnemy, unitCell } from '../game/src/core/battle.ts';
import { loadData } from '../game/src/data.ts';

const data = loadData();
const w = createWorld({
  data,
  seed: 7,
  terrain: 0,
  sideA: { general: '關羽', soldiers: 10, officers: [] },
  sideB: { general: '守備隊', soldiers: 10, officers: [] },
});
for (let i = 0; i < 120; i += 1) step(w, 1);
for (const u of w.units) if (u.side === 'B' && !u.isGeneral) u.alive = false;

const probe = w.units.filter((u) => u.side === 'A' && u.alive).slice(0, 3);
for (let t = 0; t < 3000; t += 1) {
  step(w, 1);
  if (w.over) break;
  if (t % 300 === 0) {
    const rows = probe.map((u) => {
      const c = unitCell(u);
      const foe = nearestEnemy(w, u);
      return { x: c.gx, y: c.gy, foe: foe ? unitCell(foe).gx : null, order: u.order ?? null, mode: u.mode ?? null };
    });
    const gen = w.units.find((u) => u.side === 'A' && u.isGeneral);
    console.log(t, JSON.stringify(rows), 'gen', gen ? unitCell(gen).gx : null);
  }
}
console.log('end', { over: w.over, reason: w.endReason, tick: w.tick });
