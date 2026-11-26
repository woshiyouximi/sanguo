import { loadData } from '../../game/src/data.ts';
import { createWorld, requestRetreat, step, unitCell } from '../../game/src/core/battle.ts';
import { armyOrderOf, installArmyOrders } from '../../game/src/core/army_cmd.ts';

const data = loadData();

function makeWorld(seed) {
  return createWorld({
    data,
    seed,
    a: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'A', str: 60, int: 70 } },
    b: { formation: 0, troop: 0, morale: 50, soldiers: 8, general: { name: 'B', str: 60, int: 70 } },
  });
}

function cell(u) {
  const c = unitCell(u);
  return `${c.gx},${c.gy}`;
}

// case 1: general advance, 40/46 cadence probe
const w = makeWorld(141);
installArmyOrders(w);
const genA = w.units.find((u) => u.side === 'A' && u.isGeneral);
genA.x = 60; genA.y = 7; genA.slide = null;
const st = armyOrderOf(w, 'A');
st.cmds[0] = 1;
st.last = 'advance';
let prev = cell(genA);
const advanceMoves = [];
for (let t = 1; t <= 90; t++) {
  step(w);
  const now = cell(genA);
  if (now !== prev) {
    advanceMoves.push({ tick: t, from: prev, to: now });
    prev = now;
  }
}

// case 2: retreat cadence
const w2 = makeWorld(142);
installArmyOrders(w2);
const genB = w2.units.find((u) => u.side === 'A' && u.isGeneral);
genB.x = 60; genB.y = 7; genB.slide = null;
requestRetreat(w2, 'A');
let prev2 = cell(genB);
const retreatMoves = [];
for (let t = 1; t <= 60; t++) {
  step(w2);
  const now = cell(genB);
  if (now !== prev2) {
    retreatMoves.push({ tick: t, to: now });
    prev2 = now;
  }
}

console.log(JSON.stringify({ advanceMoves, retreatMoves }, null, 1));
