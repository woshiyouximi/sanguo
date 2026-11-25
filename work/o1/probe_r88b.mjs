// R88 落月弓：逐 tick 观察 B 主将 hp / 会话帧 hits / 击杀
import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, skillMarksOf, step } from '../../game/src/core/battle.ts';
import { engage } from '../../game/tests/_engage.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const row = (n) => data.generals.find((g) => g.NAME === n) ?? null;
const w = engage(createWorld({
  data, seed: 7,
  a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: row('張角')?.STR ?? 56, int: row('張角')?.INT ?? 95, level: 2 } },
  b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: row('張勳')?.STR ?? 69, int: row('張勳')?.INT ?? 63, level: 2 } },
  aiSides: { A: false, B: false },
}));
const genB = () => w.units.find((u) => u.side === 'B' && u.isGeneral);
const B = genB();
const bx = B.x, by = B.y, hp0 = w.sides.B.general.hp;
console.log(`B将 (${bx.toFixed(1)},${by.toFixed(1)}) hp=${hp0}`);
const r = cast(w, 'A', 2, bx - 20, by, 24);
console.log('cast =', JSON.stringify(r));
const s = w.sessions[w.sessions.length - 1];
for (let i = 1; i <= 40; i++) {
  step(w);
  const last = s?.frames?.[s.frames.length - 1];
  const gen = genB();
  const alive = w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral).length;
  console.log(`t=${i} B将hp=${w.sides.B.general.hp} @(${gen.x.toFixed(1)},${gen.y.toFixed(1)}) 兵=${alive} frames=${s?.frames?.length ?? '-'} lastHit=${last?.hits ?? '-'} lastKill=${last?.killed ?? '-'} done=${s?.done ?? '-'}`);
}
console.log('stats =', JSON.stringify(w.stats));
console.log('marks =', JSON.stringify(skillMarksOf(w)));
