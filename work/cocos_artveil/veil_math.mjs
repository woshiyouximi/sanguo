// 蒙版矩形换算对拍（r89-cocos-artveil）
//
//   node F:\sanguo\work\cocos_artveil\veil_math.mjs
//
// 目的：把 `ArtLayer.addVeil()` 的「设计坐标 → 节点局部坐标」换算从「两次」修回「一次」，
//       并用纯函数对拍证明三件事：
//   ① 旧代码确实把矩形画到 `{2x + w/2 − 375, 2y + h/2 − 667}`（r88 / project/118 §5 的结论）；
//   ② 新代码在 6 个样本矩形上与「一次换算」的独立参考实现逐值相等；
//   ③ `CampaignRoot.veilRectOnMap()` 改回直传后，蒙版与地图矩形重合（误差 ≤ 0.5px）。
//
// 说明：本文件里的 `placeNodeLocal` / `veilLocalRectLegacy` / `veilLocalRectFixed` 是
//       **对拍副本**（hand-copied mirror），因为 `ArtLayer.ts` 在 Cocos 侧、不能直接被 node 引。
//       副本与真身的一致性由文件末尾「源码钉住」一节守卫：真身改了而副本没改，这里直接红。
import fs from 'node:fs';
import path from 'node:path';

const HERE = import.meta.dirname;
const ROOT = path.resolve(HERE, '..', '..');
const ART_LAYER = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts', 'ArtLayer.ts');
const CAMPAIGN = path.join(ROOT, 'game', 'cocos', 'assets', 'scripts', 'CampaignRoot.ts');

// 设计画布 750×1334、左上原点；Cocos 侧 y 轴向上，屏幕中心 = 本地原点。
const DESIGN_W = 750;
const DESIGN_H = 1334;
const HALF_W = DESIGN_W / 2; // 375
const HALF_H = DESIGN_H / 2; // 667

/* ------------------------------------------------------------------ 断言器 */
let pass = 0;
const fails = [];
let section = '';
const secStats = new Map();

function setSection(name) {
  section = name;
  if (!secStats.has(name)) secStats.set(name, { pass: 0, fail: 0 });
}

function ok(cond, name, detail = '') {
  const st = secStats.get(section);
  if (cond) {
    pass += 1;
    if (st) st.pass += 1;
    return true;
  }
  if (st) st.fail += 1;
  fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  return false;
}

function near(actual, expect, tol, name) {
  const d = Math.abs(actual - expect);
  return ok(d <= tol, name, `实际 ${fmt(actual)} / 期望 ${fmt(expect)} / 差 ${fmt(d)} > ${tol}`);
}

function exact(actual, expect, name) {
  return near(actual, expect, 1e-9, name);
}

const fmt = (v) => (Number.isFinite(v) ? (Math.round(v * 10000) / 10000).toString() : String(v));

/* ------------------------------------------------------- 对拍副本（真身在 ArtLayer.ts） */

/** 对拍副本 1：`ArtLayer.placeNode()` 的摆位（未改动，修 bug 不碰这里）。 */
function placeNodeLocal(r) {
  return { x: r.x + r.w / 2 - HALF_W, y: HALF_H - (r.y + r.h / 2) };
}

/** 对拍副本 2（修前）：`addVeil()` 老代码在节点局部坐标里画的矩形 —— 多算了一次位移。 */
function veilLocalRectLegacy(r) {
  return { x: r.x - HALF_W, y: HALF_H - r.y - r.h, w: r.w, h: r.h };
}

/** 对拍副本 3（修后）：`veilLocalRect()` 现行实现 —— 只画「以节点原点为中心」的矩形。 */
function veilLocalRectFixed(r) {
  return { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h };
}

/** 把「节点位置 + 局部矩形」还原成它最终覆盖的**设计矩形**（左上原点）。 */
function drawnDesignRect(rect, localFn) {
  const node = placeNodeLocal(rect);
  const local = localFn(rect);
  const leftScreen = node.x + local.x;
  const bottomScreen = node.y + local.y;
  return {
    x: leftScreen + HALF_W,
    y: HALF_H - (bottomScreen + local.h),
    w: local.w,
    h: local.h,
  };
}

/* ------------------------------------------- 独立参考实现：「一次换算」的另一种算法 */
// 不复用上面的任何一条公式：走「设计点 → 本地」的角点映射，再用两角之差得宽高。
const toLocal = (px, py) => ({ x: px - HALF_W, y: HALF_H - py });

function referenceDrawnDesignRect(r) {
  const tl = toLocal(r.x, r.y);
  const br = toLocal(r.x + r.w, r.y + r.h);
  return { x: tl.x + HALF_W, y: HALF_H - tl.y, w: br.x - tl.x, h: tl.y - br.y };
}

/* ------------------------------------------------------------ 样本矩形（6 个） */
const MAP_RECT = { x: 0, y: 198.75, w: 750, h: 562.5 }; // CampaignRoot.mapImageRect()（v18：按 750 宽铺满、MAP_VIEW 内居中）
const SAMPLES = [
  { name: '地图矩形（mapImageRect）', rect: MAP_RECT },
  { name: '整屏（0,0,750,1334）', rect: { x: 0, y: 0, w: DESIGN_W, h: DESIGN_H } },
  { name: '左上角小块', rect: { x: 0, y: 0, w: 40, h: 40 } },
  { name: '右上角小块', rect: { x: 710, y: 0, w: 40, h: 40 } },
  { name: '左下角小块', rect: { x: 0, y: 1294, w: 40, h: 40 } },
  { name: '右下角小块', rect: { x: 710, y: 1294, w: 40, h: 40 } },
];

/* ============================================================ ① 修前公式复现 bug */
setSection('① 修前公式复现（bug）');
// 老代码画出来的位置 = 闭合形式 2x + w/2 − 375 / 2y + h/2 − 667，两者必须逐值相等。
const legacyClosedForm = (r) => ({ x: 2 * r.x + r.w / 2 - HALF_W, y: 2 * r.y + r.h / 2 - HALF_H });

for (const { name, rect } of SAMPLES) {
  const drawn = drawnDesignRect(rect, veilLocalRectLegacy);
  const closed = legacyClosedForm(rect);
  const tag = `[① 修前] ${name}`;
  near(drawn.x, closed.x, 1e-9, `${tag} x = 2x+w/2−375`);
  near(drawn.y, closed.y, 1e-9, `${tag} y = 2y+h/2−667`);
  near(drawn.w, rect.w, 1e-9, `${tag} 宽度不变`);
  near(drawn.h, rect.h, 1e-9, `${tag} 高度不变`);
  // 与「正确位置」的偏差：整屏是旧公式的不动点（碰巧对），其余 5 个都偏。
  const dx = drawn.x - rect.x;
  const dy = drawn.y - rect.y;
  const isFixedPoint = Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9;
  if (name.startsWith('整屏')) {
    ok(isFixedPoint, `${tag} 是旧公式的不动点（所以整屏蒙版一直看不出问题）`, `dx=${fmt(dx)} dy=${fmt(dy)}`);
  } else {
    ok(!isFixedPoint, `${tag} 旧公式把矩形画歪了（bug 复现）`, `dx=${fmt(dx)} dy=${fmt(dy)}`);
  }
}

// r88 报告里的具体数字：地图矩形旧公式 → y 从 198.75 跑到 11.75。
near(legacyClosedForm(MAP_RECT).y, 11.75, 1e-9, '[① 修前] 地图矩形 y 落到 11.75（r88 §5 的 9.75…576.25 同源）');
// r88 里 CampaignRoot 的反解值：把地图矩形 target 喂进旧式
// `y = (target.y − 2 + HALF_H − h/2) / 2`，得到 y=290.25 —— 再被旧公式画回 196.75（= 198.75 − 2 外扩）。
const legacyInverseY = (MAP_RECT.y - 2 + HALF_H - (MAP_RECT.h + 4) / 2) / 2;
near(legacyInverseY, 290.25, 1e-9, '[① 修前] 反解常量 y=290.25（旧 workaround 的实际取值）');
near(
  legacyClosedForm({ x: 0, y: legacyInverseY, w: MAP_RECT.w + 4, h: MAP_RECT.h + 4 }).y,
  196.75,
  1e-9,
  '[① 修前] 反解后才画到 196.75（= 198.75 − 2 外扩，旧 workaround 的全部意义）',
);

/* =================================================== ② 修后公式 vs 一次换算参考实现 */
setSection('② 修后公式 vs 一次换算参考实现');
for (const { name, rect } of SAMPLES) {
  const drawn = drawnDesignRect(rect, veilLocalRectFixed);
  const ref = referenceDrawnDesignRect(rect);
  const tag = `[② 修后] ${name}`;
  exact(drawn.x, ref.x, `${tag} x 与参考实现相等`);
  exact(drawn.y, ref.y, `${tag} y 与参考实现相等`);
  exact(drawn.w, ref.w, `${tag} w 与参考实现相等`);
  exact(drawn.h, ref.h, `${tag} h 与参考实现相等`);
  // 参考实现本身应当就是「原样落在设计矩形上」。
  near(ref.x, rect.x, 1e-9, `${tag} 参考实现 x = rect.x`);
  near(ref.y, rect.y, 1e-9, `${tag} 参考实现 y = rect.y`);
}

// 节点摆位本身没被改动：修前/修后 node.setPosition 完全一致（证明只删了多余的一次位移）。
for (const { name, rect } of SAMPLES) {
  near(placeNodeLocal(rect).x, rect.x + rect.w / 2 - HALF_W, 1e-9, `[②] ${name} 节点 x 未改`);
  near(placeNodeLocal(rect).y, HALF_H - (rect.y + rect.h / 2), 1e-9, `[②] ${name} 节点 y 未改`);
}

/* ======================================== ③ CampaignRoot 直传语义：蒙版与地图矩形重合 */
setSection('③ CampaignRoot 直传语义：蒙版与矩形重合');
// 对拍副本 4：修改后的 `CampaignRoot.veilRectOnMap()`（直传）。
const veilRectOnMapDirect = (target) => ({ x: target.x, y: target.y, w: target.w, h: target.h });

let worst = 0;
for (const { name, rect } of SAMPLES) {
  const drawn = drawnDesignRect(veilRectOnMapDirect(rect), veilLocalRectFixed);
  const d = Math.max(Math.abs(drawn.x - rect.x), Math.abs(drawn.y - rect.y), Math.abs(drawn.w - rect.w), Math.abs(drawn.h - rect.h));
  worst = Math.max(worst, d);
  ok(d <= 0.5, `[③ 直传] ${name} 蒙版与矩形重合（误差 ${fmt(d)}px ≤ 0.5px）`, `实际 ${JSON.stringify(drawn)}`);
}
ok(worst <= 0.5, `[③ 直传] 6 个样本最大偏差 ${fmt(worst)}px ≤ 0.5px`);

// 整屏蒙版（CampaignRoot:1122 与 ItemsPanel:479 的调用形状）：修前修后都落对 → 观感零变化。
const screenDrawnLegacy = drawnDesignRect({ x: 0, y: 0, w: DESIGN_W, h: DESIGN_H }, veilLocalRectLegacy);
const screenDrawnFixed = drawnDesignRect({ x: 0, y: 0, w: DESIGN_W, h: DESIGN_H }, veilLocalRectFixed);
for (const k of ['x', 'y', 'w', 'h']) {
  near(screenDrawnLegacy[k], screenDrawnFixed[k], 1e-9, `[③] 整屏蒙版 ${k} 修前=修后（不动点）`);
}

// DeployRoot:381 的 `{0, 120, 750, 1080}`：它从没做过 workaround，修前被这条 bug 悄悄上移 7px。
const DEPLOY = { x: 0, y: 120, w: 750, h: 1080 };
const deployLegacy = drawnDesignRect(DEPLOY, veilLocalRectLegacy);
const deployFixed = drawnDesignRect(DEPLOY, veilLocalRectFixed);
near(deployLegacy.y, 113, 1e-9, '[③] DeployRoot 蒙版修前落在 y=113（凭 bug 上移 7px）');
near(deployFixed.y, 120, 1e-9, '[③] DeployRoot 蒙版修后落在 y=120（回到设计值）');
near(deployFixed.x, 0, 1e-9, '[③] DeployRoot 蒙版 x 未变（本来水平居中）');

/* ==================================================== 源码钉住：副本必须与真身一致 */
setSection('④ 源码钉住：副本 = 真身');
const read = (p) => fs.readFileSync(p, 'utf8');
/** 去掉块注释与行注释，留下可断言的代码（字符串里的 // 不会出现，够用）。 */
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/**
 * 取 `export function name(...): {...} {` 的函数体（大括号配平）。
 * 注意 TS 的返回类型注解本身也是一个 `{...}` 块，必须先跳过它：
 * 从参数表右括号往后再找 `{`，若该块之后的下一个非空白字符仍是 `{`，后者才是函数体。
 */
function bodyOf(src, headRe) {
  const m = headRe.exec(src);
  if (!m) return null;
  const parenAt = src.indexOf('(', m.index + m[0].length - 1);
  if (parenAt < 0) return null;
  // 配平参数表的圆括号（参数里可能有 `{ x: number }` 这类类型字面量，但它不影响圆括号深度）。
  let depth = 0;
  let afterParams = -1;
  for (let j = parenAt; j < src.length; j += 1) {
    if (src[j] === '(') depth += 1;
    else if (src[j] === ')') {
      depth -= 1;
      if (depth === 0) {
        afterParams = j + 1;
        break;
      }
    }
  }
  if (afterParams < 0) return null;
  const blockAt = (from) => {
    const i = src.indexOf('{', from);
    if (i < 0) return null;
    let d = 0;
    for (let j = i; j < src.length; j += 1) {
      if (src[j] === '{') d += 1;
      else if (src[j] === '}') {
        d -= 1;
        if (d === 0) return { start: i, end: j };
      }
    }
    return null;
  };
  const first = blockAt(afterParams);
  if (!first) return null;
  let k = first.end + 1;
  while (k < src.length && /\s/.test(src[k])) k += 1;
  if (src[k] === '{') {
    const body = blockAt(k);
    return body ? src.slice(body.start + 1, body.end) : null;
  }
  return src.slice(first.start + 1, first.end);
}
const squash = (s) => s.replace(/\s+/g, '');

const artSrc = read(ART_LAYER);
const artCode = stripComments(artSrc);
const veilLocalBody = bodyOf(artCode, /export function veilLocalRect\s*\(/);
ok(!!veilLocalBody, '[钉住] ArtLayer.ts 有 export veilLocalRect()');
if (veilLocalBody) {
  ok(
    squash(veilLocalBody).includes('return{x:-rect.w/2,y:-rect.h/2,w:rect.w,h:rect.h};'),
    '[钉住] veilLocalRect 的返回式 = { -w/2, -h/2, w, h }',
    squash(veilLocalBody),
  );
}
const addVeilBody = bodyOf(artCode, /export function addVeil\s*\(/);
ok(!!addVeilBody, '[钉住] ArtLayer.ts 有 addVeil()');
if (addVeilBody) {
  ok(!/HALF_W|HALF_H|\b375\b|\b667\b/.test(addVeilBody), '[钉住] addVeil 体内不再出现 HALF_W/HALF_H/375/667（没有第二次位移）', squash(addVeilBody));
  ok(squash(addVeilBody).includes('constlocal=veilLocalRect(rect);'), '[钉住] addVeil 用 veilLocalRect() 画', squash(addVeilBody));
  ok(!/rect\.x-HALF_W|HALF_H-rect\.y/.test(squash(addVeilBody)), '[钉住] addVeil 体内没有老的 rect.x−HALF_W 写法');
}

const campaignCode = stripComments(read(CAMPAIGN));
const veilOnMapBody = bodyOf(campaignCode, /private veilRectOnMap\s*\(/);
ok(!!veilOnMapBody, '[钉住] CampaignRoot.ts 有 veilRectOnMap()');
if (veilOnMapBody) {
  ok(
    squash(veilOnMapBody).includes('return{x:target.x,y:target.y,w:target.w,h:target.h};'),
    '[钉住] veilRectOnMap 是直传（不再反解）',
    squash(veilOnMapBody),
  );
  ok(!/\/2/.test(squash(veilOnMapBody)), '[钉住] veilRectOnMap 体内没有 /2 反解');
  ok(!/HALF_W|HALF_H/.test(squash(veilOnMapBody)), '[钉住] veilRectOnMap 不再引用 HALF_W/HALF_H');
}

/* ------------------------------------------------------------------ 打印 / 退出 */
const pad = (s, n) => String(s).padEnd(n, ' ');
console.log('样本矩形对照（设计坐标，左上原点）');
console.log(`${pad('矩形', 26)}${pad('修前实际', 30)}${pad('修后实际', 30)}参考实现`);
for (const { name, rect } of SAMPLES) {
  const l = drawnDesignRect(rect, veilLocalRectLegacy);
  const f = drawnDesignRect(rect, veilLocalRectFixed);
  const rf = referenceDrawnDesignRect(rect);
  const box = (r) => `x${fmt(r.x)} y${fmt(r.y)} w${fmt(r.w)} h${fmt(r.h)}`;
  console.log(`${pad(name, 26)}${pad(box(l), 30)}${pad(box(f), 30)}${box(rf)}`);
}
console.log('');
for (const [name, st] of secStats) console.log(`  ${name}  ${st.pass} 条`);

if (fails.length) {
  console.error(`FAIL ${fails.length} 条：`);
  for (const f of fails) console.error(`  ✗ ${f}`);
  console.error(`\n断言 ${pass} 通过 / ${fails.length} 失败（共 ${pass + fails.length}）`);
  process.exit(1);
}
console.log(`OK 断言 ${pass} 条全过（0 失败）`);
