#!/usr/bin/env node
// R101 证据探针：Cocos 大地图版式三修（project/101_Cocos大地图版式.md）
//
//   node work/cocos_map84/probe.mjs            # 单元证据 + 现有产物运行时证据 + 截图
//   node work/cocos_map84/probe.mjs --unit      # 只跑单元证据（不碰浏览器）
//
// 两条证据链：
//   A. 单元级（永远可跑）：把 CampaignRoot.ts 的 `// #region 版式纯函数` 整段抽出来，
//      用仓库自带的 typescript 去类型 → 写成 _unit_layout.mjs → 真的 import 进 node 断言。
//      三个纯函数就是三修的判定点：cityIconSize / layoutCityLabels / planBaseMap。
//   B. 运行时级（需要 game/cocos-build/web-mobile 是**重建后**的产物）：CDP 连 9222 上
//      已经开着的 Cocos 页面，读 CityIcon_* 的真实 contentSize、60 个城名标签的 y、
//      以及 CampaignBg / CampaignBands 节点是否存在。产物过期时这里会打印 STALE，
//      并把「修前基线」记下来（不冒充修复证据）。
//
// 输出：work/cocos_map84/probe_report.json + 控制台摘要 + shot_*.png
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = 'F:/sanguo';
const OUT = path.join(ROOT, 'work/cocos_map84');
const SRC = path.join(ROOT, 'game/cocos/assets/scripts/CampaignRoot.ts');
const SCENARIOS = path.join(ROOT, 'game/cocos/assets/bundles/res/data/scenarios.json');
const PORT = Number(process.env.CDP_PORT || 9222);
const UNIT_ONLY = process.argv.includes('--unit');

// 与 CampaignRoot.ts 的 toScreen()/mapImageRect() 同源：scale=0.635619、origin=(41.300,333.380)
// （project/73_Cocos美术复位.md §4 实测值；下面 selfCheck 会用 project/73 的三个样点反验）。
const MAP_VIEW = { x: 20, y: 130, w: 710, h: 900 };
const MAP_WORLD = { x0: 88, x1: 1138, y0: 84, y1: 860 };
const SCALE = (Math.min(MAP_VIEW.w / (MAP_WORLD.x1 - MAP_WORLD.x0), MAP_VIEW.h / (MAP_WORLD.y1 - MAP_WORLD.y0)) * 0.94);
const ORIGIN = {
  x: MAP_VIEW.x + (MAP_VIEW.w - 1050 * SCALE) / 2,
  y: MAP_VIEW.y + (MAP_VIEW.h - 776 * SCALE) / 2,
};
const toScreen = (x, y) => ({ x: ORIGIN.x + (x - MAP_WORLD.x0) * SCALE, y: ORIGIN.y + (y - MAP_WORLD.y0) * SCALE });
// mapImageRect() 用的是 toScreen(0,0)（世界图左上角，不是 origin 本身）→ {-14.63, 279.99, 813.59, 610.19}
const IMG_CORNER = toScreen(0, 0);
const MAP_RECT = { x: IMG_CORNER.x, y: IMG_CORNER.y, w: 1280 * SCALE, h: 960 * SCALE };
const DESIGN = { w: 750, h: 1334 };

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : `  ${JSON.stringify(detail)}`}`);
}

// ---------------------------------------------------------------------------
// A. 单元级：抽 region → tsc 去类型 → import
// ---------------------------------------------------------------------------
async function loadUnit() {
  const src = fs.readFileSync(SRC, 'utf8');
  const begin = src.indexOf('// #region 版式纯函数');
  const endMark = '// #endregion';
  const end = src.indexOf(endMark, begin);
  if (begin < 0 || end < 0) throw new Error('CampaignRoot.ts 里的 // #region 版式纯函数 … // #endregion 不见了');
  const region = src.slice(begin, end);
  const tsFile = [path.join(ROOT, 'game/node_modules/typescript/lib/typescript.js'), path.join(ROOT, 'node_modules/typescript/lib/typescript.js')].find((p) => fs.existsSync(p));
  if (!tsFile) throw new Error('找不到 typescript/lib/typescript.js（game/node_modules 下应有）');
  const ts = (await import(pathToFileURL(tsFile).href)).default;
  const out = ts.transpileModule(region, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const file = path.join(OUT, '_unit_layout.mjs');
  fs.writeFileSync(file, out, 'utf8');
  return { mod: await import(`${pathToFileURL(file).href}?t=${Date.now()}`), region, out, ts };
}

function unitTests(mod, src) {
  const { cityIconSize, layoutCityLabels, planBaseMap, cityLabelWidth, bandColorAt, CITY_ICON_K } = mod;
  check('region 导出三个纯函数', [cityIconSize, layoutCityLabels, planBaseMap].every((f) => typeof f === 'function'));
  check('CITY_ICON_K=0.65（对齐 web）', Math.abs(CITY_ICON_K - 0.65) < 1e-9, CITY_ICON_K);

  // ① 城点尺寸：四档原始尺寸（project/73 §4 实测 22×18 / 33×24 / 40×28 / 49×35）
  const tiers = [
    { rect: { width: 22, height: 18 }, originalSize: { width: 22, height: 18 } },
    { rect: { width: 33, height: 24 }, originalSize: { width: 33, height: 24 } },
    { rect: { width: 40, height: 28 }, originalSize: { width: 40, height: 28 } },
    { rect: { width: 49, height: 35 }, originalSize: { width: 49, height: 35 } },
  ];
  const sizes = tiers.map((f) => cityIconSize(f));
  check(
    '①四档图元 → 14×12 / 21×16 / 26×18 / 32×23',
    JSON.stringify(sizes) === JSON.stringify([{ width: 14, height: 12 }, { width: 21, height: 16 }, { width: 26, height: 18 }, { width: 32, height: 23 }]),
    sizes,
  );
  check('①全部 ≤ 64×64（验收线）', sizes.every((s) => s.width <= 64 && s.height <= 64), sizes);
  // 复现旧 bug 的输入：texture 是 2048 的图集页。旧代码取 texture.width → 2048；新函数只认 rect。
  const pageFrame = { rect: { width: 22, height: 18 }, originalSize: { width: 22, height: 18 }, texture: { width: 2048, height: 2048 } };
  check('①同一帧带 2048 texture 时仍取 14×12（不再读 texture）', JSON.stringify(cityIconSize(pageFrame)) === '{"width":14,"height":12}', cityIconSize(pageFrame));
  // 兜底：真拿到 2048 的 originalSize 也只到 64
  const bad = cityIconSize({ rect: { width: 2048, height: 2048 }, originalSize: { width: 2048, height: 2048 } });
  check('①病态 2048 帧被夹到 64×64', bad.width === 64 && bad.height === 64, bad);
  check('①originalSize 为 0 时回落到 rect', JSON.stringify(cityIconSize({ rect: { width: 40, height: 28 }, originalSize: { width: 0, height: 0 } })) === '{"width":26,"height":18}');
  check('①无帧时给最小占位（不是 0）', JSON.stringify(cityIconSize(null)) === '{"width":10,"height":10}', cityIconSize(null));

  // ② 底图版式：只留一张 CHINAMAP + 上下装饰带
  const plan = planBaseMap(MAP_RECT, DESIGN.w, DESIGN.h);
  check('②底图只有 1 张且是 map/chinamap', plan.images.length === 1 && plan.images[0].path === 'map/chinamap', plan.images.map((i) => i.path));
  check('②没有任何 bg/map_bg 图层', !JSON.stringify(plan).includes('map_bg'));
  check(
    '②地图 813.6×610.2 + 上带 0..280 + 下带 890..1334',
    Math.abs(plan.bands.map.w - 813.6) < 0.2 && plan.bands.top.h === 280 && plan.bands.bottom.y === 890 && plan.bands.bottom.h === 444,
    { map: plan.bands.map, top: plan.bands.top, bottom: plan.bands.bottom },
  );
  check('②双金线 y：上 276/126、下 891/1072', JSON.stringify(plan.rails) === JSON.stringify({ top: [276, 126], bottom: [891, 1072] }), plan.rails);
  check('②装饰带渐变与 web 同色', JSON.stringify([bandColorAt(0), bandColorAt(1)]) === JSON.stringify([{ r: 29, g: 23, b: 16 }, { r: 16, g: 13, b: 9 }]), [bandColorAt(0), bandColorAt(1)]);

  // ③ 标签错开：真实 60 城
  const data = JSON.parse(fs.readFileSync(SCENARIOS, 'utf8'));
  const cities = (Array.isArray(data) ? data[0] : data.scenarios[0]).cities;
  // 城点档位（与 computeCityTiers 同构）
  const pops = cities.map((c) => Number(c.POPULATION) || 0).filter((p) => p > 0).sort((a, b) => a - b);
  const at = (q) => pops[Math.min(pops.length - 1, Math.floor(q * pops.length))] ?? 0;
  const qs = [at(0.25), at(0.5), at(0.75)];
  const tierH = [18, 24, 28, 35];
  const items = cities.map((c) => {
    const pop = Number(c.POPULATION) || 0;
    let tier = 1;
    if (pop > qs[0]) tier += 1;
    if (pop > qs[1]) tier += 1;
    if (pop > qs[2]) tier += 1;
    const p = toScreen(c.pos_xy[0], c.pos_xy[1]);
    const size = cityIconSize(tiers[tier - 1]);
    return { name: c.NAME, x: p.x, y: p.y, iconH: size.height, tier };
  });
  const top = Math.floor(MAP_RECT.y) + 12;
  const bottom = Math.floor(MAP_RECT.y + MAP_RECT.h) - 12;
  const boxes = layoutCityLabels(items, { fontSize: 14, gap: 3, top, bottom, screenW: DESIGN.w });
  check('③60 城都拿到标签框', boxes.length === 60 && boxes.every((b) => b && typeof b.y === 'number'));
  const overlap = [];
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const ox = Math.min(boxes[i].x + boxes[i].w / 2, boxes[j].x + boxes[j].w / 2) - Math.max(boxes[i].x - boxes[i].w / 2, boxes[j].x - boxes[j].w / 2);
      const oy = Math.min(boxes[i].y + boxes[i].h / 2, boxes[j].y + boxes[j].h / 2) - Math.max(boxes[i].y - boxes[i].h / 2, boxes[j].y - boxes[j].h / 2);
      if (ox > 0.01 && oy > 0.01) overlap.push([boxes[i].name, boxes[j].name, +(ox * oy).toFixed(1)]);
    }
  }
  check('③60 城标签两两不重叠', overlap.length === 0, overlap.slice(0, 5));
  const outOfBounds = boxes.filter((b) => b.y - b.h / 2 < top - 0.01 || b.y + b.h / 2 > bottom + 0.01 || b.x - b.w / 2 < -0.01 || b.x + b.w / 2 > DESIGN.w + 0.01);
  check('③全部落在图幅内 [top,bottom]×[0,750]', outOfBounds.length === 0, { top, bottom, bad: outOfBounds.slice(0, 3) });
  const uniqY = [...new Set(boxes.map((b) => Math.round(b.y)))];
  check('③标签 y 去重 ≥3 组（旧版只有 1 组 = 144）', uniqY.length >= 3, { groups: uniqY.length, min: Math.min(...uniqY), max: Math.max(...uniqY) });
  const up = boxes.filter((b) => b.up).length;
  check('③上下都要有（不挤在同一侧）', up >= 10 && up <= 50, { up, down: 60 - up });
  // 标签离自己的城点不能太远（旧实现里全是同一个 y，这条会爆）
  const disp = boxes.map((b, i) => {
    const it = items[i];
    return b.up ? it.y - it.iconH - (b.y + b.h / 2) : b.y - b.h / 2 - it.y;
  });
  check('③标签离城点 ≤ 80px（不会飘到别的城头上）', Math.max(...disp) <= 80, { maxDisp: +Math.max(...disp).toFixed(1) });
  check('③标签宽度按字宽算（不是 110 的排版框）', cityLabelWidth('宛', 14) === 18 && cityLabelWidth('虎牢關', 14) === 44, [cityLabelWidth('宛', 14), cityLabelWidth('虎牢關', 14)]);

  // 坐标换算自证：project/73 §4 的三个样点
  const s1 = toScreen(1108, 90);
  const s2 = toScreen(728, 84);
  const s3 = toScreen(968, 540);
  const near = (p, x, y) => Math.abs(p.x - x) < 0.2 && Math.abs(p.y - y) < 0.2;
  check(
    '换算与 project/73 §4 样点一致（scale=0.635619, origin=41.300/333.380）',
    Math.abs(SCALE - 0.635619) < 1e-6 && near(s1, 689.6, 337.2) && near(s2, 448.1, 333.4) && near(s3, 600.6, 623.2),
    { scale: SCALE, origin: ORIGIN, s1, s2, s3 },
  );

  // 源码级：旧实现的三处代码真的没了
  check('源码不再 load bg/map_bg', !/load\(\s*'bg\/map_bg'/.test(src));
  check('源码不再用 spriteFrame.texture.width 当尺寸', !/\.texture\s*[;\n]/.test(src.replace(/^\s*\/\/.*$/gm, '')) || !/tex\.width/.test(src));
  check('源码改用 cityIconSize/layoutCityLabels/planBaseMap', ['cityIconSize(art)', 'layoutCityLabels(items', 'planBaseMap(this.mapImageRect()'].every((s) => src.includes(s)));
  return { boxes, items, plan, sizes, uniqY };
}

// ---------------------------------------------------------------------------
// B. 运行时级：CDP
// ---------------------------------------------------------------------------
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(p, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) events.push(msg);
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { ws, send, ready, events };
}

const RUNTIME_EXPR = `(() => {
  const scene = cc.director.getScene();
  let comp = null;
  const all = [];
  const walk = (n) => {
    all.push(n);
    try { const c = n.getComponent('CampaignRoot'); if (c) comp = c; } catch (e) {}
    n.children.forEach(walk);
  };
  walk(scene);
  const ut = (n) => {
    let t = null;
    try { t = n.getComponent('cc.UITransform'); } catch (e) {}
    if (!t) { try { t = n.getComponent('UITransform'); } catch (e) {} }
    if (!t) { try { t = n._uiProps && n._uiProps.uiTransformComp; } catch (e) {} }
    return t ? { w: +t.width.toFixed(2), h: +t.height.toFixed(2) } : null;
  };
  const icons = all.filter((n) => n.name.startsWith('CityIcon_')).map((n) => ({ name: n.name.slice('CityIcon_'.length), size: ut(n), active: n.activeInHierarchy, pos: { x: +n.position.x.toFixed(1), y: +n.position.y.toFixed(1) } }));
  const labels = all.filter((n) => n.name.startsWith('Label_')).map((n) => ({ node: n.name, text: (n.getComponent('cc.Label') || {}).string || '', pos: { x: +n.position.x.toFixed(1), y: +n.position.y.toFixed(1) }, size: ut(n), active: n.activeInHierarchy }));
  const mapNode = all.find((n) => n.name === 'CampaignMapImage') || null;
  const bgNode = all.find((n) => n.name === 'CampaignBg') || null;
  const bandNode = all.find((n) => n.name === 'CampaignBands') || null;
  const fadeNode = all.find((n) => n.name === 'CampaignEdgeFade') || null;
  const marker = comp && comp.buildArt ? /CampaignBands|planBaseMap/.test(String(comp.buildArt)) : false;
  const frames = comp && comp.cityFrames ? comp.cityFrames.map((f) => (f ? { rect: { w: f.rect.width, h: f.rect.height }, originalSize: { w: f.originalSize.width, h: f.originalSize.height }, tex: { w: f.texture ? f.texture.width : 0, h: f.texture ? f.texture.height : 0 } } : null)) : [];
  return {
    scene: scene.name,
    canvas: (() => { const c = scene.getChildByName('Canvas'); const t = c ? ut(c) : null; return t; })(),
    marker: marker,
    icons,
    labels,
    mapNode: mapNode ? { active: mapNode.activeInHierarchy, size: ut(mapNode), pos: { x: +mapNode.position.x.toFixed(1), y: +mapNode.position.y.toFixed(1) } } : null,
    bgNode: bgNode ? { active: bgNode.activeInHierarchy, size: ut(bgNode) } : null,
    bandNode: bandNode ? { active: bandNode.activeInHierarchy, children: bandNode.children.length } : null,
    edgeFadeNode: fadeNode ? { active: fadeNode.activeInHierarchy } : null,
    frames,
  };
})()`;

// 产物过期时的运行时补充证据：把 CampaignRoot.ts 里**同一段**纯函数注入页面（去 export、
// 包进 IIFE），再拿它们的返回值去改**真实节点**——图标 contentSize 用 cityIconSize 算，
// 60 个标签位置用 layoutCityLabels 算，底图换成 planBaseMap 的装饰带（Graphics 绘制部分
// 无法抽成纯函数，这里按 CampaignRoot.paintBand 的同一套色/线重画）。这样节点级数字是真的，
// 但「这段代码已进产物」这件事仍然只能等重建后由 marker 证明。
function shimSource(regionJs) {
  const body = regionJs.replace(/^export /gm, '');
  return `(() => {
${body}
const scene = cc.director.getScene();
let comp = null;
const walk = (n) => { if (!comp) { try { const c = n.getComponent('CampaignRoot'); if (c) comp = c; } catch (e) {} } n.children.forEach(walk); };
walk(scene);
if (!comp) return { ok: false, error: 'CampaignRoot component 没找到' };
const NodeCtor = comp.node.constructor;
const UITransformCtor = comp.node.getComponent('cc.UITransform').constructor;
const GraphicsCtor = comp.gMap.constructor;
const ColorCtor = comp.gMap.fillColor.constructor;
const LABEL_TOP = Math.floor(comp.mapImageRect().y) + 12;
const LABEL_BOTTOM = Math.floor(comp.mapImageRect().y + comp.mapImageRect().h) - 12;

// ② 底图：停用 map_bg 层与旧渐变，补 CampaignBands
const bg = comp.node.getChildByName('CampaignBg');
if (bg) bg.active = false;
const fade = comp.node.getChildByName('CampaignEdgeFade');
if (fade) fade.active = false;
const rect = comp.mapImageRect();
const plan = planBaseMap(rect, 750, 1334);
let created = false;
let bands = comp.node.getChildByName('CampaignBands');
if (!bands) {
  bands = new NodeCtor('CampaignBands');
  bands.layer = comp.node.layer;
  bands.parent = comp.node;
  bands.setPosition(0, 0, 0);
  bands.addComponent(UITransformCtor).setContentSize(750, 1334);
  bands.setSiblingIndex(0);
  const g = bands.addComponent(GraphicsCtor);
  const fill = (x, y, w, h, c) => { g.fillColor = new ColorCtor(c.r, c.g, c.b, c.a); g.rect(x - 375, 667 - y - h, w, h); g.fill(); };
  const paint = (band) => {
    const STEPS = 12;
    for (let i = 0; i < STEPS; i += 1) {
      const y = band.y + (band.h * i) / STEPS;
      const h = (band.h * (i + 1)) / STEPS - (band.h * i) / STEPS;
      const c = bandColorAt((i + 0.5) / STEPS);
      fill(band.x, y, band.w, h, { r: c.r, g: c.g, b: c.b, a: 255 });
    }
    g.fillColor = new ColorCtor(216, 179, 106, 11);
    let n = 0;
    for (let y = band.y + 3; y + 1 <= band.y + band.h - 2; y += 4) { g.rect(band.x - 375, 667 - y - 1, band.w, 1); n += 1; }
    if (n) g.fill();
  };
  paint(plan.bands.top);
  paint(plan.bands.bottom);
  g.strokeColor = new ColorCtor(216, 179, 106, 76);
  g.lineWidth = 1;
  g.rect(plan.bands.map.x - 375, 667 - plan.bands.map.y - plan.bands.map.h, plan.bands.map.w, plan.bands.map.h);
  g.stroke();
  const gold = (y, h, c) => fill(0, y, 750, h, c);
  gold(plan.rails.top[0], 3, { r: 176, g: 138, b: 74, a: 235 });
  gold(plan.rails.top[0] - 1, 1, { r: 230, g: 201, b: 138, a: 140 });
  gold(plan.rails.top[1], 1, { r: 138, g: 106, b: 56, a: 190 });
  gold(plan.rails.bottom[0], 3, { r: 176, g: 138, b: 74, a: 235 });
  gold(plan.rails.bottom[0] + 3, 1, { r: 230, g: 201, b: 138, a: 140 });
  gold(plan.rails.bottom[1], 1, { r: 138, g: 106, b: 56, a: 190 });
  created = true;
}

// ①③ 包装 drawMap：先让原逻辑画（它会把尺寸刷成 2048、标签刷到 144），再按新纯函数改回来
const proto = Object.getPrototypeOf(comp);
if (!proto.__r101) {
  const origDrawMap = proto.drawMap;
  proto.drawMap = function (g) {
    origDrawMap.call(this, g);
    const heights = new Map();
    for (const city of this.cities) {
      const icon = this.cityIcons.get(city.NAME);
      const frame = icon && icon.sprite && icon.sprite.spriteFrame;
      if (!frame) { heights.set(city.NAME, 0); continue; }
      const size = cityIconSize(frame);
      icon.box.setContentSize(size.width, size.height);
      heights.set(city.NAME, size.height);
    }
    const items = this.cities.map((city) => {
      const p = this.cityScreen.get(city.NAME) || { x: 375, y: 580 };
      return { name: city.NAME, x: p.x, y: p.y, iconH: heights.get(city.NAME) || 0 };
    });
    const boxes = layoutCityLabels(items, { fontSize: 14, gap: 3, top: LABEL_TOP, bottom: LABEL_BOTTOM, screenW: 750 });
    for (const box of boxes) {
      const label = this.cityLabels.get(box.name);
      if (label) label.node.setPosition(box.x - 375, 667 - box.y, 0);
    }
  };
  proto.__r101 = true;
}
comp.drawFrame();
return { ok: true, created, labelBand: [LABEL_TOP, LABEL_BOTTOM], plan: JSON.parse(JSON.stringify(plan)) };
})()`;
}

async function runtimeProbe(regionJs) {
  const v = await jget('/json/version').catch(() => null);
  if (!v) {
    console.log('SKIP  运行时探针：9222 上没有浏览器（先 node work/cocos_verify/cdp.mjs launch）');
    return { skipped: 'no-browser' };
  }
  const list = await jget('/json/list');
  const page = list.find((x) => x.type === 'page' && (x.url || '').includes('cocos-build'));
  if (!page) {
    console.log('SKIP  运行时探针：没有 cocos-build 页面');
    return { skipped: 'no-page' };
  }
  const { ws, send, ready } = connect(page.webSocketDebuggerUrl);
  await ready;
  await send('Page.enable');
  await send('Runtime.enable');
  // 打一颗「旧文档」标记：reload 期间旧 document 还活着，必须等这颗标记消失才算新页面，
  // 否则会读到上一次（可能被 shim 改过）的节点状态。
  const token = `probe_${Date.now()}`;
  await send('Runtime.evaluate', { expression: `window.__probeToken = ${JSON.stringify(token)}` }).catch(() => {});
  await send('Page.reload', { ignoreCache: true });
  const evalJs = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error((r.exceptionDetails.exception || {}).description || r.exceptionDetails.text);
    return r.result.value;
  };
  let lived = false;
  const freshAndAlive = `typeof window.__probeToken === 'undefined' && typeof window.cc === 'object' && !!cc.director.getScene() && !!cc.director.getScene().getChildByName('Canvas')`;
  for (let i = 0; i < 100; i += 1) {
    await sleep(400);
    const ok = await evalJs(freshAndAlive).catch(() => false);
    if (ok) {
      lived = true;
      break;
    }
  }
  if (!lived) throw new Error('页面 40s 内没换成新文档 / 没把 Canvas 挂起来');
  // 等 CampaignRoot 把 60 城加载完
  let base = null;
  for (let i = 0; i < 60; i += 1) {
    await sleep(500);
    base = await evalJs(RUNTIME_EXPR);
    if (base && base.icons.length >= 50) break;
  }
  const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
  const shotPath = (tag) => path.join(OUT, `shot_${stamp}_${tag}.png`);
  const shoot = async (tag) => {
    const png = await send('Page.captureScreenshot', { format: 'png' });
    const p = shotPath(tag);
    fs.writeFileSync(p, Buffer.from(png.data, 'base64'));
    return p;
  };
  const shot = await shoot(base && base.marker ? 'fixed' : 'before');

  let shim = null;
  let after = null;
  let shotAfter = null;
  if (base && !base.marker) {
    shim = await evalJs(shimSource(regionJs)).catch((err) => ({ ok: false, error: err.message }));
    await sleep(600);
    after = shim && shim.ok ? await evalJs(RUNTIME_EXPR) : null;
    shotAfter = await shoot('shim');
  }
  ws.close();
  return { ...base, shot, shim, after, shotAfter };
}

function describeState(rt, cityNames) {
  const tally = rt.icons.reduce((m, i) => {
    const k = i.size ? `${i.size.w}x${i.size.h}` : '?';
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  const cityLabels = rt.labels.filter((l) => cityNames.has(l.text));
  const yHist = cityLabels.reduce((m, l) => {
    const k = Math.round(l.pos.y);
    m[k] = (m[k] || 0) + 1;
    return m;
  }, {});
  const designY = (nodeY) => Math.round(667 - nodeY); // 节点局部 y → 设计稿 y
  const designHist = Object.entries(yHist).reduce((m, [k, n]) => {
    m[designY(Number(k))] = n;
    return m;
  }, {});
  return {
    iconCount: rt.icons.length,
    iconSizeTally: tally,
    iconOversize: rt.icons.filter((i) => !i.size || i.size.w > 64 || i.size.h > 64).length,
    iconSamples: rt.icons.slice(0, 6).map((i) => `${i.name}=${i.size ? `${i.size.w}x${i.size.h}` : '?'}`),
    cityLabelCount: cityLabels.length,
    labelDistinctY: Object.keys(designHist).length,
    labelYRange: [
      Math.min(...Object.keys(designHist).map(Number)),
      Math.max(...Object.keys(designHist).map(Number)),
    ],
    labelYHist: designHist,
    topCluster: Object.entries(designHist).sort((a, b) => b[1] - a[1]).slice(0, 3),
    bgNode: rt.bgNode,
    bandNode: rt.bandNode,
    edgeFadeNode: rt.edgeFadeNode,
    mapNode: rt.mapNode,
  };
}

function runtimeReport(rt) {
  if (!rt || rt.skipped) return rt;
  const cityNames = new Set(JSON.parse(fs.readFileSync(SCENARIOS, 'utf8'))[0].cities.map((c) => c.NAME));
  const before = describeState(rt, cityNames);
  const report = {
    buildIsFixed: rt.marker,
    stale: !rt.marker,
    screenshotBefore: rt.shot,
    before,
    frames: rt.frames,
    shim: rt.shim,
    after: rt.after ? describeState(rt.after, cityNames) : null,
    screenshotAfter: rt.shotAfter,
  };

  if (!rt.marker) {
    console.log('STALE  产物是**修前**版本（buildArt 里找不到 CampaignBands/planBaseMap）→ 先记基线，再用 shim 在真实节点上跑同一段纯函数');
    console.log(`       修前：CityIcon ${JSON.stringify(before.iconSizeTally)}，>64 的 ${before.iconOversize} 个；标签 y 去重 ${before.labelDistinctY} 组，${JSON.stringify(before.topCluster[0])}；CampaignBg ${before.bgNode ? 'active' : '无'}`);
    if (!report.after) {
      check('运行时 shim 落地（产物过期时的替代证据）', false, rt.shim);
      return report;
    }
    const a = report.after;
    check('①shim 后 CityIcon_* 全部 ≤64×64', a.iconOversize === 0 && a.iconCount > 0, { tally: a.iconSizeTally, oversize: a.iconOversize });
    check('①shim 后尺寸 = 14×12 / 21×16 / 26×18 / 32×23 四档', Object.keys(a.iconSizeTally).sort().join(',') === '14x12,21x16,26x18,32x23', a.iconSizeTally);
    check('③shim 后 60 个城名标签 y 去重 ≥3 组', a.labelDistinctY >= 3, { groups: a.labelDistinctY, range: a.labelYRange, hist: a.labelYHist });
    check('②shim 后 CampaignBg.active=false（map_bg 停用）', !!a.bgNode && a.bgNode.active === false, a.bgNode);
    check('②shim 后 CampaignBands 存在且 active', !!a.bandNode && a.bandNode.active !== false, a.bandNode);
    console.log(`       修后(shim)：CityIcon ${JSON.stringify(a.iconSizeTally)}，>64 的 ${a.iconOversize} 个；标签 y 去重 ${a.labelDistinctY} 组 [${a.labelYRange.join(', ')}]，最多一组 ${JSON.stringify(a.topCluster[0])}`);
  } else {
    const b = report.before;
    check('①运行时 CityIcon_* 全部 ≤64×64', b.iconOversize === 0 && b.iconCount > 0, { tally: b.iconSizeTally, oversize: b.iconOversize });
    check('③运行时 60 个城名标签 y 去重 ≥3 组', b.labelDistinctY >= 3, { groups: b.labelDistinctY, range: b.labelYRange });
    check('②运行时没有 CampaignBg（map_bg 层）', !b.bgNode || b.bgNode.active === false, b.bgNode);
    check('②运行时 CampaignBands 存在', !!b.bandNode, b.bandNode);
  }
  return report;
}

// ---------------------------------------------------------------------------
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const src = fs.readFileSync(SRC, 'utf8');
  const { mod, region, out } = await loadUnit();
  const unit = unitTests(mod, src);
  const rt = UNIT_ONLY ? { skipped: 'unit-only' } : await runtimeProbe(out).catch((err) => ({ error: err.message }));
  const runtime = runtimeReport(rt);
  const report = {
    at: new Date().toISOString(),
    source: SRC,
    regionChars: region.length,
    runs: results,
    failed: results.filter((r) => !r.ok).length,
    runtime,
    unitSummary: {
      iconSizes: unit.sizes,
      labelDistinctY: unit.uniqY.length,
      labelYRange: [Math.min(...unit.uniqY), Math.max(...unit.uniqY)],
      plan: unit.plan,
    },
  };
  fs.writeFileSync(path.join(OUT, 'probe_report.json'), JSON.stringify(report, null, 1), 'utf8');
  console.log(`\n==== ${results.length - report.failed}/${results.length} PASS, failed=${report.failed} ====`);
  console.log('unitSummary ' + JSON.stringify(report.unitSummary));
  console.log('report → ' + path.join(OUT, 'probe_report.json'));
  process.exit(report.failed ? 1 : 0);
})().catch((err) => {
  console.error('probe crashed:', err);
  process.exit(2);
});
