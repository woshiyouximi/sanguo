// 只读取证探针 1（不起浏览器）：
//   (A) 攻击 / 受击 / 走路 到底选中了哪一帧 —— 用真 world + 真 buildFrame 反解 sprite 矩形，
//       把 units.json 的 rect→帧名 映射回来，逐 tick 打印。回答「攻击有没有挥砍帧」。
//   (B) 几何量化：车道节距 vs 兵贴图宽度、抖动 ±18px 到底把多少对单位推进「互相压」的区间。
//   (C) 重叠统计：600 tick 内「士兵↔士兵」「士兵↔主将」屏幕包围盒重叠对数，
//       并对比「实际位置」与「贴回格心（无抖动）位置」两组数，把抖动的锅单独称出来。
//
// 跑法： node F:\sanguo\work\anim_fix\probe_frames.mjs
// 说明：只 import game/src（Node 24 直接跑 .ts），不改任何生产文件。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const WEB = path.join(GAME, 'web');
const OUT = HERE;

const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera, actionIntervalOf } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const proj = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { projectUnit, lanePitch, rowPitch } = proj;
const { pickUnitFrames } = await import(pathToFileURL(path.join(GAME, 'src/view/unitFrames.ts')).href);
const animSel = await import(pathToFileURL(path.join(GAME, 'src/view/animSelect.ts')).href);
const { pickActionFrame, actionAtlas, ATTACK_TICKS, HIT_TICKS, DEATH_TICKS } = animSel;

const unitsJson = JSON.parse(fs.readFileSync(path.join(WEB, 'anim/units.json'), 'utf8'));
const actionsJson = JSON.parse(fs.readFileSync(path.join(WEB, 'anim/actions.json'), 'utf8'));

// ---- 把 units.json 转成运行时 UnitsAtlas（img 用哨兵对象，Node 里没有 Image） ----
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
const SENTINEL_IMG = { toString: () => '<units_00.png>' };
const unitsAtlas = { img: SENTINEL_IMG, imgEnemy: SENTINEL_IMG, frames, groups };

// ---- 把 actions.json 也灌进 actionAtlas，模拟「图集已加载」这条真实路径 ----
const aframes = {};
for (const page of actionsJson.pages) for (const sp of page.sprites) aframes[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
actionAtlas.img = { toString: () => '<actions_00.png>' };
actionAtlas.frames = aframes;

// rect(sx,sy,sw,sh) → 帧名（反解 buildFrame 的 sprite 指令画的是哪一帧）
const rect2name = new Map();
for (const [name, r] of Object.entries(frames)) rect2name.set(r.x + ',' + r.y + ',' + r.w + ',' + r.h, name);
for (const [name, r] of Object.entries(aframes)) {
  const key = (r.x + ',' + r.y + ',' + r.w + ',' + r.h);
  if (!rect2name.has(key)) rect2name.set(key, name);
}
const nameOf = (c) => rect2name.get(c.sx + ',' + c.sy + ',' + c.sw + ',' + c.sh) ?? ('?rect ' + [c.sx, c.sy, c.sw, c.sh].join(','));

// ---- 造一场仗并让它打起来（与 tests/_engage.ts 同一套指令层） ----
const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data,
  seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const FIGHT_OPTS = { mode: 'fighting', units: unitsAtlas, skills: [] };

// =========== (0) 常量表 ===========
const consts = {
  TICK_HZ_note: '1 tick = 1/60 s',
  LANE_PITCH_near_px: +lanePitch(proj.ROWS_NEAR ?? 8).toFixed(2),
  LANE_PITCH_center_px: +lanePitch(0).toFixed(2),
  ROW_PITCH_px: +rowPitch(0).toFixed(2),
  soldier_sprite_w_px: 75,
  scale_far: +proj.rowScale(-(proj.ROWS_FAR ?? 8)).toFixed(3),
  scale_near: +proj.rowScale(proj.ROWS_NEAR ?? 8).toFixed(3),
  ATTACK_TICKS, HIT_TICKS, DEATH_TICKS,
  soldier_interval_ticks: actionIntervalOf(world.units.find((u) => !u.isGeneral) ?? { side: 'A' }),
  general_interval_ticks: actionIntervalOf(world.units.find((u) => u.isGeneral) ?? { isGeneral: true, side: 'A' }),
};

// =========== (A) 帧序列取证 ===========
const attacks = [];          // {tick, side, general}
const timeline = [];         // 逐 tick 明细（盯住第一对互殴的）
let tracked = null;
const MAXT = 900;

for (let t = 0; t < MAXT; t += 1) {
  step(world);
  for (const u of world.units) {
    if (u.lastAttackTick === world.tick && attacks.length < 400) attacks.push({ tick: world.tick, side: u.side, general: !!u.isGeneral, x: +u.x.toFixed(2), y: +u.y.toFixed(2) });
  }
  if (!tracked) {
    const cand = world.units.find((u) => u.lastAttackTick === world.tick);
    if (cand) tracked = { side: cand.side, ref: cand, x0: cand.x, y0: cand.y, t0: world.tick };
  }
  if (tracked && world.tick >= tracked.t0 && world.tick <= tracked.t0 + 50) {
    const u = tracked.ref;
    const camX = camera(world).x ?? camera(world);
    const cmds = buildFrame(world, { ...FIGHT_OPTS, camX: camX });
    const p = projectUnit(u.x, u.y, camX);
    const s = p.scale;
    const wantX = Math.round(p.sx);
    const wantY = Math.round(p.sy) + 26 * s;
    const hit = cmds.filter((c) => c.kind === 'sprite' && Math.abs(c.x - wantX) < 0.6 && Math.abs(c.y - wantY) < 0.6);
    const set = pickUnitFrames(world, u, { units: unitsAtlas });
    const act0 = pickActionFrame(u, world, actionAtlas);
    const act = set && set.attack.length > 0 && act0?.key === 'attack_back' ? null : act0;
    timeline.push({
      tick: world.tick,
      cd: u.cd,
      alive: u.alive,
      dt_from_attack: world.tick - (u.lastAttackTick ?? -999),
      act0: act0 ? act0.key + '#' + act0.index : null,
      action_wins: !!act,
      set: set ? { walk: set.frames.length, attack: set.attack.length, hold: set.hold, w: set.w } : null,
      drawn: hit.map(nameOf),
      drawnXY: hit.map((c) => [+c.x.toFixed(1), +c.y.toFixed(1), +c.w.toFixed(1), +c.h.toFixed(1)]),
    });
  }
}

// =========== (B)(C) 几何 + 重叠统计 ===========
const SPRITE_W = 75;   // units.json meta.canvas_w
const SPRITE_H = 100;  // 标称高度（帧高 58..106，取标称值只用于统一口径）

function bodyRect(u, camX, snapToCell) {
  const gx = snapToCell ? Math.round(u.x) : u.x;
  const gy = snapToCell ? Math.round(u.y) : u.y;
  const p = projectUnit(gx, gy, camX);
  const w = SPRITE_W * p.scale;
  const h = SPRITE_H * p.scale;
  const bottom = p.sy + 26 * p.scale;      // pushSpriteFrames: y = fy + 26 → 底边
  return { x: p.sx - w / 2, y: bottom - h, w, h };
}
function interArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

const stat = {
  ticks: 0,
  actual_pairs: 0, actual_pairs_cross_side: 0, actual_pairs_same_side: 0,
  snapped_pairs: 0,
  actual_general_pairs: 0, snapped_general_pairs: 0,
  max_overlap_frac: 0, max_overlap_pair: null,
  min_lane_gap_px: 999,
  ticks_with_any_overlap: 0,
  worst_tick: null,
};
const perTickWorst = [];

for (let t = 0; t < 600; t += 1) {
  step(world);
  const camX = camera(world).x ?? camera(world);
  const alive = world.units.filter((u) => u.alive && u.side);
  let anyA = 0, anyS = 0;
  const rectsA = alive.map((u) => bodyRect(u, camX, false));
  const rectsS = alive.map((u) => bodyRect(u, camX, true));
  for (let i = 0; i < alive.length; i += 1) {
    for (let j = i + 1; j < alive.length; j += 1) {
      const ga = !!alive[i].isGeneral, gb = !!alive[j].isGeneral;
      const ia = interArea(rectsA[i], rectsA[j]);
      if (ia > 0) {
        stat.actual_pairs += 1; anyA += 1;
        if (alive[i].side === alive[j].side) stat.actual_pairs_same_side += 1; else stat.actual_pairs_cross_side += 1;
        if (ga || gb) stat.actual_general_pairs += 1;
        const frac = ia / Math.min(rectsA[i].w * rectsA[i].h, rectsA[j].w * rectsA[j].h);
        if (frac > stat.max_overlap_frac) {
          stat.max_overlap_frac = frac;
          stat.max_overlap_pair = { tick: world.tick, a: [alive[i].side, alive[i].isGeneral ? 'G' : 'S', +alive[i].x.toFixed(2), +alive[i].y.toFixed(2)], b: [alive[j].side, alive[j].isGeneral ? 'G' : 'S', +alive[j].x.toFixed(2), +alive[j].y.toFixed(2)] };
        }
        // 相邻车道最小屏幕间距（用格心算，不含抖动）
        const sxA = projectUnit(Math.round(alive[i].x), Math.round(alive[i].y), camX).sx;
        const sxB = projectUnit(Math.round(alive[j].x), Math.round(alive[j].y), camX).sx;
        const gap = Math.abs(sxA - sxB) - (rectsS[i].w + rectsS[j].w) / 2;
        if (gap < stat.min_lane_gap_px) stat.min_lane_gap_px = +gap.toFixed(1);
      }
      if (interArea(rectsS[i], rectsS[j]) > 0) { stat.snapped_pairs += 1; anyS += 1; if (ga || gb) stat.snapped_general_pairs += 1; }
    }
  }
  stat.ticks += 1;
  if (anyA > 0) stat.ticks_with_any_overlap += 1;
  perTickWorst.push({ tick: world.tick, actual: anyA, snapped: anyS });
}

stat.max_overlap_frac = +stat.max_overlap_frac.toFixed(3);
stat.pct_ticks_with_overlap = +(100 * stat.ticks_with_any_overlap / stat.ticks).toFixed(1);
stat.avg_actual_pairs_per_tick = +(stat.actual_pairs / stat.ticks).toFixed(1);
stat.avg_snapped_pairs_per_tick = +(stat.snapped_pairs / stat.ticks).toFixed(1);
stat.alive_soldiers_at_end = world.units.filter((u) => u.alive && !u.isGeneral).length;

// 攻击统计
const atkA = attacks.filter((a) => a.side === 'A').length;
const atkB = attacks.filter((a) => a.side === 'B').length;
const atkGen = attacks.filter((a) => a.general).length;

const out = { consts, attacks: { total: attacks.length, A: atkA, B: atkB, general: atkGen, first10: attacks.slice(0, 10) }, timeline, stat, perTickWorst: perTickWorst.filter((r) => r.actual > 0).slice(0, 40) };
fs.writeFileSync(path.join(OUT, 'probe_frames.json'), JSON.stringify(out, null, 1), 'utf8');

// =========== 控制台摘要 ===========
console.log('=== (0) 常量 ===');
console.log(JSON.stringify(consts, null, 1));
console.log('\n=== (A) 第一对互殴的逐 tick 明细（tracked side=' + (tracked && tracked.side) + ' t0=' + (tracked && tracked.t0) + '）===');
for (const r of timeline) {
  console.log('t=' + r.tick + ' dt=' + String(r.dt_from_attack).padStart(3) + ' cd=' + String(r.cd).padStart(2)
    + ' act0=' + String(r.act0).padEnd(18) + ' actWins=' + (r.action_wins ? 'Y' : '.')
    + ' set=' + (r.set ? r.set.attack + 'atk/' + r.set.w + 'w' : 'null')
    + ' drawn=' + JSON.stringify(r.drawn));
}
console.log('\n=== (B) 几何 ===');
console.log('车道节距(中排)=' + consts.LANE_PITCH_center_px + 'px, 兵贴图宽=75px × scale(' + consts.scale_far + '..' + consts.scale_near + ')');
console.log('=> 同排相邻车道的兵，零抖动时也重叠 ' + (75 * consts.scale_near - consts.LANE_PITCH_near_px).toFixed(1) + 'px(按近排)');
console.log('抖动 jy=±18px => 相邻两兵最多再靠近 36px');
console.log('\n=== (C) 600 tick 重叠统计 ===');
console.log(JSON.stringify(stat, null, 1));
console.log('\n=== 攻击次数 ===');
console.log('total=' + attacks.length + ' A=' + atkA + ' B=' + atkB + ' 主将=' + atkGen);
console.log('\n写出 ' + path.join(OUT, 'probe_frames.json'));
