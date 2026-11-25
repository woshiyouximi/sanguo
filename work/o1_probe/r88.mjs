// R88（探针副本版）：跑一次落月弓，dump 回调物件位置 / 命中点 / 伤害
import { loadData } from './game/src/data.ts';
import { cast, createWorld, step } from './game/src/core/battle.ts';
import { engage } from './game/tests/_engage.ts';

const dir = new URL('./game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const data = loadData({ dir });
const row = (n) => data.generals.find((g) => g.NAME === n) ?? null;
const w = engage(createWorld({
  data, seed: 7,
  a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: row('張角')?.STR ?? 56, int: row('張角')?.INT ?? 95, level: 2 } },
  b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: row('張勳')?.STR ?? 69, int: row('張勳')?.INT ?? 63, level: 2 } },
  aiSides: { A: false, B: false },
}));
const gB = w.units.find((u) => u.side === 'B' && u.isGeneral);
const gA = w.units.find((u) => u.side === 'A' && u.isGeneral);
console.error(`[o1] A将@(${gA.x},${gA.y}) B将@(${gB.x},${gB.y}) B将hp=${w.sides.B.general.hp}`);
const r = cast(w, 'A', 2, gB.x - 20, gB.y, 24);
console.error('[o1] cast=' + JSON.stringify(r));
for (let i = 1; i <= 20; i++) {
  console.error(`[o1] --- tick ${i}`);
  step(w);
  console.error(`[o1] tick ${i} end B将hp=${w.sides.B.general.hp}`);
}
