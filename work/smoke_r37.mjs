// R37 冒烟：用编译后的 dist 跑 600 tick，打印策略/援军/结局的真实数字。
// 数据走 src/data.ts（loadData 不在 tsconfig.build 的 include 里，dist 没有 data.js；
// 战斗内核本身来自 dist/core/battle.js，与页面用的是同一份编译产物）。
import { loadData } from '../game/src/data.ts';
import { createWorld, step } from '../game/dist/core/battle.js';

const data = loadData({ dir: new URL('../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const seqOf = (exec) => data.wises.find((w) => w.Execute === exec)?.SEQUENCE ?? null;

const sc = data.scenarios[0];
const cities = sc.cities.filter((c) => Array.isArray(c.POS));
const city = String(cities[0].NAME);
const from = String(cities[1].NAME);

const w = createWorld({
  data,
  seed: 20251125,
  a: { soldiers: 100, strategy: seqOf(3), general: { name: '曹操', str: 80, int: 92, level: 20 } },
  b: { soldiers: 100, strategy: seqOf(26), general: { name: '劉備', str: 70, int: 75, level: 20 } },
  aiSides: { B: true },
  reinforce: [{ side: 'B', city, from, scenario: sc.id, triggerRatio: 0.9, delayTicks: 30 }],
});

const g = w.reinforce[0];
const bBefore = { soldiers: w.sides.B.soldiers, alive: w.sides.B.aliveCount, units: w.units.filter((u) => u.side === 'B').length };
console.log('=== 建局 ===');
console.log('A.strategy seq', w.army.A.seq, '| B.strategy seq', w.army.B.seq);
console.log('援軍: 側', g.side, '| 兵數', g.troops, '| 依據', g.basis, '| 城距', g.distance, '| 觸發比', g.triggerRatio);
console.log('B 開局: soldiers', bBefore.soldiers, 'aliveCount', bBefore.alive, 'units', bBefore.units);

let tick = 0;
for (; tick < 600; tick++) {
  step(w);
  if (w.over) break;
}

const bAfter = { soldiers: w.sides.B.soldiers, alive: w.sides.B.aliveCount, units: w.units.filter((u) => u.side === 'B').length };
console.log('=== 跑完 ===');
console.log('tick', w.tick, '| over', w.over, '| endReason', w.endReason, '| winner', w.winner);
console.log('strategyEvents.length', w.strategyEvents.length);
for (const e of w.strategyEvents) console.log('  - tick', e.tick, e.side, e.name, `(exec ${e.exec}, seq ${e.seq}, L${e.tier})`, '→', e.text, '| sfx', e.sfx);
console.log('log 條數', w.log.length, '| strategy', w.log.filter((l) => l.kind === 'strategy').length, '| reinforce', w.log.filter((l) => l.kind === 'reinforce').length);
console.log('=== 援軍入場前後 ===');
console.log('scheduled', g.scheduled, '| arriveTick', g.arriveTick, '| arrived', g.arrived, '| 入場單位數', g.units.length, '| 兵數', g.troops);
console.log('B soldiers', bBefore.soldiers, '→', bAfter.soldiers, '| aliveCount', bBefore.alive, '→', bAfter.alive, '| 場上 B 單位', bBefore.units, '→', bAfter.units);
console.log('army B: atkMod', w.army.B.atkMod, '| flags 0x' + w.army.B.flags.toString(16), '| qiTier', w.army.B.qiTier);
console.log('army A: atkMod', w.army.A.atkMod, '| flags 0x' + w.army.A.flags.toString(16));
console.log('strategyUsed', JSON.stringify(w.strategyUsed));
console.log('=== 援軍日誌 ===');
for (const l of w.log.filter((x) => x.kind === 'reinforce')) console.log('  tick', l.tick, l.sfx, l.text);

// 600 tick 还没分胜负 → 继续跑到结束，拿一个真实的 endReason
let extra = 0;
while (!w.over && extra < 6000) {
  step(w);
  extra++;
}
console.log('=== 跑到結束 ===');
console.log('額外 tick', extra, '| 總 tick', w.tick, '| over', w.over, '| endReason', w.endReason, '| winner', w.winner);
console.log('A aliveCount', w.sides.A.aliveCount, '/', w.sides.A.start, '| B aliveCount', w.sides.B.aliveCount, '/', w.sides.B.start);
console.log('stats: attacks', w.stats.attacksA + w.stats.attacksB, 'hits', w.stats.hitsA + w.stats.hitsB, '| killsInf', w.stats.killsInf, 'killsCav', w.stats.killsCav);
