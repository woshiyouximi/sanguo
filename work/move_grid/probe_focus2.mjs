import { loadData } from '../../game/src/data.ts';
import { createWorld, unitCell, step } from '../../game/src/core/battle.ts';
import { applyArmyCmd, installArmyOrders } from '../../game/src/core/army_cmd.ts';
const data = loadData();
const w = createWorld({ data, seed: 214, a: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'A', str: 60, int: 70 } }, b: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'B', str: 60, int: 70 } } });
w.sides.A.formation = 10;
applyArmyCmd(w, 'A', 3); installArmyOrders(w);
const sol = () => w.units.filter((u) => u.side === 'A' && !u.isGeneral);
const std = () => { const ys = sol().map((u) => unitCell(u).gy); const m = ys.reduce((a, b) => a + b, 0) / ys.length; return Math.sqrt(ys.reduce((a, b) => a + (b - m) ** 2, 0) / ys.length); };
console.log('t0', sol().map((u) => unitCell(u).gy).join(','), 'std', std().toFixed(3));
for (const n of [80, 240, 400, 800]) { while (w.tick < n) step(w); console.log('t' + n, sol().map((u) => `${unitCell(u).gx},${unitCell(u).gy}`).join(' '), 'std', std().toFixed(3)); }
