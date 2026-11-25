// 只读取证探针 4：整场里有几个「受击 / 阵亡」帧被真正画出来？
//   统计 buildFrame 输出里帧名匹配 death_ / hit_ 的 sprite 数量，按帧名分组。
// 跑法： node F:\sanguo\work\anim_fix\probe_hitframe.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const animSel = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { actionAtlas, pickActionFrame, isDying, usesActionFrames } = animSel;

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
// 按 animSelect.collectFrames 的规则分组：key → 有序帧表（不是 name → rect！）
const ACTION_KEYS = ['attack_back', 'hit_back', 'death_back'];
const aframes = {};
for (const page of actionsJson.pages) {
  for (const sp of page.sprites) {
    const k = ACTION_KEYS.find((kk) => sp.name.startsWith(`${kk}_`));
    if (!k) continue;
    (aframes[k] ??= []).push({ x: sp.x, y: sp.y, w: sp.w, h: sp.h });
  }
}
for (const k of ACTION_KEYS) aframes[k]?.sort((a, b) => a.y - b.y || a.x - b.x);
actionAtlas.img = { toString: () => '<actions_00.png>' };
actionAtlas.frames = aframes;
const rect2name = new Map();
for (const [n, r] of Object.entries(frames)) rect2name.set(`${r.x},${r.y},${r.w},${r.h}`, n);
for (const k of ACTION_KEYS) for (const r of aframes[k] ?? []) {
  const key = `${r.x},${r.y},${r.w},${r.h}`; if (!rect2name.has(key)) rect2name.set(key, k);
}
const nameOf = (c) => rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? `?${c.sw}x${c.sh}`;

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data, seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const opts = { mode: 'fighting', units: unitsAtlas, skills: [] };
const hits = {}, deaths = {}, others = {};
const dyingBySide = {}, pickedSeen = {}, drawnNear = {};
let dyingSeen = 0, dyingDrawn = 0, hitsAliveSeen = 0;
const deathSamples = [];

for (let t = 0; t < 900; t += 1) {
  step(world);
  // 只在这个 tick 真有事件时算（省时间）
  const anyHit = world.units.some((u) => u.lastHitTick === world.tick);
  const anyDead = world.units.some((u) => !u.alive && isDying(u, world));
  if (!anyHit && !anyDead) continue;
  const camX = camera(world).x ?? camera(world);
  const cmds = buildFrame(world, { ...opts, camX }).filter((c) => c.kind === 'sprite');
  const names = cmds.map(nameOf);
  for (const n of names) {
    if (/^death_/.test(n)) deaths[n] = (deaths[n] || 0) + 1;
    else if (/^hit_/.test(n)) hits[n] = (hits[n] || 0) + 1;
    else if (/^(attack_back|death_back|hit_back)/.test(n)) others[n] = (others[n] || 0) + 1;
  }
  const pOf = (u) => projectUnit(u.x, u.y, camX);
  // 逐单位核对：isDying 的单位有没有被画出来
  for (const u of world.units) {
    if (u.alive) {
      if (u.lastHitTick != null && world.tick - u.lastHitTick < 16) {
        hitsAliveSeen += 1;
        const pick = pickActionFrame(u, world, actionAtlas);
        if (deathSamples.length < 10 && u.side === 'B') deathSamples.push({ tick: world.tick, side: u.side, hitAge: world.tick - u.lastHitTick, pick, usesActions: usesActionFrames(u) });
      }
      continue;
    }
    if (!isDying(u, world)) continue;
    dyingSeen += 1;
    dyingBySide[u.side] = (dyingBySide[u.side] || 0) + 1;
    const pick = pickActionFrame(u, world, actionAtlas);
    pickedSeen[`${u.side}:${pick ? pick.key : 'null'}`] = (pickedSeen[`${u.side}:${pick ? pick.key : 'null'}`] || 0) + 1;
    const p = pOf(u);
    const near = cmds.filter((c) => Math.abs(c.x - p.sx) < 1.5 && Math.abs(c.y - (p.sy + 26)) < 6);
    if (near.length) dyingDrawn += 1;
    for (const c of near) drawnNear[`${u.side}:${rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? '?'}`] =
      (drawnNear[`${u.side}:${rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? '?'}`] || 0) + 1;
    if (deathSamples.length < 20) deathSamples.push({ tick: world.tick, side: u.side, kind: u.kind, gen: !!u.isGeneral, pick, nearCount: near.length, names: near.map((c) => rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? '?') });
  }
}

console.log('900 tick 结果：');
console.log('  stats:', JSON.stringify({ atkA: world.stats.attacksA, atkB: world.stats.attacksB, hitsA: world.stats.hitsA, hitsB: world.stats.hitsB, blocks: world.stats.blocks }));
console.log('  画出的 death_* 帧:', JSON.stringify(deaths));
console.log('  画出的 hit_* 帧  :', JSON.stringify(hits));
console.log('  画出的 attack_back/death_back/hit_back:', JSON.stringify(others));
console.log('  isDying() 为真的单位-次:', dyingSeen);
console.log('  活着且刚挨打(<16tick)的单位-次:', hitsAliveSeen);
fs.writeFileSync(path.join(HERE, 'probe_hitframe.json'), JSON.stringify({ deaths, hits, others, dyingSeen, hitsAliveSeen, samples: deathSamples.slice(0, 20), stats: world.stats }, null, 1), 'utf8');

