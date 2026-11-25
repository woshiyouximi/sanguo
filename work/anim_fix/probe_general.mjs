// 只读取证探针 5：主将到底打不打？+ 双方「挥砍窗口」占空比
// 跑法： node F:\sanguo\work\anim_fix\probe_general.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera, actionIntervalOf } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data, seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const gens = world.units.filter((u) => u.isGeneral);
console.log('主将数 =', gens.length, gens.map((g) => `${g.side}:${g.kind}@(${g.x.toFixed(1)},${g.y.toFixed(1)})`).join(' '));
const trace = [];
let swingTicksA = 0, swingTicksB = 0, totalA = 0, totalB = 0;
for (let t = 0; t < 1800; t += 1) {
  step(world);
  for (const g of gens) {
    const interval = actionIntervalOf(g);
    const swinging = g.cd > interval - 24;
    if (g.side === 'A') { totalA += 1; if (swinging) swingTicksA += 1; } else { totalB += 1; if (swinging) swingTicksB += 1; }
  }
  if (t % 120 === 0) {
    trace.push(gens.map((g) => ({
      t: world.tick, side: g.side, x: +g.x.toFixed(2), y: +g.y.toFixed(2),
      cd: g.cd, atkLock: g.atkLock ?? 0, lat: g.lastAttackTick ?? null, alive: g.alive,
    })));
  }
}
console.log('主将 1800 tick 轨迹（每 120 tick 一行）：');
for (const row of trace) console.log(' ', JSON.stringify(row));
console.log('主将挥砍窗口占比：A', (swingTicksA / totalA * 100).toFixed(1) + '%', ' B', (swingTicksB / totalB * 100).toFixed(1) + '%');
console.log('stats:', JSON.stringify({ atkA: world.stats.attacksA, atkB: world.stats.attacksB, hits: [world.stats.hitsA, world.stats.hitsB], blocks: world.stats.blocks }));
console.log('存活：', world.units.filter((u) => u.alive).length, '/', world.units.length, ' over =', world.over, ' end =', world.endReason);
fs.writeFileSync(path.join(HERE, 'probe_general.json'), JSON.stringify({ trace, stats: world.stats }, null, 1), 'utf8');
