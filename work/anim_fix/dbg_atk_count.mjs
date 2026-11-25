// 复现 anim_view sim 到 tick 680，找出「画出的攻击帧比应为多 3」的来源
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { attackAgeOf, deathAgeOf } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { FIELD_TOP, FIELD_BOTTOM } = await import(pathToFileURL(path.join(GAME, 'src/core/field.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
const j = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {}; for (const sp of j.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const IMG = { tag: 'u' };
const units = { img: IMG, imgEnemy: IMG, frames, groups: j.groups };
const atkKeys = new Set();
for (const g of Object.values(j.groups)) for (const n of [...(g.attack ?? []), ...(g.attackEnemy ?? [])]) { const f = frames[n]; if (f) atkKeys.add(`${f.x},${f.y},${f.w},${f.h}`); }
const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { troop: 2, soldiers: 30, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { troop: 10, soldiers: 30, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
installArmyOrders(world);
for (const s of ['A', 'B']) { world.aiCommand?.(world, s, 'advance'); world.aiCommand?.(world, s, 'rush'); }
for (let t = 0; t < 680; t += 1) step(world);
const camX = camera(world).x ?? camera(world);
const cmds = buildFrame(world, { mode: 'fighting', units, skills: [], camX });
const sp = cmds.filter((c) => c.kind === 'sprite' && c.comp !== 'lighter');
const drawn = sp.filter((c) => atkKeys.has(`${c.sx},${c.sy},${c.sw},${c.sh}`));
const vis = (u) => { const p = projectUnit(u.x, u.y, camX); return !(p.sy < FIELD_TOP - 80 || p.sy > FIELD_BOTTOM + 80); };
const expect = world.units.filter((u) => vis(u) && attackAgeOf(u, deathAgeOf(u, world) === null ? world.tick : world.tick - deathAgeOf(u, world), 24) !== null);
console.log('tick', world.tick, 'drawn', drawn.length, 'expected', expect.length);
for (const c of drawn) {
  const m = world.units.map((u) => { const p = projectUnit(u.x, u.y, camX); return { u, d: Math.hypot(p.sx - c.x, p.sy + 26 * p.scale - c.y) }; }).sort((a, b) => a.d - b.d)[0];
  console.log(' sprite', `${c.sx},${c.sy},${c.sw}x${c.sh}`, '@', c.x.toFixed(1), c.y.toFixed(1), 'img=', c.img === IMG ? 'units' : 'other', 'nearest=', m.u.side, m.u.kind, 'gen=', !!m.u.isGeneral, 'alive=', m.u.alive, 'd3=', m.d.toFixed(1), 'age24=', String(attackAgeOf(m.u, deathAgeOf(m.u, world) === null ? world.tick : world.tick - deathAgeOf(m.u, world), 24)), 'lat=', String(m.u.lastAttackTick));
}
