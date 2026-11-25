// 小调试：为什么 R194 之后接战 900 tick 一个攻击帧都没画？
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const unitsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const { actionAtlas } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const actionsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/actions.json'), 'utf8'));
const frames = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
console.log('sprites[0] =', JSON.stringify(unitsJson.pages[0].sprites[0]));
console.log('groups keys =', Object.keys(unitsJson.groups).slice(0, 3), 'dadao.attack[0]=', unitsJson.groups['dadao'].attack?.[0]);
const groups = {};
for (const [k, g] of Object.entries(unitsJson.groups)) {
  if (Array.isArray(g)) { groups[k] = g.slice(); continue; }
  const o = {};
  for (const kk of ['back', 'front', 'attack', 'attackEnemy']) if (Array.isArray(g[kk])) o[kk] = g[kk].slice();
  if (typeof g.hold === 'number') o.hold = g.hold;
  groups[k] = o;
}
const SENT = { toString: () => '<units_00.png>' };
const unitsAtlas = { img: SENT, imgEnemy: SENT, frames, groups };
const aframes = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) aframes[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
actionAtlas.img = { toString: () => '<actions_00.png>' };
actionAtlas.frames = aframes;

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { soldiers: 60, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 60, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

let dumped = 0;
for (let t = 0; t < 900; t += 1) {
  step(world);
  const hit = world.units.find((u) => u.alive && u.lastAttackTick != null && world.tick - u.lastAttackTick <= 2);
  if (!hit || dumped >= 3) continue;
  dumped += 1;
  console.log(`\n--- tick ${world.tick} attacker ${hit.side}/${hit.kind} cd=${hit.cd} lat=${hit.lastAttackTick} age=${world.tick - hit.lastAttackTick}`);
  const camX = camera(world).x ?? camera(world);
  const cmds = buildFrame(world, { mode: 'fighting', units: unitsAtlas, skills: [], camX });
  const p = projectUnit(hit.x, hit.y, camX);
  for (const c of cmds) {
    if (c.kind !== 'sprite') continue;
    if (Math.abs(c.x - p.sx) > 4) continue;
    if (Math.abs(c.y - (p.sy + 26 * p.scale)) > 8) continue;
    console.log('   sprite', c.sw + 'x' + c.sh, 'at', c.sx + ',' + c.sy, 'rot=', c.rot, 'alpha=', c.alpha,
      'name=', Object.entries(frames).find(([, r]) => r.x === c.sx && r.y === c.sy)?.[0] ?? 'NO-RECT');
  }
}
