import { cast, createWorld, step, QI_MAX } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

function staged(ax, ay) {
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = ax; g.y = ay; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  return world;
}

function run(seq, tx, ty, label) {
  warns.length = 0;
  const w = staged(24, 6.5);
  const hpB = w.sides.B.general.hp;
  const aliveB = w.units.filter((u) => u.side === 'B' && u.alive).length;
  const r = cast(w, 'A', seq, tx, ty);
  if (!r.ok) return console.log(label, 'blocked', r.reason);
  const ticks = [];
  for (let i = 0; i < 2000 && !w.over; i++) { step(w); if (i % 100 === 0) ticks.push(w.units.filter((u) => u.side === 'B' && u.alive).length); }
  const dmg = hpB - w.sides.B.general.hp;
  const killed = aliveB - w.units.filter((u) => u.side === 'B' && u.alive).length;
  console.log(label, JSON.stringify({ ok: r.ok, hits: r.hits, hit: r.hit, damage: r.damage, dmg, killed, warns: warns.slice(0, 2) }));
}

// 敌方主将的真实位置
const probe = staged(24, 6.5);
const bg = probe.units.find((u) => u.isGeneral && u.side === 'B');
console.log('B general at', bg.x, bg.y, 'A at 24');

run(51, 20, 6.5, 'seq51 @(20,6.5) near A');
run(51, bg.x, bg.y, 'seq51 @B-general');
run(51, 0, 0, 'seq51 @far corner');
run(51, 24, 6.5, 'seq51 @self');
