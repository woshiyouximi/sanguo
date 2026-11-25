// tick 763 现场：所有 sprite 中心距 < 10 的对，以及它们与各自「最近单位原始锚点」的关系
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
const j = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {}; for (const sp of j.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const SENT = { toString: () => 'u' };
const units = { img: SENT, imgEnemy: SENT, frames, groups: j.groups };
const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
installArmyOrders(world);
for (const s of ['A', 'B']) { world.aiCommand?.(world, s, 'advance'); world.aiCommand?.(world, s, 'rush'); }
for (let t = 0; t < 763; t += 1) step(world);
const camX = camera(world);
const sp = buildFrame(world, { mode: 'fighting', units, skills: [], camX }).filter((c) => c.kind === 'sprite' && c.comp !== 'lighter' && c.w / 75 > 0.6 && c.w / 75 < 1.3);
const pairs = [];
for (let i = 0; i < sp.length; i += 1) for (let k = i + 1; k < sp.length; k += 1) {
  const d = Math.hypot(sp[i].x - sp[k].x, sp[i].y - sp[k].y);
  if (d < 12) pairs.push({ d: +d.toFixed(2), a: [sp[i].x, sp[i].y, sp[i].w, sp[i].h], b: [sp[k].x, sp[k].y, sp[k].w, sp[k].h] });
}
pairs.sort((a, b) => a.d - b.d);
console.log('closest pairs < 12px:', JSON.stringify(pairs.slice(0, 5), null, 1));
const anchors = world.units.filter((u) => u.alive || u.slide).map((u) => { const p = projectUnit(u.x, u.y, camX); return { side: u.side, kind: u.kind, slide: !!u.slide, ax: +p.sx.toFixed(1), ay: +(p.sy + 26 * p.scale).toFixed(1), gx: +u.x.toFixed(2), gy: +u.y.toFixed(2) }; });
for (const p of pairs.slice(0, 3)) {
  const near = anchors.map((a) => ({ ...a, dc: +Math.hypot(a.ax - p.a[0], a.ay - p.a[1]).toFixed(1) })).sort((x, y) => x.dc - y.dc)[0];
  const near2 = anchors.map((a) => ({ ...a, dc: +Math.hypot(a.ax - p.b[0], a.ay - p.b[1]).toFixed(1) })).sort((x, y) => x.dc - y.dc)[0];
  console.log('pair', p.d, 'spriteA→', JSON.stringify(near), 'spriteB→', JSON.stringify(near2));
}
