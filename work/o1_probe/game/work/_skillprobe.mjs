import { cast, createWorld, step, QI_MAX } from '../src/core/battle.ts';
import { loadData } from '../src/data.ts';

const data = loadData({ dir: new URL('../data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });

const warns = [];
const origWarn = console.warn;
console.warn = (...a) => { warns.push(a.join(' ')); };

function staged() {
  const world = createWorld({
    data, seed: 7,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  });
  const g = world.units.find((u) => u.isGeneral && u.side === 'A');
  g.x = 24; g.y = 6.5; g.prevX = g.x; g.prevY = g.y;
  world.sides.A.general.qi = QI_MAX;
  return world;
}

const rows = [];
for (const m of data.magics) {
  warns.length = 0;
  const w = staged();
  const hpBefore = w.sides.B.general.hp;
  const unitsBefore = w.units.filter((u) => u.side === 'B' && u.alive).length;
  let r;
  try { r = cast(w, 'A', m.SEQUENCE, 20, 6.5); } catch (e) { rows.push([m.SEQUENCE, m.NAME, 'throw', String(e).slice(0, 60)]); continue; }
  if (!r.ok) { rows.push([m.SEQUENCE, m.NAME, 'blocked:' + r.reason, '']); continue; }
  for (let i = 0; i < 400 && !w.over; i++) step(w);
  const dmg = hpBefore - w.sides.B.general.hp;
  const killed = unitsBefore - w.units.filter((u) => u.side === 'B' && u.alive).length;
  const interrupt = warns.find((x) => x.includes('涓柇'));
  rows.push([m.SEQUENCE, m.NAME, interrupt ? 'INTERRUPT' : (dmg > 0 || killed > 0 ? 'ok' : 'no-effect'), `hp-${dmg} k-${killed} ${interrupt || ''}`.trim()]);
}
console.warn = origWarn;
const bad = rows.filter((r) => r[2] !== 'ok');
console.log('total', rows.length, 'ok', rows.length - bad.length, 'bad', bad.length);
for (const r of bad) console.log(r.join(' | '));

