import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const V = await import(pathToFileURL('F:/sanguo/game/dist/view/battleView.js').href);
const C = await import(pathToFileURL('F:/sanguo/game/dist/core/battle.js').href);
const load = (n) => JSON.parse(fs.readFileSync('F:/sanguo/game/data/' + n + '.json', 'utf8'));
const data = { formations: load('formations'), troops: load('troops'), magics: load('magics'), generals: load('generals') };
const w = C.createWorld({ data, seed: 7, a: { formation: 0, troop: 0, soldiers: 100 }, b: { formation: 1, troop: 1, soldiers: 100 } });
const j = JSON.parse(fs.readFileSync('F:/sanguo/game/web/anim/atlas.json', 'utf8'));
const frames = {}; const back = []; const front = [];
for (const s of j.pages[0].sprites) {
  frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.name.startsWith('walk_back')) back.push(s.name);
  if (s.name.startsWith('walk_front')) front.push(s.name);
}
const atlas = { img: { tag: 'blue' }, imgEnemy: { tag: 'tinted' }, frames, back, front, hold: 5 };
for (const t of [0, 60, 120, 300]) {
  while (w.tick < t && !w.over) C.step(w);
  const cam = C.camera(w);
  const cmds = V.buildFrame(w, { atlas, mode: 'fighting', camX: cam });
  const sp = cmds.filter((c) => c.kind === 'sprite');
  const by = {};
  for (const s of sp) by[s.img.tag] = (by[s.img.tag] || 0) + 1;
  const aAlive = w.sides.A.aliveCount, bAlive = w.sides.B.aliveCount;
  console.log('tick', t, 'cam', cam.toFixed(1), 'alive', aAlive, bAlive, 'sprites', sp.length, JSON.stringify(by));
}
