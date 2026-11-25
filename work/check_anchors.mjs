import fs from 'node:fs';
const p = 'F:/sanguo/game/src/view/battleView.ts';
const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
console.log('lines', lines.length);
const anchors = [
  ['drawActors', 'function drawActors('],
  ['skip-dead', 'if (!u.alive) continue;'],
  ['shadow', 'E(out, fx, fy + 13, 12, 4, COLORS.shadow);'],
  ['swing', 'const swinging'],
  ['types-import', "import type { GameData } from '../types.ts';"],
  ['drawSoldier', 'function drawSoldier('],
];
for (const [k, t] of anchors) {
  const i = lines.findIndex((l) => l.includes(t));
  console.log(k, i < 0 ? '(missing)' : i + 1, i < 0 ? '' : lines[i].trim());
}
