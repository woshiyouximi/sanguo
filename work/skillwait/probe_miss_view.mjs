// 旋龍 cast 当帧 / 收尾后 buildFrame 的飘字检查（R87 断言失败时的取证用）
import { cast, createWorld, QI_MAX, skillMarksOf, step } from '../../game/src/core/battle.ts';
import { loadData } from '../../game/src/data.ts';
import { buildFrame, pushFloater } from '../../game/src/view/battleView.ts';

const data = loadData({ dir: new URL('../../game/data/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1') });
const w = createWorld({
  data, seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 90, int: 100 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
  aiSides: { A: false, B: false },
});
const a = w.units.find((u) => u.isGeneral && u.side === 'A');
a.x = 24; a.y = 6.5; a.prevX = a.x; a.prevY = a.y;
w.sides.A.general.qi = QI_MAX;
const foe = w.units.find((u) => u.isGeneral && u.side === 'B');

const r = cast(w, 'A', 51, foe.x, foe.y);
const floaters = [];
pushFloater(floaters, foe.x, foe.y, 'MISS', '#888888');
const texts0 = buildFrame(w, { floaters, camX: foe.x, mode: 'fighting' }).filter((c) => c.kind === 'text').map((c) => String(c.text));
console.log('frame0', JSON.stringify({ ok: r.ok, sessions: w.sessions.length, tick: w.tick, marks: skillMarksOf(w).length, hasMiss: texts0.includes('MISS') }));

let ticks = 0;
while (w.sessions.length > 0 && ticks++ < 400) {
  step(w);
  if (ticks % 20 === 0 || w.sessions.length === 0) {
    const marks = skillMarksOf(w).map((m) => ({ tick: m.tick, k: m.kills, d: m.damage, miss: m.miss }));
    console.log('tick', w.tick, 'sessions', w.sessions.length, JSON.stringify(marks));
  }
}
const texts1 = buildFrame(w, { floaters: [], camX: foe.x, mode: 'fighting' }).filter((c) => c.kind === 'text').map((c) => String(c.text));
console.log('end', JSON.stringify({ tick: w.tick, marks: skillMarksOf(w).length, minus: texts1.filter((t) => t.startsWith('-')), hasMiss: texts1.includes('MISS') }));
