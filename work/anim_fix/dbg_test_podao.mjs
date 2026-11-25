// 复现 anim_view.test.ts 最后一个用例的环境，打印为什么不画尸体
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { actionAtlas, deathAgeOf, usesDeathFrames, pickActionFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { FIELD_TOP, FIELD_BOTTOM } = await import(pathToFileURL(path.join(GAME, 'src/core/field.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
const unitsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const actionsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/actions.json'), 'utf8'));
const frames = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const IMG = { tag: 'units' };
const unitsAtlas = { img: IMG, imgEnemy: IMG, frames, groups: unitsJson.groups };
const KEYS = ['attack_back', 'hit_back', 'death_back'];
const grouped = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) {
  const k = KEYS.find((x) => sp.name.startsWith(x + '_'));
  if (k) (grouped[k] ??= []).push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h });
}
actionAtlas.img = { tag: 'actions' };
actionAtlas.frames = grouped;

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { troop: 0, soldiers: 20, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { troop: 0, soldiers: 20 }, aiSides: { A: false, B: false } });
installArmyOrders(world);
for (const s of ['A', 'B']) { world.aiCommand?.(world, s, 'advance'); world.aiCommand?.(world, s, 'rush'); }
for (let t = 0; t < 200; t += 1) step(world);
const camX0 = camera(world).x ?? camera(world);
const vis = (u) => { const p = projectUnit(u.x, u.y, camX0); return !(p.sy < FIELD_TOP - 80 || p.sy > FIELD_BOTTOM + 80); };
const victim = world.units.find((u) => u.side === 'A' && u.isGeneral !== true && vis(u));
console.log('visible A soldiers =', world.units.filter((u) => u.side === 'A' && u.isGeneral !== true && vis(u)).length, 'victim =', !!victim, victim && { kind: victim.kind, x: victim.x, y: victim.y });
victim.alive = false;
victim.lastHitTick = world.tick;
console.log('deathAge =', deathAgeOf(victim, world), 'usesDeath =', usesDeathFrames(victim, world), 'pick =', JSON.stringify(pickActionFrame(victim, world, actionAtlas)));
const p = projectUnit(victim.x, victim.y, camX0);
const cmds = buildFrame(world, { mode: 'fighting', units: unitsAtlas, skills: [], camX: camX0 });
const sp = cmds.filter((c) => c.kind === 'sprite');
console.log('sprites =', sp.length, 'anchor target =', p.sx.toFixed(1), (p.sy + 26 * p.scale).toFixed(1));
const near = sp.filter((c) => Math.abs(c.x - p.sx) < 8 && Math.abs(c.y - (p.sy + 26 * p.scale)) < 20);
console.log('near =', near.map((c) => `${c.sx},${c.sy},${c.sw}x${c.sh}@${c.x.toFixed(1)},${c.y.toFixed(1)} img=${c.img === actionAtlas.img ? 'actions' : 'units'}`).join(' | ') || '(none)');
