import { loadData } from '../game/src/data.ts';
import { createWorld } from '../game/src/core/battle.ts';
import { runSkill } from '../game/src/core/smartscript/runtime.ts';

const data = loadData();
const w = createWorld({
  data,
  seed: 7,
  a: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'A', str: 60, int: 70 } },
  b: { formation: 0, troop: 0, morale: 50, soldiers: 20, general: { name: 'B', str: 60, int: 70 } },
});
const a = w.units.find((u) => u.isGeneral && u.side === 'A');
a.x = 24; a.y = 6.5; a.prevX = 24; a.prevY = 6.5;
const b = w.units.find((u) => u.isGeneral && u.side === 'B');
b.x = 23; b.y = 6.5; b.prevX = 23; b.prevY = 6.5;

const lines = [];
const hp0 = w.sides.B.general.hp;
const r = runSkill(w, 'A', 605, 20, 6.5, { trace: (t) => lines.push(t) });
const hp1 = w.sides.B.general.hp;
const hurt = lines.filter((l) => l.includes('Hurt'));
const calls = lines.filter((l) => l.startsWith('CALL '));
console.log(JSON.stringify({ ok: r.ok, hits: r.stats.hits, killed: r.stats.killed, healed: r.stats.healed, objects: r.stats.objects, hp0, hp1, traceLines: lines.length, hurtLines: hurt.length, callLines: calls.length }, null, 0));
console.log('hurt samples:', hurt.slice(0, 3).join(' | '));
console.log('call fn histogram:', JSON.stringify([...calls.reduce((m, l) => { const k = l.split(' ')[1]; m.set(k, (m.get(k) ?? 0) + 1); return m; }, new Map())]));
