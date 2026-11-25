// 只读取证探针 6：用「真正画出来的 sprite 矩形」量化视觉重叠（而不是逻辑格位）。
//   判据：任意两个单位 sprite 矩形的交叠面积 / 较小矩形面积 ≥ 阈值，即「叠在一起」。
//   同时给出「把抖动贴回格心后」的同一统计，用来分离「抖动造成」vs「格距本身不够」。
// 跑法： node F:\sanguo\work\anim_fix\probe_overlap.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..', '..', 'game');
const { loadData } = await import(pathToFileURL(path.join(GAME, 'src/data.ts')).href);
const { createWorld, step, camera, unitCell } = await import(pathToFileURL(path.join(GAME, 'src/core/battle.ts')).href);
const { buildFrame } = await import(pathToFileURL(path.join(GAME, 'src/view/battleView.ts')).href);
const { projectUnit } = await import(pathToFileURL(path.join(GAME, 'src/view/projection.ts')).href);
const { installArmyOrders } = await import(pathToFileURL(path.join(GAME, 'src/core/army_cmd.ts')).href);

const unitsJson = JSON.parse(fs.readFileSync(path.join(GAME, 'web/anim/units.json'), 'utf8'));
const frames = {}, groups = {};
for (const sp of unitsJson.pages[0].sprites) frames[sp.name] = { x: sp.x, y: sp.y, w: sp.w, h: sp.h };
for (const [k, g] of Object.entries(unitsJson.groups)) {
  if (Array.isArray(g)) { groups[k] = g.slice(); continue; }
  const o = {};
  for (const kk of ['back', 'front', 'attack', 'attackEnemy']) if (Array.isArray(g[kk])) o[kk] = g[kk].slice();
  if (typeof g.hold === 'number') o.hold = g.hold;
  groups[k] = o;
}
const SENT = { toString: () => '<units_00.png>' };
const unitsAtlas = { img: SENT, imgEnemy: SENT, frames, groups };

const data = loadData({ dir: path.join(GAME, 'data') });
const world = createWorld({
  data, seed: 7,
  a: { soldiers: 100, general: { name: '張角', str: 56, int: 95, level: 45 } },
  b: { soldiers: 100, general: { name: '關羽', str: 97, int: 75, level: 40 } },
  aiSides: { A: false, B: false },
});
installArmyOrders(world);
for (const side of ['A', 'B']) { world.aiCommand?.(world, side, 'advance'); world.aiCommand?.(world, side, 'rush'); }

const opts = { mode: 'fighting', units: unitsAtlas, skills: [] };
const THRESH = [0.2, 0.35, 0.5, 0.75];
const stat = { n: 0, by: Object.fromEntries(THRESH.map((t) => [t, { all: 0, same: 0, cross: 0, max: 0 }])), worst: null };
let dupCellPairs = 0, dupCellMax = 0;
const snappedStat = { n: 0, by: Object.fromEntries(THRESH.map((t) => [t, { all: 0, same: 0, cross: 0 }])) };

function rects(cmds) {
  // 兵种图集的单位 sprite：基准宽 75，经 scaleSpriteCmds 后 c.w = 75*s（s∈[0.74,1.19]）
  const out = [];
  for (const c of cmds) {
    if (c.kind !== 'sprite') continue;
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
function attribute(r, world, camX) {
  // 脚底点 = (c.x, c.y - 26*s)（scaleSpriteCmds 之后）
  const footY = r.cy - 26 * r.s;
  let best = null, bd = 1e9;
  for (const u of world.units) {
    if (!u.alive) continue;
    const p = projectUnit(u.x, u.y, camX);
    if (Math.abs(p.sx - r.cx) > 1.5 || Math.abs(p.sy - footY) > 1.5) continue;
    const d = Math.abs(p.sx - r.cx) + Math.abs(p.sy - footY);
    if (d < bd) { bd = d; best = u; }
  }
  return best;
}

for (let t = 0; t < 900; t += 1) {
  step(world);
  if (t % 3 !== 0) continue;
  if (world.over) break;
  const camX = camera(world).x ?? camera(world);
  const cmds = buildFrame(world, { ...opts, camX });
  const rs = rects(cmds);
  // 逻辑同格检查：四舍五入到整数格后同一格里挤了几个活人
  {
    const cc = new Map();
    for (const u of world.units) {
      if (!u.alive) continue;
      const c2 = unitCell(u);
      const k = `${c2.gx},${c2.gy}`;
      cc.set(k, (cc.get(k) || 0) + 1);
    }
    for (const [, v] of cc) if (v > 1) { dupCellPairs += v - 1; if (v - 1 > dupCellMax) dupCellMax = v - 1; }
  }
  // 反查侧别
  for (const r of rs) { r.u = attribute(r, world, camX); r.side = r.u?.side ?? '?'; }
  // 贴回格心版本
  const snapped = rs.map((r) => {
    if (!r.u) return r;
    const p = projectUnit(r.u.x, r.u.y, camX);
    const q = projectUnit(Math.round(r.u.x), Math.round(r.u.y), camX);
    const dx = q.sx - p.sx, dy = q.sy - p.sy;
    return { ...r, cx: r.cx + dx, cy: r.cy + dy, x: r.x + dx, y: r.y + dy };
  });
  const run = (arr, bucket, key) => {
    bucket.n += 1;
    for (let i = 0; i < arr.length; i += 1) {
      for (let j = i + 1; j < arr.length; j += 1) {
        const a = arr[i], b = arr[j];
        if (Math.abs(a.cx - b.cx) > 80) continue; // 粗筛
        const ar = inter(a, b) / Math.min(a.w * a.h, b.w * b.h);
        for (const th of THRESH) {
          if (ar < th) continue;
          const st = bucket.by[th];
          st.all += 1;
          if (a.side === b.side) st.same += 1; else st.cross += 1;
          if (key === 'real' && (a.u?.isGeneral || b.u?.isGeneral)) {
            stat.genBy = stat.genBy ?? Object.fromEntries(THRESH.map((t) => [t, 0]));
            stat.genBy[th] += 1;
          }
          if (key === 'real') {
            if (ar > st.max) st.max = ar;
            if (ar > (stat.worst?.ar ?? 0)) stat.worst = {
              ar: +ar.toFixed(3), tick: world.tick,
              a: { side: a.side, kind: a.u?.kind, gx: a.u?.x, gy: a.u?.y },
              b: { side: b.side, kind: b.u?.kind, gx: b.u?.x, gy: b.u?.y },
              rectA: [a.x, a.y, a.w, a.h].map((v) => +v.toFixed(1)),
              rectB: [b.x, b.y, b.w, b.h].map((v) => +v.toFixed(1)),
            };
          }
        }
      }
    }
  };
  run(rs, stat, 'real');
  run(snapped, snappedStat, 'snap');
}

const per = (b) => Object.fromEntries(THRESH.map((t) => [t, +(b.by[t].all / b.n).toFixed(2)]));
const perSide = (b) => Object.fromEntries(THRESH.map((t) => [t, { same: +(b.by[t].same / b.n).toFixed(2), cross: +(b.by[t].cross / b.n).toFixed(2) }]));
console.log(`采样 ${stat.n} 帧（每 3 tick 一采，900 tick 内）`);
console.log('实际绘制矩形「叠在一起」的对数 / 每样本平均：');
console.log('  ', JSON.stringify(per(stat)));
console.log('  分侧（same=同阵营，cross=敌我）：', JSON.stringify(perSide(stat)));
console.log('  各阈值最大交叠比：', JSON.stringify(Object.fromEntries(THRESH.map((t) => [t, +stat.by[t].max.toFixed(3)]))));
console.log('  含主将的对数/样本：', JSON.stringify(Object.fromEntries(THRESH.map((t) => [t, +((stat.genBy?.[t] ?? 0) / stat.n).toFixed(2)]))));
console.log('  最糟一对：', JSON.stringify(stat.worst));
console.log('\n把抖动贴回格心后（同一批单位、同一 tick）：');
console.log('  ', JSON.stringify(per(snappedStat)));
console.log('  分侧：', JSON.stringify(perSide(snappedStat)));
console.log('  逻辑同格（round 后同一格）多余单位：每样本', +(dupCellPairs/stat.n).toFixed(3), ' 单帧最多', dupCellMax);
fs.writeFileSync(path.join(HERE, 'probe_overlap.json'), JSON.stringify({ samples: stat.n, real: per(stat), realSide: perSide(stat), snapped: per(snappedStat), snappedSide: perSide(snappedStat), worst: stat.worst }, null, 1), 'utf8');


