// 调试 Case 3：朴刀兵（troop 0）死后为什么在画面里找不到 sprite
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
const actionsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/actions.json'), 'utf8'));
const frames = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
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
const { actionAtlas, deathAgeOf, usesDeathFrames, pickActionFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const aframes = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) aframes[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
actionAtlas.img = { toString: () => '<actions_00.png>' };
{
  const KEYS = ['attack_back', 'hit_back', 'death_back'];
  const grouped = {};
  for (const page of actionsJson.pages) {
    for (const sp of page.sprites) {
      const key = KEYS.find((k) => sp.name.startsWith(`${k}_`));
      if (!key) continue;
      (grouped[key] ??= []).push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h });
    }
  }
  for (const key of KEYS) grouped[key]?.sort((a, b) => a.y - b.y || a.x - b.x);
  actionAtlas.frames = grouped;
  console.log('grouped keys =', Object.entries(grouped).map(([k, v]) => k + ':' + v.length).join(' '));
}

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { soldiers: 60, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 60, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
world.sides.A.troop = 0;
step(world);
const victim = world.units.find((u) => u.side === 'A' && !u.isGeneral);
victim.alive = false;
victim.lastHitTick = world.tick;
console.log('victim', JSON.stringify({ side: victim.side, kind: victim.kind, x: victim.x, y: victim.y, alive: victim.alive, lht: victim.lastHitTick }));
console.log('deathAgeOf =', deathAgeOf(victim, world), 'usesDeathFrames =', usesDeathFrames(victim, world), 'pickActionFrame =', pickActionFrame(victim, world, actionAtlas));
for (let t = 0; t < 6; t += 1) {
  step(world);
  const still = world.units.includes(victim);
  const camX = camera(world).x ?? camera(world);
  const p = projectUnit(victim.x, victim.y, camX);
  const cmds = buildFrame(world, { mode: 'fighting', units: unitsAtlas, skills: [], camX });
  const near = cmds.filter((c) => c.kind === 'sprite' && Math.abs(c.x - p.sx) < 40 && Math.abs(c.y - (p.sy + 26 * p.scale)) < 60);
  const actSprites = cmds.filter((c) => c.kind === 'sprite' && c.img === actionAtlas.img);
  console.log(`tick ${world.tick} alive=${victim.alive} inUnits=${still} age=${deathAgeOf(victim, world)} px=${p.sx.toFixed(1)},${(p.sy + 26 * p.scale).toFixed(1)} near=${near.length} act=${actSprites.length} total=${cmds.filter((c) => c.kind === 'sprite').length}`,
    near.map((c) => `${c.sx},${c.sy},${c.sw}x${c.sh}@${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' | '));
}
