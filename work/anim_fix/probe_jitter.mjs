// 只读取证探针 7：抖动/错位的改前 vs 改后（现在代码已经落地，所以两种状态靠内存改写复现）。
//   手法：module.registerHooks 在内存里改写 `src/core/battle.ts` / `src/view/battleView.ts` 源码，
//         **不落盘**；口径与 probe_overlap.mjs 一致（真实 buildFrame sprite 矩形、900 tick / 每 3 tick 采样）。
// 跑法：$env:VARIANT='orig'; node work\anim_fix\probe_jitter.mjs   （orig|now|half|third）
//   orig = 改前（±24/±18、无错位松弛）；now = 当前工作区（±12/±9 + 错位松弛）
//   half = 只用砍半、不松弛；third = ±8/±6 不松弛（历史对照）
import fs from 'node:fs';
import path from 'node:path';
import { registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const VARIANT = process.env.VARIANT ?? 'now';
const BATTLE_URL = pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href;
const VIEW_URL = pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href;

const JITTER = {
  orig: ['Math.floor(rng() * 0x30) - 0x18', 'Math.floor(rng() * 0x24) - 0x12'], // −24..+23 / −18..+17
  half: ['Math.floor(rng() * 0x18) - 0xC', 'Math.floor(rng() * 0x12) - 0x9'], // −12..+11 / −9..+8
  third: ['Math.floor(rng() * 0x10) - 0x8', 'Math.floor(rng() * 0xC) - 0x6'], // −8..+7 / −6..+5
  now: null, // 原样用工作区代码
};
const J = JITTER[VARIANT];
// 只砍半（不松弛）/ 只松弛（不砍半）也要能单独量，才说得清收益是谁带来的
const SPREAD = {
  orig: false, // 改前：±24/±18 + 无松弛
  half: false, // 只砍半
  third: false, // 只砍到 1/3
  offset: true, // 只松弛（抖动仍是 ±24/±18）
  now: true, // 现在：砍半 + 松弛
};
const WANT_SPREAD = SPREAD[VARIANT] ?? true;

const CUR_JX = 'const jx = Math.floor(rng() * 0x18) - 0xc;';
const CUR_JY = 'const jy = Math.floor(rng() * 0x12) - 0x9;';

registerHooks({
  load(url, context, nextLoad) {
    const r = nextLoad(url, context);
    if (url === BATTLE_URL && J) {
      let src = String(r.source);
      if (!src.includes(CUR_JX) || !src.includes(CUR_JY)) throw new Error('抖动源码与预期不符，probe 需要跟着改');
      src = src.replace(CUR_JX, `const jx = ${J[0]}; /* probe:${VARIANT} */`)
        .replace(CUR_JY, `const jy = ${J[1]}; /* probe:${VARIANT} */`);
      return { ...r, source: src };
    }
    if (url === VIEW_URL && !WANT_SPREAD) {
      let src = String(r.source);
      if (!src.includes('spreadSlidingActors(actors);')) throw new Error('错位松弛调用没找到，probe 需要跟着改');
      src = src.replace('spreadSlidingActors(actors);', '/* probe: 关闭错位松弛 */');
      return { ...r, source: src };
    }
    return r;
  },
});

const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera } = await import(BATTLE_URL);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);

const unitsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
const SENT = { toString: () => '<units_00.png>' };
const unitsAtlas = { img: SENT, imgEnemy: SENT, frames, groups: unitsJson.groups };

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data, seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const THRESH = [0.2, 0.35, 0.5, 0.75];
const stat = Object.fromEntries(THRESH.map((t) => [t, 0]));
let samples = 0;
let worst = null;
const dists = [];

function rects(cmds) {
  const out = [];
  for (const c of cmds) {
    if (c.kind !== 'sprite' || c.comp === 'lighter') continue;
    const s = c.w / 75;
    if (s < 0.6 || s > 1.3) continue;
    out.push({ x: c.x - c.w / 2, y: c.y - c.h, w: c.w, h: c.h, cx: c.x, cy: c.y, s });
  }
  return out;
}
function inter(a, b) {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  if (x1 <= x0 || y1 <= y0) return 0;
  return (x1 - x0) * (y1 - y0);
}

/** 渲染层「最小间距松弛」：同深度（脚底 y 相近）横向挤在一起的两单位，各向外推开一点。
 *  这是 §3.2.1 错位方案的可测代理：真实实现只需在 drawActors 里对 p.sx 做一次同款松弛。 */
function separate(rs) {
  const MIN_GAP = 22; // 躯干宽 28px 的一半，够把「叠死」压成「肩并肩」
  for (let iter = 0; iter < 2; iter += 1) {
    for (let i = 0; i < rs.length; i += 1) {
      for (let j = i + 1; j < rs.length; j += 1) {
        const a = rs[i], b = rs[j];
        if (Math.abs(a.cy - b.cy) > 24) continue; // 深度差太大就不是同一排，不动
        const dx = b.cx - a.cx;
        const need = MIN_GAP - Math.abs(dx);
        if (need <= 0) continue;
        const dir = dx === 0 ? (a.cx < b.cx ? -1 : 1) : Math.sign(dx);
        const push = Math.min(need / 2, 6);
        a.cx -= dir * push; a.x -= dir * push;
        b.cx += dir * push; b.x += dir * push;
      }
    }
  }
}

for (let t = 0; t < 900; t += 1) {
  step(world);
  if (t % 3 !== 0) continue;
  samples += 1;
  const camX = camera(world).x ?? camera(world);
  const rs = rects(buildFrame(world, { mode: 'fighting', units: unitsAtlas, skills: [], camX }));
  let delta = 0;
  void delta;
  for (let i = 0; i < rs.length; i += 1) {
    for (let j = i + 1; j < rs.length; j += 1) {
      const a = rs[i], b = rs[j];
      const area = inter(a, b);
      dists.push(Math.hypot(a.cx - b.cx, a.cy - b.cy));
      if (!area) continue;
      const ar = area / Math.min(a.w * a.h, b.w * b.h);
      for (const th of THRESH) if (ar >= th) stat[th] += 1;
      if (ar >= 0.5) delta += 1;
      if (!worst || ar > worst.ar) worst = { ar, tick: world.tick };
    }
  }
}

dists.sort((a, b) => a - b);
const per = Object.fromEntries(THRESH.map((t) => [t, +(stat[t] / samples).toFixed(2)]));
const out = {
  variant: VARIANT,
  jitter: VARIANT === 'now' ? '±12/±9 + 错位松弛' : VARIANT === 'half' ? '±12/±9' : VARIANT === 'third' ? '±8/±6' : VARIANT === 'offset' ? '±24/±18 + 错位松弛' : '±24/±18',
  samples,
  perFrame: per,
  worst,
  minDistPx: +dists[0].toFixed(2),
  p01DistPx: +dists[Math.floor(dists.length * 0.01)].toFixed(2),
};
fs.writeFileSync(path.join(HERE, `probe_jitter_${VARIANT}.json`), JSON.stringify(out, null, 1), 'utf8');
console.log(JSON.stringify(out));
