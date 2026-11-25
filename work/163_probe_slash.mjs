// 163 探针：半月斬(50 / SCRIPT 550) 在「贴住敌兵堆」场景下的法术战果。
// 复刻 game/tests/cast_autoaim.test.ts:269 的 makeWorld/runOnce（真将真数据、AI 全关）。
import { fileURLToPath } from 'node:url';
import { loadData } from '../game/src/data.ts';
import { cast, createWorld, QI_MAX, step } from '../game/src/core/battle.ts';

const data = loadData({ dir: fileURLToPath(new URL('../game/data/', import.meta.url)) });

function makeWorld(aSoldiers = 20, bSoldiers = 40) {
  const row = (name) => data.generals.find((g) => g.NAME === name) ?? null;
  const ga = row('張角');
  const gb = row('張勳');
  const w = createWorld({
    data,
    seed: 7,
    a: { soldiers: aSoldiers, troop: 2, formation: 0, general: { name: '張角', str: ga?.STR ?? 56, int: ga?.INT ?? 95, level: 2 } },
    b: { soldiers: bSoldiers, troop: 10, formation: 0, general: { name: '張勳', str: gb?.STR ?? 69, int: gb?.INT ?? 63, level: 2 } },
    aiSides: { A: false, B: false },
  });
  const g = w.sides.A.general;
  g.mp = 999; g.mpMax = 999; g.qi = QI_MAX;
  return w;
}

const spellOf = (w) => ({ kills: w.stats.spellKillsA, dmg: w.stats.spellDamageA, healed: w.stats.spellHealedA });
const run = (w, n) => { for (let i = 0; i < n && !w.over; i++) step(w); };

function runOnce(seq, aim) {
  const w = makeWorld();
  const troops = w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral);
  const cx = troops.reduce((s, u) => s + u.x, 0) / troops.length;
  const cy = troops.reduce((s, u) => s + u.y, 0) / troops.length;
  const a = w.units.find((u) => u.side === 'A' && u.isGeneral);
  a.x = cx - 1.4; a.y = cy; a.prevX = a.x; a.prevY = a.y;
  const before = spellOf(w);
  const r = aim ? cast(w, 'A', seq, aim.x, aim.y, 24) : cast(w, 'A', seq, undefined, undefined, 24);
  const alive0 = w.units.filter((u) => u.side === 'B' && u.alive).length;
  run(w, 120);
  const now = spellOf(w);
  const alive1 = w.units.filter((u) => u.side === 'B' && u.alive).length;
  return {
    ok: r.ok, reason: r.reason,
    kills: now.kills - before.kills, dmg: now.dmg - before.dmg,
    alive0, alive1,
    pile: [cx.toFixed(2), cy.toFixed(2)],
  };
}

for (const seq of [50]) {
  const auto = runOnce(seq, undefined);
  const explicit = runOnce(seq, { x: 0, y: 0 });
  console.log(`seq ${seq} auto    = ${JSON.stringify(auto)}`);
  console.log(`seq ${seq} explicit= ${JSON.stringify(explicit)}`);
}
