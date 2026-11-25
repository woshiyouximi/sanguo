// R194 验收探针：攻击帧是否「只在真出手时播」、受击/阵亡反馈是否两侧都有。
//   改前基线（probe_swing.mjs / probe_hitframe.mjs）：
//     待機 240 tick 画出 235 个攻击帧，100% 来自从没出过手的单位；
//     B 侧阵亡 35 次画出 0 帧（原地消失）；A 侧 hit 帧 0；death_back 216 帧（骑兵也用它）。
//   判据不靠「就近归属」（单位挤在一起时会串），改成**不变量计数**：
//     每 tick「画出来的攻击帧数」必须等于「出手年龄 ∈[0,24) 的存活单位数」。
// 跑法： node F:\sanguo\work\anim_fix\probe_r194.mjs
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
const { actionAtlas } = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const aframes = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) aframes[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
actionAtlas.img = { toString: () => '<actions_00.png>' };
// 与 animSelect.collectFrames() 同构：key → 有序 Rect[]（不是 name→rect！）
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
}

// key 用矩形自身的 x/y/w/h（sprite 指令的 sx/sy/sw/sh 是另一套含义，别混）
const rect2name = new Map();
for (const [n, r] of Object.entries(frames)) rect2name.set(`${r.x},${r.y},${r.w},${r.h}`, n);
for (const [n, r] of Object.entries(aframes)) { const k = `${r.x},${r.y},${r.w},${r.h}`; if (!rect2name.has(k)) rect2name.set(k, n); }
const frameName = (c) => rect2name.get(`${c.sx},${c.sy},${c.sw},${c.sh}`) ?? `?${c.sw}x${c.sh}`;
const isAtk = (n) => /_atk_|eatk/.test(n ?? '');
const isDeath = (n) => /death_/.test(n ?? '');

function mkWorld() {
  const data = loadData({ dir: path.join(GAME, 'data') });
  return createWorld({
    data, seed: 7,
    a: { soldiers: 60, general: { name: '張角', str: 56, int: 95, level: 45 } },
    b: { soldiers: 60, general: { name: '關羽', str: 97, int: 75, level: 40 } },
    aiSides: { A: false, B: false },
  });
}
const opts = { mode: 'fighting', units: unitsAtlas, skills: [] };
const age = (u, key, tick) => (u[key] == null ? null : tick - u[key]);
const out = {};

// ---------- Case 1：待機 240 tick ----------
{
  const world = mkWorld();
  let atkFrames = 0;
  for (let t = 0; t < 240; t += 1) {
    step(world);
    if (t % 10 !== 0) continue;
    const camX = camera(world).x ?? camera(world);
    for (const c of buildFrame(world, { ...opts, camX })) {
      if (c.kind === 'sprite' && isAtk(frameName(c))) atkFrames += 1;
    }
  }
  out.idle = { atkA: world.stats.attacksA, atkB: world.stats.attacksB, atkFrames };
}

// ---------- Case 2：接战 900 tick，逐 tick 对不变量 ----------
{
  const world = mkWorld();
  const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
  installArmyOrders(world);
  for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }
  const deaths = { A: 0, B: 0 };
  const seen = new Map(world.units.map((u) => [u, u.alive]));
  let samples = 0;
  let atkMismatch = 0;
  let rotMismatch = 0;
  let flashMismatch = 0;
  let drawnAtk = 0;
  let expAtkSum = 0;
  let drawnRot = 0;
  let expRotSum = 0;
  let drawnFlash = 0;
  let expFlashSum = 0;
  const worst = [];
  for (let t = 0; t < 900; t += 1) {
    step(world);
    for (const u of world.units) {
      if (seen.get(u) && !u.alive) deaths[u.side] += 1;
      seen.set(u, u.alive);
    }
    if (t % 2 !== 0) continue;
    samples += 1;
    const camX = camera(world).x ?? camera(world);
    const cmds = buildFrame(world, { ...opts, camX });
    let dAtk = 0, dRot = 0, dDeath = 0, dFlash = 0;
    for (const c of cmds) {
      if (c.kind !== 'sprite') continue;
      // 白闪是「同一帧再叠一层」，不是额外一个单位，统计时剔除
      if (c.comp === 'lighter') { dFlash += 1; continue; }
      const n = frameName(c);
      if (isAtk(n)) dAtk += 1;
      if (c.rot) dRot += 1;
      if (isDeath(n)) dDeath += 1;
    }
    // 期望值：直接读 world 的 tick 字段，不猜归属；口径必须与 drawSoldier 一致
    // （尸体把 animTick 冻结在阵亡那一 tick，所以它的攻击帧窗口也一起冻结）
    let eAtk = 0, eRot = 0, eFlash = 0;
    for (const u of world.units) {
      const d = age(u, 'lastHitTick', world.tick);
      const dying = !u.alive && d !== null && d >= 0 && d < 24;
      const animTick = dying ? world.tick - d : world.tick;
      const a = u.lastAttackTick == null ? null : animTick - u.lastAttackTick;
      if (a !== null && a >= 0 && a < 24) eAtk += 1;
      if (dying) eRot += 1;
      if (d !== null && d >= 0 && d <= 1) eFlash += 1;
    }
    drawnAtk += dAtk; expAtkSum += eAtk;
    drawnRot += dRot; expRotSum += eRot;
    drawnFlash += dFlash; expFlashSum += eFlash;
    if (dAtk !== eAtk) { atkMismatch += 1; if (worst.length < 8) worst.push({ tick: world.tick, dAtk, eAtk }); }
    if (dRot !== eRot) rotMismatch += 1;
    if (dFlash !== eFlash) flashMismatch += 1;
  }
  out.fight = {
    stats: { atkA: world.stats.attacksA, atkB: world.stats.attacksB, hitsA: world.stats.hitsA, hitsB: world.stats.hitsB, blocks: world.stats.blocks },
    deaths,
    samples,
    attackFrames: { drawn: drawnAtk, expected: expAtkSum, mismatchedSamples: atkMismatch, samples, worst },
    corpseTopple: { drawn: drawnRot, expected: expRotSum, mismatchedSamples: rotMismatch },
    hitFlash: { drawn: drawnFlash, expected: expFlashSum, mismatchedSamples: flashMismatch },
  };
}

// ---------- Case 3：朴刀兵（troop 0）的尸体必须用 death_back，而不是旋转 ----------
{
  const world = mkWorld();
  const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
  installArmyOrders(world);
  for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }
  // 先推进到两军接触、镜头里有兵，再挑一个「屏幕上看得见」的 A 兵打死
  for (let t = 0; t < 600; t += 1) step(world);
  world.sides.A.troop = 0; // 朴刀
  const camNow = camera(world).x ?? camera(world);
  const victim = world.units.find((u) => {
    if (u.side !== 'A' || u.isGeneral || !u.alive) return false;
    const p = projectUnit(u.x, u.y, camNow);
    return p.sy > 420 && p.sy < 980;
  });
  let deathFrames = 0, rotFrames = 0, plainFrames = 0;
  if (victim) {
    victim.alive = false;
    victim.lastHitTick = world.tick;
    for (let t = 0; t < 20; t += 1) {
      step(world);
      const camX = camera(world).x ?? camera(world);
      const p = projectUnit(victim.x, victim.y, camX);
      for (const c of buildFrame(world, { ...opts, camX })) {
        if (c.kind !== 'sprite') continue;
        if (Math.abs(c.x - p.sx) > 2) continue;
        if (Math.abs(c.y - (p.sy + 26 * p.scale)) > 2) continue;
        if (isDeath(frameName(c))) deathFrames += 1;
        else if (c.rot) rotFrames += 1;
        else plainFrames += 1;
      }
    }
  }
  out.podaoCorpse = { found: !!victim, deathFrames, rotFrames, plainFrames };
}

console.log(JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(HERE, 'probe_r194.json'), JSON.stringify(out, null, 1), 'utf8');
