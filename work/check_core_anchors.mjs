import fs from 'node:fs';
const p = 'F:/sanguo/game/src/core/battle.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
console.log('lines', lines.length);
const anchors = [
  ['interface Unit', 'export interface Unit {'],
  ['cd-set', 'u.cd = ATTACK_COOLDOWN;'],
  ['hitsA', 'world.stats.hitsA++'],
  ['isGeneral-to', 'if (to.isGeneral)'],
  ['alive-false', 'u.alive = false;'],
  ['rng-kill', 'if (world.rng() < p) {'],
  ['engage', 'ENGAGE_RANGE'],
];
for (const [k, t] of anchors) {
  const hit = [];
  lines.forEach((l, i) => { if (l.includes(t)) hit.push(`${i + 1}: ${l.trim()}`); });
  console.log('##', k, '\n  ' + (hit.join('\n  ') || '(missing)'));
}
console.log('---- Unit 52-64 ----');
for (let i = 51; i < 64; i++) console.log(`${i + 1}: ${lines[i]}`);
console.log('---- 320-350 ----');
for (let i = 319; i < 350; i++) console.log(`${i + 1}: ${lines[i]}`);
console.log('---- 470-490 ----');
for (let i = 469; i < 490; i++) console.log(`${i + 1}: ${lines[i]}`);
