import { loadData } from '../../game/src/data.ts';
import { cast, createWorld, step } from '../../game/src/core/battle.ts';
const data = loadData();
const w = createWorld({ data, seed: 7, a: { soldiers: 20, troop: 2, formation: 0, general: { name: '張角', str: 56, int: 95, level: 2 } }, b: { soldiers: 20, troop: 10, formation: 0, general: { name: '張勳', str: 69, int: 63, level: 2 } }, aiSides: { A: false, B: false } });
const a = w.units.find((u) => u.isGeneral && u.side === 'A');
const gb = w.units.find((u) => u.isGeneral && u.side === 'B');
const foes = w.units.filter((u) => u.side === 'B' && !u.isGeneral);
const cx = foes.reduce((s, u) => s + u.x, 0) / foes.length;
const cy = foes.reduce((s, u) => s + u.y, 0) / foes.length;
a.x = cx - 1.4; a.y = cy; a.prevX = a.x; a.prevY = a.y; a.cd = 9999;
console.log('Bgen', gb.x, gb.y, 'hp', gb.hp, '/', gb.maxHp, 'alive', gb.alive);
console.log('foe x range', Math.min(...foes.map((u) => u.x)), Math.max(...foes.map((u) => u.x)), 'y', Math.min(...foes.map((u) => u.y)), Math.max(...foes.map((u) => u.y)));
console.log('Agen', a.x, a.y, 'team soldier x', w.units.filter((u) => u.side === 'A').map((u) => u.x.toFixed(0)).join(','));
const r = cast(w, 'A', 50, undefined, undefined, 24);
console.log('cast damage', r.damage, 'hits', r.hits, 'session', JSON.stringify(w.sessions[0] && Object.keys(w.sessions[0])));
for (let t = 0; t < 60; t++) { step(w); if (t % 5 === 0) console.log('t' + t, 'gbhp', gb.hp, 'dmg', w.stats.spellDamageA); }
