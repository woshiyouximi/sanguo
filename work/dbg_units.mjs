import { pathToFileURL } from 'node:url';
const C = await import(pathToFileURL('F:/sanguo/game/dist/core/battle.js').href);
const fs = await import('node:fs');
const load = (n) => JSON.parse(fs.readFileSync('F:/sanguo/game/data/' + n + '.json', 'utf8'));
const data = {
  formations: load('formations'), troops: load('troops'),
  magics: load('magics'), generals: load('generals'),
};
const w = C.createWorld({ data, seed: 7, a: { formation: 0, troop: 0, soldiers: 100 }, b: { formation: 1, troop: 1, soldiers: 100 } });
for (let i = 0; i < 120; i++) C.step(w);
const stat = (side) => {
  const us = w.units.filter((u) => u.side === side);
  const xs = us.map((u) => u.x), ys = us.map((u) => u.y);
  return { n: us.length, x: [+Math.min(...xs).toFixed(1), +Math.max(...xs).toFixed(1)], y: [+Math.min(...ys).toFixed(1), +Math.max(...ys).toFixed(1)] };
};
console.log('A', JSON.stringify(stat('A')));
console.log('B', JSON.stringify(stat('B')));
const cam = C.camera(w);
console.log('camX', cam.toFixed(2), 'project(40,6)=', JSON.stringify(C.project(cam, 40, 6)));
