// o1 探针：battle_feedback.test.ts R88 落月弓（seq 2 / SCRIPT 502 = Magic2 → ShootObject(0,1)）
// 目的：看清 marks / stats / 会话内命中与物件轨迹，判断 spellDamageA=0 的机制。
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

const gen = (s) => w.units.find((u) => u.side === s && u.isGeneral);
const a = gen('A');
const b = gen('B');
console.log('A将', a.x, a.y, 'B将', b.x, b.y, 'B将hp', w.sides.B.general.hp);

const before = w.units.filter((u) => u.side === 'B' && u.alive).map((u) => ({ id: u.id, x: +u.x.toFixed(2), y: +u.y.toFixed(2), g: u.isGeneral }));
const r = cast(w, 'A', 2, b.x - 20, b.y, 24);
console.log('cast result', JSON.stringify(r));
const sess = w.sessions[0];
console.log('session', sess ? { seq: sess.seq, frames: sess.frames?.length, hits: sess.hits, killed: sess.killed } : null);

for (let i = 0; i < 400 && !w.over; i++) step(w);
const marks = skillMarksOf(w);
console.log('marks', JSON.stringify(marks));
console.log('stats', JSON.stringify({ spellKillsA: w.stats.spellKillsA, spellDamageA: w.stats.spellDamageA, spellHealedA: w.stats.spellHealedA }));
console.log('B将hp 后', w.sides.B.general.hp);
console.log('B兵存活 前/后', before.length, w.units.filter((u) => u.side === 'B' && u.alive && !u.isGeneral).length);
console.log('B兵死亡列表', JSON.stringify(w.units.filter((u) => u.side === 'B' && !u.isGeneral && !u.alive).map((u) => ({ x: +u.x.toFixed(2), y: +u.y.toFixed(2) }))));
void sess;
