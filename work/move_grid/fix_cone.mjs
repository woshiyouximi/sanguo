import fs from 'node:fs';

const p = 'F:/sanguo/game/tests/move_grid.test.ts';
let s = fs.readFileSync(p, 'utf8');
const from = "const straight = planDirected(-1, 0, STEP_W_CONE, STEP_W_CONE, 'advance');";
const to = 'const straight = straightAt(-1, 0);';
let n = 0;
while (s.includes(from)) {
  s = s.replace(from, to);
  n++;
}
fs.writeFileSync(p, s);
console.log('replaced', n);
