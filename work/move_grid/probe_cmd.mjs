import { loadData } from '../../game/src/data.ts';
import { createWorld, unitCell } from '../../game/src/core/battle.ts';
import {
  armyCmdsOf, applyArmyCmd, armyOrderOf, armyStepPlan, installArmyOrders, stepWithArmyOrders,
} from '../../game/src/core/army_cmd.ts';

const data = loadData();
const mk = (seed) => createWorld({
  data, seed,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'A', str: 60, int: 70 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'B', str: 60, int: 70 } },
});
const w = mk(216);
w.sides.A.formation = 10;
console.log('def0', JSON.stringify(armyCmdsOf(10)[0]));
console.log('apply', applyArmyCmd(w, 'A', 0));
const st = armyOrderOf(w, 'A');
console.log('cmds', st.cmds, 'last', st.last, 'active', st.active?.label, 'targets', st.active?.targets);
installArmyOrders(w);
for (const u of w.units.filter((u) => u.side === 'A')) {
  const c = unitCell(u);
  const p = armyStepPlan(w, u);
  console.log(u.isGeneral ? 'GEN' : 'SOL', `(${c.gx},${c.gy})`, 'cd', u.cd, 'plan', p ? `${p.kind}(${p.sx},${p.sy})` : 'null');
}
for (let i = 0; i < 40; i++) stepWithArmyOrders(w);
console.log('after 40', w.units.filter((u) => u.side === 'A').map((u) => `${u.isGeneral ? 'G' : 'S'}(${unitCell(u).gx},${unitCell(u).gy})`).join(' '));
