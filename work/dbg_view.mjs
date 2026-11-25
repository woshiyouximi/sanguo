import { pathToFileURL } from 'node:url';
import fs from 'node:fs';
const V = await import(pathToFileURL('F:/sanguo/game/dist/view/battleView.js').href);
const C = await import(pathToFileURL('F:/sanguo/game/dist/core/battle.js').href);
const load = (n) => JSON.parse(fs.readFileSync('F:/sanguo/game/data/' + n + '.json', 'utf8'));
const data = { formations: load('formations'), troops: load('troops'), magics: load('magics'), generals: load('generals') };
const w = C.createWorld({ data, seed: 7, a: { formation: 0, troop: 0, soldiers: 20 }, b: { formation: 1, troop: 1, soldiers: 20 } });
const j = JSON.parse(fs.readFileSync('F:/sanguo/game/web/anim/atlas.json', 'utf8'));
const frames = {};
const back = [], front = [];
for (const s of j.pages[0].sprites) {
  frames[s.name] = { x: s.x, y: s.y, w: s.w, h: s.h };
  if (s.name.startsWith('walk_back')) back.push(s.name);
  if (s.name.startsWith('walk_front')) front.push(s.name);
}
const imgA = { tag: 'blue' }, imgB = { tag: 'tinted' };
const atlas = { img: imgA, imgEnemy: imgB, frames, back, front, hold: 5 };
const sides = {}; for (const u of w.units) sides[String(u.side)] = (sides[String(u.side)] || 0) + 1;
console.log('unit sides', sides);
const cmds = V.buildFrame(w, { atlas, mode: 'fighting' });
const sprites = cmds.filter((c) => c.kind === 'sprite');
console.log('sprite cmds', sprites.length);
const byImg = {};
for (const s of sprites) byImg[s.img.tag] = (byImg[s.img.tag] || 0) + 1;
console.log('by img', byImg);
const names = [...new Set(sprites.map((s) => Object.keys(frames).find((k) => frames[k].x === s.sx && frames[k].y === s.sy)))];
console.log('frames used', names.slice(0, 6));
