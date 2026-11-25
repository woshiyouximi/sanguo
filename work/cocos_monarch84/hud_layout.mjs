#!/usr/bin/env node
/**
 * 大地圖頁頭版式的幾何自檢（project/106 §5「UI 結構」的数字依据）。
 *
 * 為什麼要腳本：`makeLabel(text, cx, cy, width, …)` 的 `cx` 對 `left/right` 是**框的邊**而不是
 * 中心（見 `CampaignRoot.makeLabel` 裡的 `centerX` 換算），肉眼讀數字很容易把 375 當中心寫成
 * 左邊界，結果整段文字偏出半屏、或者壓到旁邊的按鈕底下。這裡直接從 `CampaignRoot.ts` 把
 * 真實的常數與 `makeLabel(...)` 參數抽出來算矩形，斷言：
 *
 *   1. 頁頭所有元素都在 750 寬之內（不出界）；
 *   2. 第二列三塊（君主 / 勢力·城·戰績 / 月份）兩兩不相交；
 *   3. 兩顆按鈕與標題、與第二列都不相交（含 6px 安全距）；
 *   4. 「君主 X」的命中區把君主名整段包住；
 *   5. 按鈕之間 16px、右邊界 14px、標題與按鈕之間 ≥ 20px。
 *
 * 用**字身矩形**（`cy ± fontSize/2`）而不是 `makeLabel` 的 `fontSize*3` 節點框：
 * 那個框是留給 SHRINK/換行的餘量，兩列之間本來就會垂直重疊，拿它判相交會誤報。
 *
 * 用法：`node work/cocos_monarch84/hud_layout.mjs`   0 = 通過
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(HERE, '..', '..', 'game', 'cocos', 'assets', 'scripts', 'CampaignRoot.ts');
const text = readFileSync(SRC, 'utf8');

const fail = [];
function check(ok, label, detail) {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) fail.push(`${label}${detail ? ` — ${detail}` : ''}`);
}

/* --- §1 常數 ----------------------------------------------------------------- */

function rectConst(name) {
  const m = text.match(new RegExp(`const ${name} = \\{ x: (-?[\\d.]+), y: (-?[\\d.]+), w: (-?[\\d.]+), h: (-?[\\d.]+) \\}`));
  if (!m) throw new Error(`找不到常數 ${name}（锚点文本变了？）`);
  return { x: +m[1], y: +m[2], w: +m[3], h: +m[4] };
}

const ITEMS = rectConst('ITEMS_BUTTON');
const FORCES = rectConst('FORCES_BUTTON');
const MONARCH_HIT = rectConst('MONARCH_HIT');

/* --- §2 makeLabel 抽樣 --------------------------------------------------------- */

/** 把 `this.labelX = this.makeLabel(<args>);` 的參數抽出來，並按 makeLabel 的語義換算成矩形 */
function labelOf(field) {
  const re = new RegExp(`this\\.${field} = this\\.makeLabel\\(([^;]*?)\\);`, 's');
  const m = text.match(re);
  if (!m) throw new Error(`找不到 ${field} 的 makeLabel 调用`);
  const args = m[1].replace(/\s+/g, ' ').trim();
  const parts = args.match(/^'([^']*)', (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), (-?[\d.]+), [\w.\[\]']+, '(\w+)'$/);
  if (!parts) throw new Error(`${field} 的 makeLabel 参数形状变了：${args}`);
  const [, content, cxRaw, cyRaw, wRaw, fsRaw, align] = parts;
  const cx = +cxRaw;
  const cy = +cyRaw;
  const w = +wRaw;
  const fs = +fsRaw;
  const x = align === 'left' ? cx : align === 'right' ? cx - w : cx - w / 2;
  return { field, content, align, fontSize: fs, x, y: cy - fs / 2, w, h: fs, right: x + w };
}

const labels = ['labelTitle', 'labelMonth', 'labelMonarch', 'labelStats'].map(labelOf);
const byField = Object.fromEntries(labels.map((l) => [l.field, l]));

/* --- §3 斷言 ------------------------------------------------------------------ */

const DESIGN_W = 750;
console.log(`頁頭元素（字身矩形，設計座標左上原點）：`);
for (const l of labels) {
  console.log(`  ${l.field.padEnd(14)} [${l.x.toFixed(1)}, ${l.right.toFixed(1)}] × [${l.y.toFixed(1)}, ${(l.y + l.h).toFixed(1)}]  ${l.fontSize}px ${l.align.padEnd(6)} 「${l.content || '(空)'}」`);
}
for (const [name, r] of [['FORCES_BUTTON', FORCES], ['ITEMS_BUTTON', ITEMS], ['MONARCH_HIT', MONARCH_HIT]]) {
  console.log(`  ${name.padEnd(14)} [${r.x}, ${r.x + r.w}] × [${r.y}, ${r.y + r.h}]`);
}

check(labels.every((l) => l.x >= 0 && l.right <= DESIGN_W), '頁頭文字都在 750 寬內');
check([FORCES, ITEMS].every((r) => r.x >= 0 && r.x + r.w <= DESIGN_W), '兩顆按鈕都在 750 寬內');

/** 相交判定：只在「x 與 y 都重疊」時才算撞 */
function overlap(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

const row2 = ['labelMonarch', 'labelStats', 'labelMonth'].map((f) => byField[f]);
let row2Bad = 0;
for (let i = 0; i < row2.length; i += 1) {
  for (let j = i + 1; j < row2.length; j += 1) {
    if (overlap(row2[i], row2[j])) {
      row2Bad += 1;
      console.log(`    ✗ ${row2[i].field} × ${row2[j].field} 相交`);
    }
  }
}
check(row2Bad === 0, '第二列三塊兩兩不相交');

let btnBad = 0;
for (const [name, r] of [['FORCES_BUTTON', FORCES], ['ITEMS_BUTTON', ITEMS]]) {
  for (const l of labels) {
    // 6px 安全距：文字墨跡到按鈕邊框之間至少留 6px
    const padded = { x: r.x - 6, y: r.y - 6, w: r.w + 12, h: r.h + 12 };
    if (overlap(padded, l)) {
      btnBad += 1;
      console.log(`    ✗ ${name} 与 ${l.field} 距离不足 6px`);
    }
  }
}
check(btnBad === 0, '兩顆按鈕與頁頭文字保持 ≥6px 安全距');

check(
  MONARCH_HIT.x <= byField.labelMonarch.x &&
    MONARCH_HIT.x + MONARCH_HIT.w >= byField.labelMonarch.right &&
    MONARCH_HIT.y <= byField.labelMonarch.y &&
    MONARCH_HIT.y + MONARCH_HIT.h >= byField.labelMonarch.y + byField.labelMonarch.h,
  'MONARCH_HIT 把君主名整段包住',
);

const gapButtons = ITEMS.x - (FORCES.x + FORCES.w);
check(gapButtons === 16, '勢力/物品兩顆按鈕間距 16px', `${gapButtons}px`);
check(DESIGN_W - (ITEMS.x + ITEMS.w) === 14, '物品按鈕右邊界 14px', `${DESIGN_W - (ITEMS.x + ITEMS.w)}px`);
const gapTitle = FORCES.x - byField.labelTitle.right;
check(gapTitle >= 20, '標題與勢力按鈕之間 ≥20px', `${gapTitle}px`);
check(byField.labelMonarch.x === MONARCH_HIT.x + 6, '君主名左邊界 = 命中區左界 +6px', `${byField.labelMonarch.x}`);
check(FORCES.y + FORCES.h < byField.labelStats.y, '按鈕底邊在第二列字身之上', `${FORCES.y + FORCES.h} < ${byField.labelStats.y.toFixed(1)}`);

console.log('');
if (fail.length > 0) {
  console.error(`✗ ${fail.length} 项版式自检未通过`);
  process.exit(1);
}
console.log('✓ 頁頭版式自檢全部通過（0 出界 / 0 相交）');
