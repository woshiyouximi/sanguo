import { loadData } from '../../game/src/data.ts';
import { createWorld, unitCell, step } from '../../game/src/core/battle.ts';
import {
  armyCmdsOf, applyArmyCmd, armyOrderOf, armyStepPlan, installArmyOrders,
} from '../../game/src/core/army_cmd.ts';

const data = loadData();
const mk = (seed) => createWorld({
  data, seed,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'A', str: 60, int: 70 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'B', str: 60, int: 70 } },
});

for (const slot of [1, 2, 3]) {
  const w = mk(900 + slot);
  w.sides.A.formation = 10;
  const def = armyCmdsOf(10)[slot];
  console.log('def', slot, JSON.stringify(def));
  applyArmyCmd(w, 'A', slot);
  const st = armyOrderOf(w, 'A');
  console.log('cmds', st.cmds.join(','), 'active', st.active?.label, 'targets', st.active?.targets);
  installArmyOrders(w);
  const plans = w.units.filter((u) => u.side === 'A').map((u) => {
    const p = armyStepPlan(w, u);
    const c = unitCell(u);
    return `${u.isGeneral ? 'G' : 'S'}(${c.gx},${c.gy}) ${p ? p.kind + '(' + p.sx + ',' + p.sy + ')' : 'null'}`;
  });
  console.log(plans.join(' | '));
  const y0 = w.units.filter((u) => u.side === 'A' && !u.isGeneral).map((u) => unitCell(u).gy);
  for (let i = 0; i < 80; i++) step(w);
  const y1 = w.units.filter((u) => u.side === 'A' && !u.isGeneral).map((u) => unitCell(u).gy);
  console.log('dy', y0.join(','), '->', y1.join(','));
}
