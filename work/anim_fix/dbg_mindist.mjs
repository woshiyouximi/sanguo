// 找出「最小 sprite 中心距」的那一对到底是谁（活人？尸体？滑行中？）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { deathAgeOf } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
const j = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {}; for (const sp of j.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const SENT = { toString: () => 'u' };
const units = { img: SENT, imgEnemy: SENT, frames, groups: j.groups };
const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
installArmyOrders(world);
for (const s of ['A', 'B']) { world.aiCommand?.(world, s, 'advance'); world.aiCommand?.(world, s, 'rush'); }
let best = { d: Infinity };
for (let t = 0; t < 900; t += 1) {
  step(world);
  if (t % 3) continue;
  const camX = camera(world);
  const sp = buildFrame(world, { mode: 'fighting', units, skills: [], camX }).filter((c) => c.kind === 'sprite' && c.comp !== 'lighter' && c.w / 75 > 0.6 && c.w / 75 < 1.3);
  for (let i = 0; i < sp.length; i += 1) {
    for (let k = i + 1; k < sp.length; k += 1) {
      const d = Math.hypot(sp[i].x - sp[k].x, sp[i].y - sp[k].y);
      if (d >= best.d) continue;
      const near = (c) => world.units.map((u) => { const p = projectUnit(u.x, u.y, camX); return { u, d: Math.hypot(p.sx - c.x, p.sy + 26 * p.scale - c.y) }; }).sort((a, b) => a.d - b.d)[0];
      const a = near(sp[i]), b = near(sp[k]);
      best = { d, tick: world.tick, a: { side: a.u.side, kind: a.u.kind, alive: a.u.alive, dying: deathAgeOf(a.u, world), slide: !!a.u.slide, dd: +a.d.toFixed(1) }, b: { side: b.u.side, kind: b.u.kind, alive: b.u.alive, dying: deathAgeOf(b.u, world), slide: !!b.u.slide, dd: +b.d.toFixed(1) } };
    }
  }
}
console.log(JSON.stringify(best, null, 1));
