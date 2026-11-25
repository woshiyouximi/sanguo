#!/usr/bin/env node
/**
 * 九宫皮肤的 node 侧断言（无 Cocos 运行时，纯函数 + 桩组件）。
 *
 *   cd F:\sanguo
 *   node work\cocos_skin\skin_assert.mjs
 *
 * 做法：用仓库自带的 tsc（game/node_modules/typescript）把
 * `game/cocos/assets/scripts/UiSkin.ts` 与 `view/theme.ts` 现场 transpile 成 CommonJS，
 * 再用一个极小的 `cc` 桩（Node / UITransform / Sprite / SpriteFrame / Graphics / Label /
 * Color / Vec2 / Layers）把它跑起来。这样验的是**真源码**，不是另抄一份的副本。
 *
 * 覆盖：
 *  1. 表完整性：26 个 key 全在、src/size/insets 自洽、磁盘 26 张 PNG 尺寸与表一致、
 *     与 web 原件逐字节相同（只拷副本、没动原件）、总体积 20,742 B。
 *  2. 几何：insets 每条 < 图宽/图高；`sliceInsetsOf` 与引擎 `sliced.ts` 的角缩放式子同构；
 *     任何尺寸下 9 宫矩形都铺满且不越界；750 宽面板的 9 块之和 = 面板尺寸。
 *  3. 渲染：SLICED + SizeMode.CUSTOM + trim=false；insets 真的写到帧上；
 *     加载失败/未知 key 一律降级 Graphics 描边且**不抛**；节点先销毁再回调也不抛；
 *     帧缓存命中、makeBtn / makePanel / placeDesign 行为。
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');
const SCRIPTS = path.join(REPO, 'game', 'cocos', 'assets', 'scripts');
const RES_UI = path.join(REPO, 'game', 'cocos', 'assets', 'bundles', 'res', 'ui');
const WEB_ORIG = path.join(REPO, 'game', 'web', 'assets', 'ui', 'orig');
const WEB_BUI = path.join(REPO, 'game', 'web', 'assets', 'battleui');
const TS_DIR = path.join(REPO, 'game', 'node_modules', 'typescript');

const EXPECTED_TOTAL_BYTES = 20742;
const EXPECTED = {
  frame_panel: { size: [241, 73], insets: [8, 8, 8, 8] },
  plate_btn: { size: [308, 40], insets: [16, 16, 16, 16] },
  plate_sq: { size: [64, 68], insets: [12, 12, 12, 12] },
  plate_sel: { size: [100, 120], insets: [12, 12, 12, 12] },
  bar_div: { size: [111, 12], insets: [0, 0, 0, 0], tile: false },
  gem_gold: { size: [22, 22], insets: [0, 0, 0, 0], icon: true },
  slot: { size: [34, 34], insets: [14, 14, 14, 14] },
  slot_off: { size: [22, 22], insets: [8, 8, 8, 8] },
  cmd_on: { size: [38, 38], insets: [16, 16, 16, 16] },
  cmd_off: { size: [34, 34], insets: [14, 14, 14, 14] },
  port: { size: [34, 34], insets: [14, 14, 14, 14] },
  msg: { size: [26, 26], insets: [10, 10, 10, 10] },
  sep: { size: [111, 12], insets: [0, 0, 0, 0], tile: true },
};
for (let i = 1; i <= 13; i++) {
  const k = `force_${String(i).padStart(2, '0')}`;
  EXPECTED[k] = { size: [16, i === 5 ? 17 : 16], insets: [0, 0, 0, 0], icon: true };
}
const EXPECTED_KEYS = [
  'frame_panel', 'plate_btn', 'plate_sq', 'plate_sel', 'bar_div', 'sep',
  'slot', 'slot_off', 'cmd_on', 'cmd_off', 'port', 'msg', 'gem_gold',
  ...Array.from({ length: 13 }, (_, i) => `force_${String(i + 1).padStart(2, '0')}`),
];

/* ------------------------------------------------------------------ 断言夹具 */
let pass = 0;
const fails = [];
const groups = [];
let current = { name: '(未分组)', pass: 0, fails: 0 };

function group(name) {
  current = { name, pass: 0, fails: 0 };
  groups.push(current);
}
function ok(cond, msg) {
  if (cond) {
    pass++;
    current.pass++;
  } else {
    fails.push(`[${current.name}] ${msg}`);
    current.fails++;
  }
}
function eq(actual, expected, msg) {
  ok(Object.is(actual, expected), `${msg}：期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}
function near(actual, expected, msg, eps = 1e-6) {
  ok(Math.abs(actual - expected) <= eps, `${msg}：期望 ${expected}±${eps}，实际 ${actual}`);
}
function noThrow(fn, msg) {
  try {
    fn();
    pass++;
    current.pass++;
  } catch (e) {
    fails.push(`[${current.name}] ${msg}：抛异常 ${e && e.stack ? e.stack.split('\n')[0] : e}`);
    current.fails++;
  }
}
function eqArray(actual, expected, msg) {
  const same =
    Array.isArray(actual) &&
    actual.length === expected.length &&
    expected.every((v, i) =>
      typeof v === 'number' && typeof actual[i] === 'number'
        ? Math.abs(actual[i] - v) <= 1e-9
        : Object.is(actual[i], v),
    );
  ok(same, `${msg}：期望 [${expected}]，实际 ${JSON.stringify(actual)}`);
}

/* ---------------------------------------------------------------- cc 桩组件 */
const ccStats = { warn: [], nodes: 0 };

class CCObject {
  constructor() {
    this.isValid = true;
  }
  destroy() {
    this.isValid = false;
  }
}

class Color {
  constructor(r = 255, g = 255, b = 255, a = 255) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.a = a;
  }
  fromHEX(hex) {
    const h = String(hex).replace('#', '');
    const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
    this.r = (n >> 16) & 0xff;
    this.g = (n >> 8) & 0xff;
    this.b = n & 0xff;
    this.a = 255;
    return this;
  }
}

class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

const Layers = { Enum: { UI_2D: 1 << 25 } };

class UITransform {
  constructor() {
    this.node = null;
    this.width = 0;
    this.height = 0;
    this.anchorX = 0.5;
    this.anchorY = 0.5;
  }
  setContentSize(w, h) {
    this.width = w;
    this.height = h;
  }
  setAnchorPoint(x, y) {
    this.anchorX = x;
    this.anchorY = y;
  }
  get contentSize() {
    return { width: this.width, height: this.height };
  }
}

class Node extends CCObject {
  constructor(name = '') {
    super();
    ccStats.nodes++;
    this.name = name;
    this.children = [];
    this._parent = null;
    this.layer = 0;
    this._comps = [];
    this._pos = { x: 0, y: 0, z: 0 };
  }
  get parent() {
    return this._parent;
  }
  set parent(p) {
    if (this._parent) {
      const i = this._parent.children.indexOf(this);
      if (i >= 0) this._parent.children.splice(i, 1);
    }
    this._parent = p || null;
    if (p) p.children.push(this);
  }
  addComponent(C) {
    const comp = new C();
    comp.node = this;
    comp.enabled = true;
    this._comps.push(comp);
    return comp;
  }
  getComponent(C) {
    return this._comps.find((c) => c instanceof C) || null;
  }
  getChildByName(n) {
    return this.children.find((c) => c.name === n) || null;
  }
  removeAllChildren() {
    for (const c of this.children) c._parent = null;
    this.children.length = 0;
  }
  setPosition(x, y, z = 0) {
    this._pos = { x, y, z };
  }
  setSiblingIndex(i) {
    this._sibling = i;
  }
  get position() {
    return this._pos;
  }
}

class SpriteFrame {
  constructor() {
    this.insetTop = 0;
    this.insetRight = 0;
    this.insetBottom = 0;
    this.insetLeft = 0;
    this.texture = null;
  }
}

class Sprite {
  constructor() {
    this.type = Sprite.Type.SIMPLE;
    this.sizeMode = Sprite.SizeMode.TRIMMED;
    this.trim = true;
    this.spriteFrame = null;
  }
}
Sprite.Type = { SIMPLE: 0, SLICED: 1, TILED: 2 };
Sprite.SizeMode = { CUSTOM: 0, TRIMMED: 1, RAW: 2 };

class Graphics {
  constructor() {
    this.lineWidth = 1;
    this.fillColor = new Color();
    this.strokeColor = new Color();
    this.calls = { rect: 0, fill: 0, stroke: 0 };
  }
  rect() {
    this.calls.rect++;
  }
  fill() {
    this.calls.fill++;
  }
  stroke() {
    this.calls.stroke++;
  }
}

class Label {
  constructor() {
    this.string = '';
    this.fontSize = 12;
    this.lineHeight = 12;
    this.color = new Color();
    this.enableOutline = false;
    this.outlineColor = new Color();
    this.outlineWidth = 0;
    this.enableShadow = false;
    this.shadowColor = new Color();
    this.shadowOffset = new Vec2();
    this.shadowBlur = 0;
  }
}
Label.HorizontalAlign = { LEFT: 0, CENTER: 1, RIGHT: 2 };
Label.VerticalAlign = { TOP: 0, CENTER: 1, BOTTOM: 2 };
Label.Overflow = { NONE: 0, CLAMP: 1, SHRINK: 2, RESIZE_HEIGHT: 3 };

class Component {
  constructor() {
    this.node = null;
    this.enabled = true;
  }
}

class Director {
  constructor() {
    this.handlers = [];
  }
  on(ev, cb) {
    this.handlers.push({ ev, cb });
    return cb;
  }
  once(ev, cb) {
    this.handlers.push({ ev, cb, once: true });
    return cb;
  }
  getScene() {
    return null;
  }
}
Director.EVENT_AFTER_SCENE_LAUNCH = 'after-scene-launch';
Director.EVENT_AFTER_UPDATE = 'after-update';

const director = new Director();
const ccStub = {
  Color,
  Component,
  Director,
  Graphics,
  Label,
  Layers,
  Node,
  Sprite,
  SpriteFrame,
  UITransform,
  Vec2,
  _decorator: { ccclass: () => (target) => target, property: () => () => undefined },
  director,
};

// 只把警告收进数组，别刷屏
const realWarn = console.warn;
console.warn = (...args) => {
  ccStats.warn.push(args.map(String).join(' '));
};

/* ------------------------------------------------- transpill：源码 → CommonJS */
const ts = require(TS_DIR);
function loadTs(file, mocks) {
  const src = fs.readFileSync(file, 'utf8');
  const js = ts.transpileModule(src, {
    fileName: file,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      experimentalDecorators: true,
      useDefineForClassFields: false,
    },
  }).outputText;
  const mod = { exports: {} };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    throw new Error(`未预期的 import：「${id}」（来自 ${path.basename(file)}）`);
  };
  new Function('exports', 'require', 'module', '__filename', '__dirname', js)(
    mod.exports,
    localRequire,
    mod,
    file,
    path.dirname(file),
  );
  return mod.exports;
}

/* 资源加载桩：ok / fail / defer 三档，SkinLab 也靠它不碰真引擎 */
const loadState = { mode: 'ok', calls: [], pending: [] };
const artStub = {
  HALF_W: 375,
  HALF_H: 667,
  loadFrame(p, cb) {
    loadState.calls.push(p);
    if (loadState.mode === 'ok') cb(new SpriteFrame());
    else if (loadState.mode === 'fail') cb(null);
    else loadState.pending.push(cb);
  },
};

const theme = loadTs(path.join(SCRIPTS, 'view', 'theme.ts'), {});
const ui = loadTs(path.join(SCRIPTS, 'UiSkin.ts'), { cc: ccStub, './ArtLayer': artStub, './view/theme': theme });

/* ==================================================================== 断言 1 */
group('表完整性');
const keys = ui.skinKeys();
eq(keys.length, 26, 'skinKeys() 条目数');
const skinKeysObject = Object.keys(ui.SKINS);
eq(skinKeysObject.length, 26, 'SKINS 键数');
eq(new Set(skinKeysObject).size, 26, 'SKINS 键无重复');
eq(new Set(keys).size, 26, 'SKIN_ORDER 无重复');
eqArray([...keys].sort(), [...EXPECTED_KEYS].sort(), 'SKIN_ORDER 与期望 26 个 key 集合一致');
for (const key of EXPECTED_KEYS) {
  const spec = ui.SKINS[key];
  ok(!!spec, `SKINS 里有 ${key}`);
  if (!spec) continue;
  eq(spec.key, key, `${key}: key 字段`);
  eq(spec.src, `ui/${key}`, `${key}: src 指向 bundle res/ui`);
  eq(spec.src, `${ui.SKIN_DIR}/${key}`, `${key}: src 前缀 = SKIN_DIR`);
  eqArray(spec.size, EXPECTED[key].size, `${key}: 登记的源图尺寸`);
  eqArray(spec.insets, EXPECTED[key].insets, `${key}: insets`);
  ok(Number.isInteger(spec.size[0]) && Number.isInteger(spec.size[1]), `${key}: size 是整数`);
  ok(spec.insets.length === 4, `${key}: insets 是 4 元组`);
  ok(spec.insets.every((v) => Number.isInteger(v) && v >= 0), `${key}: insets 每项是非负整数`);
  if (EXPECTED[key].icon) {
    eq(!!spec.icon, true, `${key}: 标记为图标`);
    eqArray(spec.insets, [0, 0, 0, 0], `${key}: 图标不做九宫`);
  }
  if ('tile' in EXPECTED[key]) eq(!!spec.tile, EXPECTED[key].tile, `${key}: tile 标记`);
}

// 磁盘上的 26 张 PNG：数量、尺寸、与 web 原件逐字节一致
const onDisk = fs.readdirSync(RES_UI).filter((f) => f.toLowerCase().endsWith('.png'));
eq(onDisk.length, 26, 'res/ui 下 PNG 文件数');
eqArray(onDisk.map((f) => f.replace(/\.png$/, '')).sort(), [...EXPECTED_KEYS].sort(), 'res/ui 文件名集合');
let totalBytes = 0;
for (const key of EXPECTED_KEYS) {
  const p = path.join(RES_UI, `${key}.png`);
  const buf = fs.readFileSync(p);
  totalBytes += buf.length;
  // PNG IHDR：16..24 是宽高（大端 32 位）
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  eqArray([w, h], EXPECTED[key].size, `${key}.png 实际像素尺寸`);
  const src = path.join(
    ['slot', 'slot_off', 'cmd_on', 'cmd_off', 'port', 'msg', 'sep'].includes(key) ? WEB_BUI : WEB_ORIG,
    `${key}.png`,
  );
  ok(fs.existsSync(src), `${key}.png web 原件仍在（没被搬走）`);
  if (fs.existsSync(src)) ok(buf.equals(fs.readFileSync(src)), `${key}.png 与 web 原件逐字节一致`);
}
eq(totalBytes, EXPECTED_TOTAL_BYTES, '26 张总体积（B）');

// insets 必须每条 < 图宽/图高，且两边之和 < 边长（中间留得下一条缝）
group('insets 合法');
for (const key of EXPECTED_KEYS) {
  const spec = ui.SKINS[key];
  const [w, h] = spec.size;
  const [t, r, b, l] = spec.insets;
  ok(t < h, `${key}: 上 ${t} < 高 ${h}`);
  ok(b < h, `${key}: 下 ${b} < 高 ${h}`);
  ok(l < w, `${key}: 左 ${l} < 宽 ${w}`);
  ok(r < w, `${key}: 右 ${r} < 宽 ${w}`);
  if (spec.icon) continue;
  ok(l + r < w, `${key}: 左右之和 ${l + r} < 宽 ${w}（中间还有像素可拉）`);
  ok(t + b < h, `${key}: 上下之和 ${t + b} < 高 ${h}（中间还有像素可拉）`);
}

/* ==================================================================== 断言 2 */
group('九宫几何');
eqArray(ui.sliceInsetsOf('frame_panel', 750, 200), [8, 8, 8, 8], 'frame_panel@750×200 四边就是登记值');
eqArray(ui.sliceInsetsOf('frame_panel', 12, 12), [6, 6, 6, 6], 'frame_panel@12×12 角被等比缩到 6（= 12/16）');
eqArray(ui.sliceInsetsOf('cmd_on', 20, 100), [16, 10, 16, 10], 'cmd_on@20 宽：左右从 16 缩到 10（= 20/32）');
eqArray(ui.sliceInsetsOf('__nope__', 100, 100), [0, 0, 0, 0], '未知 key 的 insets 是 0（不抛）');
eqArray(ui.sliceInsetsOf('gem_gold', 40, 40), [0, 0, 0, 0], '图标 insets 恒为 0');

const sizes = [
  [750, 200], [375, 120], [300, 44], [111, 12], [84, 20], [40, 50],
  [34, 34], [20, 20], [12, 12], [1, 1],
];
let gridChecks = 0;
for (const key of EXPECTED_KEYS) {
  for (const [w, h] of sizes) {
    const insets = ui.sliceInsetsOf(key, w, h);
    const [t, r, b, l] = insets;
    ok(l + r <= w + 1e-9 && t + b <= h + 1e-9, `${key}@${w}×${h}: 四边不超界`);
    const rects = ui.nineGridRects(key, w, h);
    eq(rects.length, 9, `${key}@${w}×${h}: 9 块`);
    let area = 0;
    for (const rc of rects) {
      area += rc.w * rc.h;
      ok(rc.w >= -1e-9 && rc.h >= -1e-9, `${key}@${w}×${h}: 块尺寸非负`);
      ok(
        rc.x >= -1e-9 && rc.y >= -1e-9 && rc.x + rc.w <= w + 1e-9 && rc.y + rc.h <= h + 1e-9,
        `${key}@${w}×${h}: 块不越界 (${rc.x},${rc.y},${rc.w},${rc.h})`,
      );
    }
    near(area, w * h, `${key}@${w}×${h}: 9 块面积之和 = 面板面积`);
    // 每行三条宽度之和 = w；每列三条高度之和 = h
    for (let row = 0; row < 3; row++) {
      const sumW = rects[row * 3].w + rects[row * 3 + 1].w + rects[row * 3 + 2].w;
      near(sumW, w, `${key}@${w}×${h}: 第 ${row} 行宽度之和 = ${w}`);
    }
    for (let col = 0; col < 3; col++) {
      const sumH = rects[col].h + rects[3 + col].h + rects[6 + col].h;
      near(sumH, h, `${key}@${w}×${h}: 第 ${col} 列高度之和 = ${h}`);
    }
    gridChecks++;
  }
}
ok(gridChecks === 26 * sizes.length, `26 key × ${sizes.length} 档尺寸 = ${26 * sizes.length} 组九宫几何全跑过`);

// 750 宽面板的显式数字（报告里要贴）
const big = ui.nineGridRects('frame_panel', 750, 200);
eqArray(big.map((r) => Math.round(r.w)), [8, 734, 8, 8, 734, 8, 8, 734, 8], '750×200 面板三列宽 = 8/734/8');
eqArray(big.map((r) => Math.round(r.h)), [8, 8, 8, 184, 184, 184, 8, 8, 8], '750×200 面板三行高 = 8/184/8');
near(big.reduce((s, r) => s + r.w * r.h, 0), 750 * 200, '750×200 面板 9 块面积之和 = 150000');

eq(ui.isSliced('frame_panel'), true, 'isSliced(frame_panel)');
eq(ui.isSliced('bar_div'), false, 'isSliced(bar_div)：0 insets 走拉伸');
eq(ui.isSliced('gem_gold'), false, 'isSliced(gem_gold)：图标');
eq(ui.specOf('__nope__'), null, 'specOf 未知 key 返回 null');

/* ==================================================================== 断言 3 */
group('渲染层（桩）');
ui.clearSkinCache();
loadState.mode = 'ok';
loadState.calls.length = 0;

const spriteNode = ui.makeNineSlice(new Node('root'), 'frame_panel', 300, 120);
const sprite = spriteNode.getComponent(Sprite);
ok(!!sprite, 'makeNineSlice 挂了 Sprite');
eq(sprite.type, Sprite.Type.SLICED, 'frame_panel 用 SLICED（不是 TILED）');
eq(sprite.sizeMode, Sprite.SizeMode.CUSTOM, 'sizeMode = CUSTOM');
eq(sprite.trim, false, 'trim = false');
ok(!!sprite.spriteFrame, '加载成功后 spriteFrame 已赋值');
eqArray(
  [sprite.spriteFrame.insetTop, sprite.spriteFrame.insetRight, sprite.spriteFrame.insetBottom, sprite.spriteFrame.insetLeft],
  [8, 8, 8, 8],
  'insets 写回 SpriteFrame（8/8/8/8）',
);
const tf = spriteNode.getComponent(UITransform);
eq(tf.width, 300, '节点宽');
eq(tf.height, 120, '节点高');
eq(tf.anchorX, 0.5, '锚点 x = 0.5');
eq(spriteNode.layer, Layers.Enum.UI_2D, '节点 layer = UI_2D');

// 同 key 第二次：命中缓存，不再调 loadFrame
loadState.calls.length = 0;
ui.makeNineSlice(new Node('root'), 'frame_panel', 100, 50);
eq(loadState.calls.length, 0, '同 key 第二次不重复加载（帧缓存生效）');

// 图标 / 平铺 / 0 insets 的 type
const iconNode = ui.makeNineSlice(new Node('root'), 'gem_gold', 40, 40);
eq(iconNode.getComponent(Sprite).type, Sprite.Type.SIMPLE, '图标用 SIMPLE');
const sepNode = ui.makeNineSlice(new Node('root'), 'sep', 400, 12);
eq(sepNode.getComponent(Sprite).type, Sprite.Type.TILED, 'sep 用 TILED（web 就是 repeat-x）');
const barNode = ui.makeNineSlice(new Node('root'), 'bar_div', 400, 11);
eq(barNode.getComponent(Sprite).type, Sprite.Type.SLICED, 'bar_div 走 SLICED 拉伸（0 insets = 整图拉）');
eqArray(
  [barNode.getComponent(Sprite).spriteFrame.insetTop, barNode.getComponent(Sprite).spriteFrame.insetLeft],
  [0, 0],
  'bar_div insets 全 0',
);

// 降级：加载失败
ui.clearSkinCache();
loadState.mode = 'fail';
ccStats.warn.length = 0;
let fallbackNodes = 0;
for (const key of EXPECTED_KEYS) {
  const node = ui.makeNineSlice(new Node('root'), key, 120, 40);
  const g = node.getComponent(Graphics);
  const sp = node.getComponent(Sprite);
  ok(!!g, `${key}: 加载失败时挂了 Graphics 描边`);
  ok(sp && sp.spriteFrame === null, `${key}: 加载失败时没有半张图`);
  if (g) {
    eq(g.calls.fill, 1, `${key}: 降级画了底`);
    eq(g.calls.stroke, 1, `${key}: 降级描了边`);
    ok(g.lineWidth === 1, `${key}: 降级描边 1px`);
  }
  fallbackNodes++;
}
eq(fallbackNodes, 26, '26 个 key 全走一遍降级');
ok(ccStats.warn.length > 0, '降级会 console.warn（不是静默）');
ok(
  ccStats.warn.every((w) => w.includes('[UiSkin]')),
  'warn 前缀统一是 [UiSkin]',
);

// 降级：未知 key（同一个 key 只 warn 一次）
ccStats.warn.length = 0;
const unknown = ui.makeNineSlice(new Node('root'), 'totally_unknown', 60, 30);
ok(!!unknown.getComponent(Graphics), '未知 key 也降级成 Graphics 描边');
ok(!!unknown.getComponent(Sprite), '未知 key 仍有 Sprite（type 随便，不崩）');
eq(unknown.getComponent(Sprite).spriteFrame, null, '未知 key 没有图');
ui.makeNineSlice(new Node('root'), 'totally_unknown', 60, 30);
eq(ccStats.warn.filter((w) => w.includes('totally_unknown')).length, 1, '同一个未知 key 只 warn 一次');

// 异步回来时节点已销毁：不抛、不写已销毁的组件
ui.clearSkinCache();
loadState.mode = 'defer';
loadState.pending.length = 0;
const doomed = ui.makeNineSlice(new Node('root'), 'slot', 60, 60);
eq(loadState.pending.length, 1, 'defer：加载挂了 1 个回调');
doomed.isValid = false;
noThrow(() => loadState.pending.forEach((cb) => cb(new SpriteFrame())), '节点销毁后回调不抛');
eq(doomed.getComponent(Sprite).spriteFrame, null, '节点销毁后不再写 spriteFrame');
loadState.mode = 'ok';

// makeBtn
ui.clearSkinCache();
const btn = ui.makeBtn(new Node('root'), 'plate_btn', '確定', 200, 52);
const btnSprite = btn.getComponent(Sprite);
eq(btnSprite.type, Sprite.Type.SLICED, '按钮底用 SLICED');
const label = btn.children.find((c) => c.getComponent(Label))?.getComponent(Label);
ok(!!label, '按钮里有 Label');
if (label) {
  eq(label.string, '確定', 'Label 文案');
  eq(label.enableOutline, true, 'Label 开了描边');
  eq(label.outlineWidth, 1, '描边 1px');
  eq(label.enableShadow, true, 'Label 开了投影');
  ok(label.shadowOffset.y === -1, '投影往下 1px');
  ok(label.fontSize >= 12 && label.fontSize <= 24, `字号夹在 12..24（实际 ${label.fontSize}）`);
  ok(label.enableOutline === true && label.outlineColor.a === 235, '描边色深色半透明');
}
const tall = ui.makeBtn(new Node('root'), 'plate_btn', '大', 300, 96);
ok(tall.children.find((c) => c.getComponent(Label)).getComponent(Label).fontSize === 24, '96 高按钮字号封顶 24');

// makePanel：深底 + 九宫框
const panel = ui.makePanel(new Node('root'), 'frame_panel', 340, 200);
const pg = panel.getComponent(Graphics);
ok(!!pg, '面板有 Graphics 深底');
eq(pg.calls.fill, 1, '面板深底填了一次');
eq(pg.fillColor.a, ui.PANEL_FILL_ALPHA, '面板底不透明度 = .72');
const frameChild = panel.children.find((c) => c.name === 'Frame_frame_panel');
ok(!!frameChild, '面板里有 Frame_frame_panel 子节点');
if (frameChild) eq(frameChild.getComponent(Sprite).type, Sprite.Type.SLICED, '面板框是 SLICED');
eq(panel.getComponent(UITransform).width, 340, '面板宽');
const noFill = ui.makePanel(new Node('root'), 'frame_panel', 340, 200, { fill: false });
eq(noFill.getComponent(Graphics), null, 'fill:false 时不画深底');

// placeDesign：口径 = 设计 750×1334 左上原点
const placed = new Node('p');
ui.placeDesign(placed, 20, 88, 340, 200);
near(placed.position.x, 20 + 170 - 375, 'placeDesign x = 20+170-375 = -185');
near(placed.position.y, 667 - (88 + 100), 'placeDesign y = 667-188 = 479');
near(placed.position.z, 0, 'placeDesign z = 0');

// SkinLab 模块：import 不抛、没场景时不挂载
group('SkinLab 模块');
noThrow(() => {
  const lab = loadTs(path.join(SCRIPTS, 'SkinLab.ts'), {
    cc: ccStub,
    './view/theme': theme,
    './UiSkin': ui,
  });
  eq(typeof lab.SkinLab, 'function', 'SkinLab 是 ccclass');
  eq(typeof lab.mountSkinLab, 'function', '导出 mountSkinLab()');
  eq(lab.mountSkinLab(), false, '没有场景时 mountSkinLab 返回 false（不抛）');
}, 'SkinLab.ts 可被 import 且无副作用崩溃');
ok(director.handlers.some((h) => h.ev === Director.EVENT_AFTER_SCENE_LAUNCH), 'SkinLab 注册了 AFTER_SCENE_LAUNCH 钩子');

/* ====================================================================== 汇报 */
console.warn = realWarn;
const color = process.stdout.isTTY;
const green = (s) => (color ? `\u001b[32m${s}\u001b[0m` : s);
const red = (s) => (color ? `\u001b[31m${s}\u001b[0m` : s);

console.log('\n=== skin_assert：Cocos 九宫皮肤 ===');
console.log(`源码：${path.relative(REPO, path.join(SCRIPTS, 'UiSkin.ts'))}`);
for (const g of groups) {
  const mark = g.fails === 0 ? green('PASS') : red('FAIL');
  console.log(`  ${mark}  ${g.name.padEnd(14, ' ')} ${String(g.pass).padStart(4)} 条`);
}
if (fails.length > 0) {
  console.log(red('\n失败明细：'));
  for (const f of fails) console.log(`  - ${f}`);
}

// 报告用的 insets 表
console.log('\n| key | 源图 | insets 上右下左 | web slice / border | 类型 |');
console.log('|---|---|---|---|---|');
for (const key of keys) {
  const s = ui.SKINS[key];
  const kind = s.icon ? '图标（SIMPLE）' : s.tile ? '横向平铺（TILED）' : s.insets[0] === 0 ? '整图拉伸' : '九宫（SLICED）';
  const web = s.webBorder === undefined ? '—' : `${s.insets[0]} / ${s.webBorder}px`;
  console.log(
    `| \`${key}\` | ${s.size[0]}×${s.size[1]} | ${s.insets.join(', ')} | ${web} | ${kind} |`,
  );
}

console.log(`\n九宫断言跑了 ${gridChecks} 组（26 key × ${sizes.length} 档尺寸）`);
if (fails.length === 0) {
  console.log(green(`\nALL PASS · 断言 ${pass} 条`));
  process.exit(0);
} else {
  console.log(red(`\n${fails.length} 条失败 / 共 ${pass + fails.length} 条`));
  process.exit(1);
}
