import fs from 'node:fs';

const path = 'F:/sanguo/game/src/core/battle.ts';
const blockPath = 'F:/sanguo/work/move_grid/_new_step_block.ts.txt';

let text = fs.readFileSync(path, 'utf8');
const block = fs.readFileSync(blockPath, 'utf8');

const startMarker = 'function nearestEnemy(world: World, u: Unit): Unit | null {';
const endMarker = 'function recompute(world: World): void {';
const i = text.indexOf(startMarker);
const j = text.indexOf(endMarker);
if (i < 0 || j < 0 || i >= j) throw new Error(`markers ${i} ${j}`);
const hadBom = text.charCodeAt(0) === 0xfeff;
if (hadBom) text = text.slice(1);
const next = text.slice(0, i) + block.replace(/\n+$/, '') + '\n\n' + text.slice(j);
fs.writeFileSync(path, (hadBom ? '\uFEFF' : '') + next, 'utf8');
console.log('ok', text.length, '->', next.length, 'bom', hadBom);
