#!/usr/bin/env node
/**
 * web → Cocos bundle「res」资源同步（C3 / C11）。
 *
 * 为什么要有这个脚本：
 *   - Cocos 版的 `assets/bundles/res` 是「手工拷过一次」的，只有 4 张 bg、3 首 BGM、
 *     零个 face / anim/general / bg/env / bg/orig / bg/policy / map / items，
 *     于是战场只能画纯色、编成看不到立绘、大地图没有地形图。
 *   - 手工拷不可重复、也没法回答「到底同步了多少、哪个文件没同步」。
 *
 * 本脚本的契约：
 *   1. **幂等**：目标文件已存在且 `size` + `sha256` 都与源一致 → 跳过（不重写、不改 mtime）。
 *      所以连跑两次，第二次必然是“新增 0 / 更新 0 / 跳过 N”。
 *   2. **不碰 `.meta`**：Cocos 的 `.meta` 由编辑器在导入时生成（uuid 必须由 asset-db 分配），
 *      脚本只搬二进制资源本体；新增资源的 `.meta` 要等下一次打开 Creator 才出现。
 *   3. **清单可核对**：`manifest.csv` 每行 `group,dst,src,bytes,sha256`，内容只由源决定，
 *      两次运行生成的文件逐字节相同；每次运行的计数追加到 `sync_log.csv`。
 *   4. **不删源、不删目标多余文件**：脚本只做“补齐/更新”，删除留给人工（见报告 §4）。
 *
 * 用法：
 *   node work/cocos_sync/sync_assets.mjs            # 同步
 *   node work/cocos_sync/sync_assets.mjs --dry-run  # 只统计，不写目标
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'F:/sanguo';
const WEB = `${ROOT}/game/web`;
const DST = `${ROOT}/game/cocos/assets/bundles/res`;
const OUT = `${ROOT}/work/cocos_sync`;
const DRY = process.argv.includes('--dry-run');

/**
 * 分组：`src` 相对 `game/web`，`dst` 相对 bundle 根 `assets/bundles/res`。
 * `hero` 只核对不拷贝：Cocos 侧已有 400 张 AI 立绘（C12 建议下线，所以不重复搬一份）。
 */
const GROUPS = [
  { group: 'face', src: 'assets/face', dst: 'face', why: '武将脸（full/thumb/index.json），编成与情报页用' },
  { group: 'anim/general', src: 'anim/general', dst: 'anim/general', why: '35 张武将技 sheet + index.json' },
  { group: 'bg/env', src: 'assets/bg/env', dst: 'bg/env', why: '大地图/城池氛围图 + ui_* 十三张' },
  { group: 'bg/orig', src: 'assets/bg/orig', dst: 'bg/orig', why: '12 套地形 floor/bg/mg/fg（战场背景用）' },
  { group: 'bg/policy', src: 'assets/bg/policy', dst: 'bg/policy', why: '内政/城池大图 6 张' },
  { group: 'map', src: 'assets/map', dst: 'map', why: 'chinamap + 城池点/玩家点' },
  { group: 'items', src: 'assets/items', dst: 'items', why: '道具图标 57 张' },
  { group: 'audio/bgm', src: 'assets/audio/bgm', dst: 'audio/bgm', why: 'BGM 补 7 首（03/10/11/12/13/14/17）' },
];

const HERO = { group: 'hero', src: 'assets/hero', dst: 'hero' };

function walk(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(full));
    else if (ent.name.toLowerCase() !== '.meta') out.push(full);
  }
  return out;
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function relPosix(base, full) {
  return path.relative(base, full).split(path.sep).join('/');
}

function fmtBytes(n) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

const rows = [];
let added = 0;
let updated = 0;
let skipped = 0;
let copiedBytes = 0;
const perGroup = [];

for (const g of GROUPS) {
  const srcDir = `${WEB}/${g.src}`;
  const dstDir = `${DST}/${g.dst}`;
  if (!fs.existsSync(srcDir)) {
    console.warn(`[skip] 源目录不存在：${srcDir}`);
    continue;
  }
  const files = walk(srcDir).sort();
  let gAdded = 0;
  let gUpdated = 0;
  let gSkipped = 0;
  let gBytes = 0;
  for (const src of files) {
    const rel = relPosix(srcDir, src);
    const dst = path.join(dstDir, rel);
    const buf = fs.readFileSync(src);
    const size = buf.length;
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    gBytes += size;
    rows.push({
      group: g.group,
      dst: relPosix(DST, dst),
      src: relPosix(ROOT, src),
      bytes: size,
      sha256: hash,
      action: '',
    });
    const row = rows[rows.length - 1];
    if (fs.existsSync(dst)) {
      const same = fs.statSync(dst).size === size && sha256(dst) === hash;
      if (same) {
        gSkipped += 1;
        row.action = 'skip';
        continue;
      }
      gUpdated += 1;
      row.action = 'update';
      if (!DRY) {
        fs.mkdirSync(path.dirname(dst), { recursive: true });
        fs.writeFileSync(dst, buf);
      }
      copiedBytes += size;
      continue;
    }
    gAdded += 1;
    row.action = 'add';
    if (!DRY) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, buf);
    }
    copiedBytes += size;
  }
  added += gAdded;
  updated += gUpdated;
  skipped += gSkipped;
  perGroup.push({ ...g, files: files.length, bytes: gBytes, added: gAdded, updated: gUpdated, skipped: gSkipped });
}

// ── hero：只核对，不拷贝 ─────────────────────────────────────────────────
const heroWeb = walk(`${WEB}/${HERO.src}`);
const heroCocos = walk(`${DST}/${HERO.dst}`);
const sum = (list) => list.reduce((n, f) => n + fs.statSync(f).size, 0);

// ── 打印 ────────────────────────────────────────────────────────────────
const pad = (s, n) => String(s).padEnd(n);
console.log('');
console.log(`资源同步 web → ${DST}${DRY ? '  [DRY-RUN]' : ''}`);
console.log('');
console.log(`${pad('group', 14)}${pad('files', 8)}${pad('bytes', 12)}${pad('added', 8)}${pad('updated', 9)}skipped`);
for (const g of perGroup) {
  console.log(
    `${pad(g.group, 14)}${pad(g.files, 8)}${pad(fmtBytes(g.bytes), 12)}${pad(g.added, 8)}${pad(g.updated, 9)}${g.skipped}`,
  );
}
const totalFiles = perGroup.reduce((n, g) => n + g.files, 0);
const totalBytes = perGroup.reduce((n, g) => n + g.bytes, 0);
console.log(`${pad('TOTAL', 14)}${pad(totalFiles, 8)}${pad(fmtBytes(totalBytes), 12)}${pad(added, 8)}${pad(updated, 9)}${skipped}`);
console.log('');
console.log(`新增 ${added} / 更新 ${updated} / 跳过 ${skipped}  （本次写入 ${fmtBytes(copiedBytes)}）`);
console.log(
  `hero（只核对，不重复同步）：web ${heroWeb.length} 文件 / ${fmtBytes(sum(heroWeb))}` +
    `  vs  cocos ${heroCocos.length} 文件 / ${fmtBytes(sum(heroCocos))}`,
);
console.log('');

if (DRY) {
  console.log('DRY-RUN：未写任何文件，未更新 manifest.csv / sync_log.csv');
  process.exit(0);
}

// ── manifest.csv（内容只由源决定 → 两次运行逐字节相同）────────────────────
fs.mkdirSync(OUT, { recursive: true });
const lines = ['group,dst,src,bytes,sha256'];
for (const r of rows.slice().sort((a, b) => (a.dst < b.dst ? -1 : a.dst > b.dst ? 1 : 0))) {
  lines.push(`${r.group},${r.dst},${r.src},${r.bytes},${r.sha256}`);
}
fs.writeFileSync(`${OUT}/manifest.csv`, `${lines.join('\n')}\n`, 'utf8');

// ── sync_log.csv（每次运行追加一行，作为「第二次 新增0/更新0」的证据）────
const logPath = `${OUT}/sync_log.csv`;
const header = 'run,at,added,updated,skipped,files,bytes,copiedBytes';
let prev = '';
if (fs.existsSync(logPath)) {
  prev = fs.readFileSync(logPath, 'utf8');
  if (!prev.endsWith('\n')) prev += '\n';
}
const runNo = prev ? prev.trim().split('\n').length - 1 : 0;
const stamp = new Date().toISOString();
const line = `${runNo + 1},${stamp},${added},${updated},${skipped},${totalFiles},${totalBytes},${copiedBytes}`;
fs.writeFileSync(logPath, (prev || `${header}\n`) + `${line}\n`, 'utf8');
console.log(`manifest.csv  ${rows.length} 行  →  ${OUT}/manifest.csv`);
console.log(`sync_log.csv  追加第 ${runNo + 1} 次运行  →  ${line}`);
