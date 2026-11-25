import { loadData } from './src/data.ts';
import { createWorld, step, unitCell } from './src/core/battle.ts';
const data = loadData({ dir: 'data/' });
const w = createWorld({ data, seed: 11, a: { general: { name: '關羽', str: 97, int: 75, level: 6 } }, b: { general: { name: '張角', str: 70, int: 88, level: 5 } } });
const tally = new Map();
const last = new Map();
for (let i = 0; i < 600; i++) {
  step(w);
  for (const u of w.units) {
    if (u.side !== 'A' || u.isGeneral || !u.alive) continue;
    const c = unitCell(u);
    const p = last.get(u);
    if (p && (p.gx !== c.gx || p.gy !== c.gy)) {
      const k = `${c.gx - p.gx},${c.gy - p.gy}`;
      tally.set(k, (tally.get(k) ?? 0) + 1);
    }
    last.set(u, c);
  }
}
const total = [...tally.values()].reduce((a, b) => a + b, 0);
const rows = [...tally.entries()].sort((a, b) => b[1] - a[1]);
console.log('steps', total, rows.map(([k, v]) => `${k}:${v}(${(v / total * 100).toFixed(1)}%)`).join(' '));
console.log('over', !!w.over, 'A活', w.sides.A.alive, 'B活', w.sides.B.alive);
