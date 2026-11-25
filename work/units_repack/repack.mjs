#!/usr/bin/env node
/**
 * 士兵图集重打包（`work/units_repack/repack.mjs`）
 * ============================================================================
 * 输入：`game/web/anim/units.json` + `units_00.png`（原作 `SHAPE\FORCE` 图集，
 *       1 页 1024×3973 —— 高度超微信小游戏 2048 纹理上限，包会裁页）。
 * 输出：重排成**每页 ≤ `--max-page`（默认 2048）×2048** 的多页图集：
 *       `pages[]` 每条一页（`file/w/h/sprites`），每帧带 `p`（页码）；
 *       帧名 / 每帧 `h`（画布高）/ `w` / `groups.*` 全部原样保留，一个字节都不改语义。
 *
 * 排布算法（shelf packing，高度优先）：
 *   1. 所有帧按 `h` 降序（同高按源顺序）排；
 *   2. 每行放 `floor((maxPage + padding) / (canvas_w + padding))` = 26 帧（2048 宽），
 *      行高 = 本行最大 `h` + `padding`（2px 间隙，与原图集同款，间隙全透明）；
 *   3. 一页装不下就另起一页 —— **但绝不让一个兵种组跨页**：因为 web 的
 *      `battleView.ts:643` 把「一组帧」和**一张** `img` 一起交给 `pushSpriteFrames`，
 *      跨页会拿错贴图。所以：
 *        · 先试「全部帧装进一页」（全局排序，混组，最省高度）；
 *        · 装不下才退回「按组整页切分」，每页内部再全局排序。
 *      本资产 572 帧全局排下来只要 1730px 高（≤2048），于是**一页就够**。
 *
 * 像素：不缩放、不重采样。Python(PIL) 按原图调色板下标整块搬运
 *       （index 直接 copy → 像素值逐字节相同），再由 `pixels.py` 对每一帧
 *       重排前后各算一次 RGBA 的 SHA256，必须 572/572 相同；另外查两件事：
 *       ① 新页里帧矩形之外的像素必须全透明（没有搬歪/漏搬）；
 *       ② 帧矩形互不重叠、都在页内。
 *
 * 用法（`F:\sanguo` 下）：
 *   node work/units_repack/repack.mjs                 # 只产出到 work/units_repack/out/
 *   node work/units_repack/repack.mjs --install       # 校验通过后写进 web + cocos
 *   node work/units_repack/repack.mjs --split-at 7 --out work/units_repack/_selftest
 *                                                     # 2 页模式自测（组 0-6 一页 / 7-12 一页）
 *   node work/units_repack/repack.mjs --src work/units_repack/src --install
 *                                                     # 从归档的原图重跑（web 已被覆盖时用）
 *
 * 只写：`work/units_repack/**`、`game/web/anim/units*`、`game/cocos/assets/bundles/res/anim/units*`。
 */
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const WEB_ANIM = join(ROOT, 'game', 'web', 'anim');
const COCOS_ANIM = join(ROOT, 'game', 'cocos', 'assets', 'bundles', 'res', 'anim');
const PYTHON_DEFAULT = 'C:\\Users\\liutian\\.dsh\\dsh-runtimes\\dsh-primary-runtime\\dependencies\\python\\python.exe';

const args = parseArgs(process.argv.slice(2));
const MAX_PAGE = args.maxPage ?? 2048;
const OUT_DIR = resolve(args.out ?? join(HERE, 'out'));
const SRC_DIR = resolve(args.src ?? WEB_ANIM);
const PYTHON = args.python ?? (existsSync(PYTHON_DEFAULT) ? PYTHON_DEFAULT : 'python');

const srcJsonPath = join(SRC_DIR, 'units.json');
const src = JSON.parse(readFileSync(srcJsonPath, 'utf8'));
if (src.meta?.packed_by && !args.force) {
  fail(
    `${srcJsonPath} 已经是重打包产物（meta.packed_by=${src.meta.packed_by}）。\n` +
      `  原图归档在 work/units_repack/src/，要重跑请加 --src work/units_repack/src；\n` +
      `  真要拿它当输入再排一次，加 --force。`,
  );
}
if (!Array.isArray(src.pages) || src.pages.length === 0) fail('源 units.json 没有 pages[]');
if (!src.groups || typeof src.groups !== 'object') fail('源 units.json 没有 groups');

const PAD = positiveInt(args.padding) ?? positiveInt(src.meta?.padding) ?? 2;
const CANVAS_W = positiveInt(src.meta?.canvas_w) ?? 75;
const PITCH = CANVAS_W + PAD;
const PER_ROW = Math.floor((MAX_PAGE + PAD) / PITCH);
if (PER_ROW < 1) fail(`页宽 ${MAX_PAGE} 放不下一个 ${CANVAS_W}px 的帧`);

// ---------------------------------------------------------------------------
// 1) 读源帧（支持源本身已是多页，方便反复迭代）
// ---------------------------------------------------------------------------
const srcPages = src.pages.map((p) => ({
  file: String(p.file),
  w: positiveInt(p.w),
  h: positiveInt(p.h),
  sprites: Array.isArray(p.sprites) ? p.sprites : [],
  png: join(SRC_DIR, String(p.file)),
}));
for (const p of srcPages) {
  if (!p.w || !p.h) fail(`源页 ${p.file} 的 w/h 非法`);
  if (!existsSync(p.png)) fail(`源 PNG 不存在：${p.png}`);
}

/** @type {{i:number,name:string,x:number,y:number,w:number,h:number,s:number}[]} */
const frames = [];
const byName = new Map();
srcPages.forEach((p, s) => {
  for (const sp of p.sprites) {
    const name = String(sp.name);
    if (byName.has(name)) fail(`源图集帧名重复：${name}`);
    const f = {
      i: frames.length,
      name,
      x: positiveInt(sp.x) ?? 0,
      y: positiveInt(sp.y) ?? 0,
      w: positiveInt(sp.w) ?? 0,
      h: positiveInt(sp.h) ?? 0,
      s, // 源页码
    };
    if (!f.w || !f.h) fail(`${name} 宽高非法`);
    if (f.x + f.w > p.w || f.y + f.h > p.h) fail(`${name} 在源页 ${p.file} 越界`);
    frames.push(f);
    byName.set(name, f);
  }
});
const declaredCount = positiveInt(src.meta?.count);
if (declaredCount && declaredCount !== frames.length) {
  fail(`meta.count=${declaredCount} 与实际帧数 ${frames.length} 不一致`);
}

// 组归属：组里每个 back/front/attack/attackEnemy 帧名都要能在图集里找到
/** @type {Map<string,string>} 帧名 → 组名 */
const groupOf = new Map();
/** @type {string[]} 组名，按帧首次出现顺序（= 源图集里的组顺序） */
const groupOrder = [];
for (const [g, v] of Object.entries(src.groups)) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
  let firstSeen = false;
  for (const key of ['back', 'front', 'attack', 'attackEnemy']) {
    for (const name of v[key] ?? []) {
      if (!byName.has(name)) fail(`组 ${g}.${key} 的帧名 ${name} 不在图集里`);
      if (groupOf.has(name)) fail(`帧名 ${name} 同时属于 ${groupOf.get(name)} 与 ${g}`);
      groupOf.set(name, g);
      if (!firstSeen) {
        groupOrder.push(g);
        firstSeen = true;
      }
    }
  }
}
const orphans = frames.filter((f) => !groupOf.has(f.name)).map((f) => f.name);
if (orphans.length > 0) warn(`${orphans.length} 帧不属于任何对象组（不影响单页排布）：${orphans.slice(0, 4).join(',')}…`);

// ---------------------------------------------------------------------------
// 2) shelf packing
// ---------------------------------------------------------------------------
/** 把一组帧塞进一页；装不下返回 null（不写回任何状态） */
function packShelves(list, pageW = MAX_PAGE, pageH = MAX_PAGE) {
  const perRow = Math.max(1, Math.floor((pageW + PAD) / PITCH));
  const sorted = [...list].sort((a, b) => b.h - a.h || a.i - b.i);
  const placed = [];
  let y = 0;
  for (let k = 0; k < sorted.length; k += perRow) {
    const row = sorted.slice(k, k + perRow);
    const rowH = Math.max(...row.map((f) => f.h));
    if (y + rowH + PAD > pageH) return null;
    row.forEach((f, col) => placed.push({ f, x: col * PITCH, y }));
    y += rowH + PAD;
  }
  return { sprites: placed, h: Math.max(y, 1) };
}

function framesOfGroup(g) {
  return frames.filter((f) => groupOf.get(f.name) === g);
}

/** 按组整页切分：尽量装满一页，绝不让组跨页 */
function packByGroups(groups) {
  const pages = [];
  let cur = [];
  let k = 0;
  while (k < groups.length) {
    const trial = cur.concat(framesOfGroup(groups[k]));
    const packed = packShelves(trial);
    if (packed) {
      cur = trial;
      k += 1;
      continue;
    }
    if (cur.length === 0) fail(`组 ${groups[k]} 单独都塞不进 ${MAX_PAGE}×${MAX_PAGE} 一页`);
    pages.push(packShelves(cur));
    cur = [];
  }
  if (cur.length > 0) pages.push(packShelves(cur));
  return pages;
}

function planPages() {
  if (positiveInt(args.splitAt) && groupOrder.length > args.splitAt) {
    // 自测用：把组切成两段，各排一页（页内仍全局排序，页间按组隔离）
    const k = args.splitAt;
    const a = groupOrder.slice(0, k).flatMap(framesOfGroup);
    const b = groupOrder.slice(k).flatMap(framesOfGroup);
    const pa = packShelves(a);
    const pb = packShelves(b);
    if (!pa || !pb) fail(`--split-at ${k} 切出来的页超过 ${MAX_PAGE}px 高`);
    return [pa, pb];
  }
  const single = packShelves(frames);
  if (single) return [single];
  const pages = packByGroups(groupOrder);
  warn(`一页装不下，按组切成 ${pages.length} 页`);
  return pages;
}

const planned = planPages();
const totalPlanned = planned.reduce((n, p) => n + p.sprites.length, 0);
if (totalPlanned !== frames.length) fail(`排布漏帧：${totalPlanned}/${frames.length}`);
for (const [i, p] of planned.entries()) {
  if (p.h > MAX_PAGE) fail(`第 ${i} 页高 ${p.h} 超过 ${MAX_PAGE}`);
}

// 页码 + 帧矩形（按源顺序输出，json diff 里只看得到 x/y/p 变）
const pageOf = new Map();
planned.forEach((p, pi) => p.sprites.forEach((sp) => pageOf.set(sp.f.name, { p: pi, x: sp.x, y: sp.y })));
const fileNames = planned.map((_, i) => `units_${String(i).padStart(2, '0')}.png`);
const pages = planned.map((p, i) => ({
  file: fileNames[i],
  w: MAX_PAGE,
  h: p.h,
  sprites: [],
}));
for (const f of frames) {
  const at = pageOf.get(f.name);
  if (!at) fail(`帧 ${f.name} 没有落位`);
  pages[at.p].sprites.push({ name: f.name, x: at.x, y: at.y, w: f.w, h: f.h, p: at.p });
}

const meta = {
  ...src.meta,
  page_size: [pages[0].w, pages[0].h],
  packed_page_size: [pages[0].w, pages[0].h],
  page_count: pages.length,
  page_max: MAX_PAGE,
  page_sizes: pages.map((p) => [p.w, p.h]),
  padding: PAD,
  packed_by: 'work/units_repack/repack.mjs',
};
const outJson = { meta, pages, groups: src.groups };

mkdirSync(OUT_DIR, { recursive: true });
const outJsonPath = join(OUT_DIR, 'units.json');
writeFileSync(outJsonPath, JSON.stringify(outJson), 'utf8');

// ---------------------------------------------------------------------------
// 3) 像素搬运 + 逐帧 SHA256 校验（Python/PIL）
// ---------------------------------------------------------------------------
const layoutPath = join(OUT_DIR, 'layout.json');
writeFileSync(
  layoutPath,
  JSON.stringify({
    srcDir: SRC_DIR,
    outDir: OUT_DIR,
    padding: PAD,
    pageMax: MAX_PAGE,
    sources: srcPages.map((p) => ({ file: p.file, w: p.w, h: p.h })),
    pages: pages.map((p) => ({
      file: p.file,
      w: p.w,
      h: p.h,
      sprites: p.sprites.map((sp) => {
        const f = byName.get(sp.name);
        return { name: sp.name, x: sp.x, y: sp.y, w: sp.w, h: sp.h, s: f.s, sx: f.x, sy: f.y };
      }),
    })),
  }),
  'utf8',
);

const pyScript = join(HERE, 'pixels.py');
const run = spawnSync(PYTHON, [pyScript, layoutPath], { stdio: 'inherit', cwd: ROOT });
if (run.status !== 0) fail(`pixels.py 退出码 ${run.status}（看上面 Python 的输出）`);

const verifyPath = join(OUT_DIR, 'verify.json');
if (!existsSync(verifyPath)) fail(`没有生成 ${verifyPath}`);
const verify = JSON.parse(readFileSync(verifyPath, 'utf8'));
if (verify.frames !== frames.length) fail(`校验帧数 ${verify.frames} ≠ ${frames.length}`);
if (verify.equal !== frames.length) {
  fail(`逐帧像素不一致：${verify.equal}/${frames.length} 相同\n${(verify.mismatches ?? []).slice(0, 8).join('\n')}`);
}
if ((verify.mismatches ?? []).length > 0) fail(`仍有 ${verify.mismatches.length} 帧不一致`);
if ((verify.strayPixels ?? 0) !== 0) fail(`新页帧矩形外有 ${verify.strayPixels} 个不透明像素（搬歪了）`);
if ((verify.overlaps ?? 0) !== 0) fail(`帧矩形有 ${verify.overlaps} 处重叠`);
for (const [i, pg] of verify.pages.entries()) {
  if (pg.w !== pages[i].w || pg.h !== pages[i].h) fail(`第 ${i} 页 PNG 尺寸 ${pg.w}×${pg.h} ≠ JSON ${pages[i].w}×${pages[i].h}`);
  if (Math.max(pg.w, pg.h) > MAX_PAGE) fail(`第 ${i} 页 ${pg.w}×${pg.h} 超过 ${MAX_PAGE}`);
}

// ---------------------------------------------------------------------------
// 4) 结果摘要
// ---------------------------------------------------------------------------
const srcPngBytes = srcPages.reduce((n, p) => n + statSize(p.png), 0);
const outPngBytes = pages.reduce((n, p) => n + statSize(join(OUT_DIR, p.file)), 0);
console.log('');
console.log('=== 重打包结果 ===');
console.log(`源：${srcJsonPath}`);
console.log(`  页 ${srcPages.length}：${srcPages.map((p) => `${p.file} ${p.w}×${p.h}`).join(' + ')}，PNG ${srcPngBytes} B`);
console.log(`出：${outJsonPath}`);
for (const [i, p] of pages.entries()) {
  console.log(`  页 ${i}：${p.file} ${p.w}×${p.h}，帧 ${p.sprites.length}，PNG ${statSize(join(OUT_DIR, p.file))} B`);
}
console.log(`  PNG 合计 ${outPngBytes} B（源 ${srcPngBytes} B，差 ${outPngBytes - srcPngBytes} B）`);
console.log(`  每行 ${PER_ROW} 帧（${CANVAS_W}px + ${PAD}px 间隙 = ${PER_ROW * PITCH}px / ${MAX_PAGE}px）`);
console.log(`  逐帧像素：${verify.equal}/${verify.frames} 相同（RGBA SHA256），调色板下标逐字节相同 ${verify.indexEqual}/${verify.frames}`);
console.log(`  帧矩形外不透明像素：${verify.strayPixels}；帧矩形重叠：${verify.overlaps}`);
console.log(`  证据：${verifyPath}、${join(OUT_DIR, 'frames.sha256.csv')}`);

// ---------------------------------------------------------------------------
// 5) 装机（--install）
// ---------------------------------------------------------------------------
if (args.install) {
  archiveSource();
  copyInto(WEB_ANIM);
  copyInto(COCOS_ANIM);
  // Cocos 的 PNG .meta 记着旧图尺寸/uuid，删掉让编辑器按新图重生成（不要手写 meta）
  for (const f of [...fileNames, ...['units_01.png']]) {
    const metaPath = join(COCOS_ANIM, `${f}.meta`);
    if (existsSync(metaPath)) {
      rmSync(metaPath);
      console.log(`  删 ${rel(metaPath)}（让 Cocos 重新导入生成）`);
    }
  }
  console.log('');
  console.log('=== 已装机 ===');
  for (const dir of [WEB_ANIM, COCOS_ANIM]) {
    console.log(`  ${rel(dir)}：${fileNames.join(', ')} + units.json`);
  }
}

// ---------------------------------------------------------------------------
function copyInto(dir) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(outJsonPath, join(dir, 'units.json'));
  for (const f of fileNames) copyFileSync(join(OUT_DIR, f), join(dir, f));
  // 多页变少页时清掉旧页（只碰 units_NN.png 这个命名）
  for (let i = fileNames.length; i < 10; i += 1) {
    const stale = join(dir, `units_0${i}.png`);
    if (existsSync(stale) && !fileNames.includes(`units_0${i}.png`)) {
      rmSync(stale);
      console.log(`  删旧页 ${rel(stale)}`);
    }
  }
  for (const f of ['units.json', ...fileNames]) {
    console.log(`  写 ${rel(join(dir, f))} ${statSize(join(dir, f))} B sha256:${sha256(join(dir, f)).slice(0, 12)}`);
  }
}

/** 首次运行时把源图归档，否则装机后就没法重跑了 */
function archiveSource() {
  const dir = join(HERE, 'src');
  const marker = join(dir, 'units.json');
  if (existsSync(marker) && existsSync(join(dir, srcPages[0].file))) return;
  mkdirSync(dir, { recursive: true });
  copyFileSync(srcJsonPath, marker);
  for (const p of srcPages) copyFileSync(p.png, join(dir, p.file));
  console.log(`  归档原图到 ${rel(dir)}/（重跑用 --src work/units_repack/src）`);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--install') out.install = true;
    else if (a === '--force') out.force = true;
    else if (a === '--src') out.src = argv[++i];
    else if (a === '--out') out.out = argv[++i];
    else if (a === '--python') out.python = argv[++i];
    else if (a === '--max-page') out.maxPage = Number(argv[++i]);
    else if (a === '--padding') out.padding = Number(argv[++i]);
    else if (a === '--split-at') out.splitAt = Number(argv[++i]);
    else fail(`未知参数 ${a}`);
  }
  return out;
}

function positiveInt(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}

function statSize(p) {
  try {
    return statSync(p).size;
  } catch {
    return 0;
  }
}

function sha256(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

function warn(msg) {
  console.warn(`[repack] ${msg}`);
}

function fail(msg) {
  console.error(`[repack] 失败：${msg}`);
  process.exit(1);
}
