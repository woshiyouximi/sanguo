import { createWorld, step, cast } from './dist/core/battle.js';
import { readFileSync } from 'node:fs';
const d = (p) => JSON.parse(readFileSync('data/' + p, 'utf8'));
const data = { scenarios: d('scenarios.json'), generals: d('generals.json'), magics: d('magics.json'), wises: d('wises.json'), troops: d('troops.json'), formations: d('formations.json'), terrains: d('terrains.json'), items: d('items.json'), garrison: d('garrison.json') };
const g = (n) => { const r = data.generals.find((x) => x.NAME === n); return { name: n, str: r.STR, int: r.INT, level: 20 }; };
const w = createWorld({ data, seed: 7, a: { general: g('關羽'), soldiers: 100, troop: 2, formation: 0, morale: 60 }, b: { general: g('張角'), soldiers: 100, troop: 10, formation: 3, morale: 60 } });
for (let i = 0; i < 60; i++) step(w);
const enemyFront = Math.max(...w.units.filter((u) => u.alive && u.side === 'B').map((u) => u.x));
console.log('enemy front x', enemyFront.toFixed(2), 'aliveB', w.units.filter((u) => u.alive && u.side === 'B').length);
const r = cast(w, 'A', 95, enemyFront, 6);
console.log('cast ok', r.ok, 'sessions', (w.sessions || []).length);
let prev = w.units.filter((u) => u.alive && u.side === 'B').length;
const marks = [];
for (let i = 0; i < 200; i++) {
  step(w);
  const n = w.units.filter((u) => u.alive && u.side === 'B').length;
  if (n !== prev) marks.push(`f${i}:${prev}->${n}`);
  prev = n;
}
console.log('deaths:', marks.slice(0, 12).join(' '), '…total', marks.length, 'sessionsLeft', (w.sessions || []).length);
