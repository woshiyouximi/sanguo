// 导出「一次命中」前后若干 tick 的 sprite 指令，给 render_hits.py 用 Pillow 合成图片。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { hitAgeOf, actionAtlas } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { FIELD_TOP, FIELD_BOTTOM } = await import(pathToFileURL(path.join(GAME, 'src/core/field.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);

const uj = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {}; for (const sp of uj.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const UNITS_IMG = { tag: 'units_00.png' };
const units = { img: UNITS_IMG, imgEnemy: UNITS_IMG, frames, groups: uj.groups };
const aj = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/actions.json'), 'utf8'));
const keys = ['attack_back', 'hit_back', 'death_back'];
const grouped = {};
for (const p of aj.pages) for (const sp of p.sprites) { const k = keys.find((x) => sp.name.startsWith(x + '_')); if (k) (grouped[k] ??= []).push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h }); }
for (const k of keys) grouped[k]?.sort((a, b) => a.y - b.y || a.x - b.x);
const ACTIONS_IMG = { tag: 'actions_00.png' };
actionAtlas.img = ACTIONS_IMG;
actionAtlas.frames = grouped;

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({ data, seed: 7, a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
installArmyOrders(world);
for (const s of ['A', 'B']) { world.aiCommand?.(world, s, 'advance'); world.aiCommand?.(world, s, 'rush'); }

const view = (u, camX) => projectUnit(u.x, u.y, camX);
// 找一个「命中发生在画面中央下方」的 tick
let hitTick = -1;
for (let t = 0; t < 1400 && hitTick < 0; t += 1) {
  step(world);
  if (world.tick < 200) continue;
  const camX = camera(world).x ?? camera(world);
  const victim = world.units.find((u) => { const a = hitAgeOf(u, world); if (a !== 0) return false; const p = view(u, camX); return p.sy > FIELD_TOP + 200 && p.sy < FIELD_BOTTOM - 200 && p.sx > 150 && p.sx < 600; });
  if (victim) { hitTick = world.tick; const p = view(victim, camX); globalThis.FOCUS = [p.sx, p.sy]; }
}
if (hitTick < 0) throw new Error('没找到合适的命中帧');

const panels = [];
for (const off of [-8, -4, 0, 2, 6, 12, 18, 26]) {
  // 回到目标 tick：重新从 0 跑到 hitTick + off
  const w2 = createWorld({ data, seed: 7, a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } }, b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } }, aiSides: { A: false, B: false } });
  installArmyOrders(w2);
  for (const s of ['A', 'B']) { w2.aiCommand?.(w2, s, 'advance'); w2.aiCommand?.(w2, s, 'rush'); }
  for (let t = 0; t < hitTick + off; t += 1) step(w2);
  const camX = camera(w2).x ?? camera(w2);
  const cmds = buildFrame(w2, { mode: 'fighting', units, skills: [], camX });
  const sprites = cmds.filter((c) => c.kind === 'sprite').map((c) => ({
    sheet: c.img === ACTIONS_IMG ? 'actions_00.png' : 'units_00.png',
    sx: c.sx, sy: c.sy, sw: c.sw, sh: c.sh,
    x: c.x, y: c.y, w: c.w, h: c.h,
    rot: c.rot ?? 0, alpha: c.alpha ?? 1, comp: c.comp ?? 'source-over',
  }));
  panels.push({ tick: w2.tick, camX, sprites });
}
fs.writeFileSync(path.join(HERE, 'hits_dump.json'), JSON.stringify({ hitTick, focus: globalThis.FOCUS, panels }, null, 1), 'utf8');
console.log('hitTick', hitTick, 'panels', panels.map((p) => `${p.tick}:${p.sprites.length}`).join(' '));
