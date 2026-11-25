// 原型：把「标签错开」算法在真实 60 城上跑一遍，确认 0 重叠/0 出界，再内联进 CampaignRoot.ts。
import fs from 'node:fs';

const MAP_VIEW = { x: 20, y: 130, w: 710, h: 900 };
const MAP_WORLD = { x0: 88, x1: 1138, y0: 84, y1: 860 };
const sv = MAP_VIEW.w / (MAP_WORLD.x1 - MAP_WORLD.x0);
const sh = MAP_VIEW.h / (MAP_WORLD.y1 - MAP_WORLD.y0);
const SCALE = Math.min(sv, sh) * 0.94;
const OX = MAP_VIEW.x + (MAP_VIEW.w - 1050 * SCALE) / 2;
const OY = MAP_VIEW.y + (MAP_VIEW.h - 776 * SCALE) / 2;
const toScreen = (x, y) => ({ x: OX + (x - MAP_WORLD.x0) * SCALE, y: OY + (y - MAP_WORLD.y0) * SCALE });

const data = JSON.parse(fs.readFileSync('F:/sanguo/game/cocos/assets/bundles/res/data/scenarios.json', 'utf8'));
const scenario = Array.isArray(data) ? data[0] : data.scenarios[0];
const cities = scenario.cities;

const pops = cities.map((c) => Number(c.POPULATION) || 0).filter((p) => p > 0).sort((a, b) => a - b);
const at = (q) => pops[Math.min(pops.length - 1, Math.floor(q * pops.length))] ?? 0;
const q1 = at(0.25), q2 = at(0.5), q3 = at(0.75);
const TIER_W = [22, 33, 40, 49], TIER_H = [18, 24, 28, 35];
const items = cities.map((c) => {
  const pop = Number(c.POPULATION) || 0;
  let tier = 1;
  if (pop > q1) tier += 1;
  if (pop > q2) tier += 1;
  if (pop > q3) tier += 1;
  const p = toScreen(c.pos_xy[0], c.pos_xy[1]);
  return { name: c.NAME, x: p.x, y: p.y, tier, iconH: Math.round(TIER_H[tier - 1] * 0.65) };
});

// ---- 待验证算法（与 CampaignRoot.ts 中的 layoutCityLabels 同构） ----
function textWidthOf(text, fontSize) {
  return Math.max(18, Array.from(text).length * fontSize + 2);
}
function overlapArea(box, placed) {
  let total = 0;
  for (const o of placed) {
    const ox = Math.min(box.x + box.w / 2, o.x + o.w / 2) - Math.max(box.x - box.w / 2, o.x - o.w / 2);
    const oy = Math.min(box.y + box.h / 2, o.y + o.h / 2) - Math.max(box.y - box.h / 2, o.y - o.h / 2);
    if (ox > 0 && oy > 0) total += ox * oy;
  }
  return total;
}
function layoutCityLabels(items, opts) {
  const h = Math.max(14, Math.round(opts.fontSize * 1.5));
  const steps = opts.steps ?? 14;
  const order = items.map((_, i) => i).sort((a, b) => items[a].y - items[b].y || items[a].x - items[b].x || (items[a].name < items[b].name ? -1 : 1));
  const out = new Array(items.length);
  const placed = [];
  order.forEach((idx, rank) => {
    const it = items[idx];
    const w = textWidthOf(it.name, opts.fontSize);
    const x = Math.min(Math.max(it.x, w / 2 + 3), opts.screenW - w / 2 - 3);
    const dirs = rank % 2 === 0 ? [-1, 1] : [1, -1];
    let best = null, bestOverlap = Infinity;
    for (const dir of dirs) {
      for (let k = 0; k < steps; k += 1) {
        const y = dir < 0
          ? it.y - it.iconH - opts.gap - h / 2 - k * (h + 2)
          : it.y + opts.gap + h / 2 + k * (h + 2);
        if (y - h / 2 < opts.top || y + h / 2 > opts.bottom) continue;
        const cand = { name: it.name, x, y, w, h, up: dir < 0, rank };
        const ov = overlapArea(cand, placed);
        if (ov === 0) { best = cand; bestOverlap = 0; break; }
        if (ov < bestOverlap) { bestOverlap = ov; best = cand; }
      }
      if (bestOverlap === 0) break;
    }
    const box = best ?? { name: it.name, x, y: opts.top + h / 2, w, h, up: true, rank };
    out[idx] = box;
    placed.push(box);
  });
  return out;
}

const boxes = layoutCityLabels(items, { fontSize: 14, gap: 3, top: 292, bottom: 878, screenW: 750, steps: 14 });
let worst = 0, count = 0;
for (let i = 0; i < boxes.length; i += 1) {
  for (let j = i + 1; j < boxes.length; j += 1) {
    const ov = overlapArea(boxes[i], [boxes[j]]);
    if (ov > 0) { count += 1; worst = Math.max(worst, ov); console.log('OVERLAP', boxes[i].name, boxes[i].up ? 'up' : 'dn', 'y=' + boxes[i].y.toFixed(1), '<->', boxes[j].name, 'y=' + boxes[j].y.toFixed(1), 'area=' + ov.toFixed(1)); }
  }
}
const ys = boxes.map((b) => Math.round(b.y));
const uniq = [...new Set(ys)].sort((a, b) => a - b);
const outOfBounds = boxes.filter((b) => b.y - b.h / 2 < 292 - 0.01 || b.y + b.h / 2 > 878 + 0.01 || b.x - b.w / 2 < 0 || b.x + b.w / 2 > 750);
const topY = Math.min(...ys), botY = Math.max(...ys);
const histogram = {};
for (const b of boxes) histogram[b.up ? 'up' : 'down'] = (histogram[b.up ? 'up' : 'down'] ?? 0) + 1;
console.log(JSON.stringify({ cities: cities.length, scale: SCALE, origin: [OX, OY], q: [q1, q2, q3], overlapPairs: count, worst, uniqY: uniq.length, topY, botY, outOfBounds: outOfBounds.length, histogram }, null, 1));
console.log('uniq sample', uniq.slice(0, 12).join(','), '...', uniq.slice(-8).join(','));

const disp = boxes
  .map((b) => {
    const it = items[b.name === b.name ? boxes.indexOf(b) : 0];
    const d = b.up ? it.y - it.iconH - b.y - b.h / 2 : b.y - b.h / 2 - it.y;
    return { n: b.name, d, dir: b.up ? 'up' : 'dn', y: b.y };
  })
  .sort((a, b) => b.d - a.d);
console.log('max disp', JSON.stringify(disp.slice(0, 6)));
console.log('disp>60', disp.filter((d) => d.d > 60).length, 'disp>120', disp.filter((d) => d.d > 120).length);
const dense = boxes.filter((b) => b.x > 360 && b.x < 560).sort((a, b) => a.y - b.y).map((b) => `${b.name} y=${b.y.toFixed(0)}${b.up ? 'u' : 'd'}`);
console.log('dense 360..560:', dense.join(' | '));
// 按 x 排序打印前 20 城，手查
console.log(boxes.slice().sort((a, b) => a.x - b.x).slice(0, 10).map((b) => `${b.name} x=${b.x.toFixed(0)} y=${b.y.toFixed(0)} ${b.up ? 'up' : 'dn'} w=${b.w}`).join('\n'));
