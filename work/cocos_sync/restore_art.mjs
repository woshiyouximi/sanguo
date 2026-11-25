#!/usr/bin/env node
/**
 * 原作美术复位：把 work/cocos_art/gen 的产物复制进 bundle（assets/bundles/res）。
 *
 * 步骤：
 *   1. 调 restore_art.py 生成/刷新 staging（--skip-python 可跳过）
 *   2. 逐文件比对 size + sha256，只复制变化的（幂等）
 *   3. 清掉不再引用的旧底图 bg/map_sheet.png（连同 .meta），省 0.35 MB
 *
 * 用法：
 *   node work/cocos_sync/restore_art.mjs [--dry-run] [--skip-python]
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const SRC = path.join(ROOT, 'work/cocos_art/gen');
const DST = path.join(ROOT, 'game/cocos/assets/bundles/res');
const PY = 'C:/Users/liutian/.dsh/dsh-runtimes/dsh-primary-runtime/dependencies/python/python.exe';
const PY_SCRIPT = path.join(ROOT, 'work/cocos_sync/restore_art.py');

const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry-run');
const SKIP_PY = args.has('--skip-python');

const PRUNE = ['bg/map_sheet.png', 'bg/map_sheet.png.meta'];

const GROUP_ORDER = ['anim/general', 'bg/policy', 'map'];

function sha256(file) {
  if (!fs.existsSync(file)) return '';
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

function groupOf(rel) {
  for (const g of GROUP_ORDER) if (rel === g || rel.startsWith(g + '/')) return g;
  return 'other';
}

if (!SKIP_PY) {
  console.log('[python] restore_art.py');
  execFileSync(PY, [PY_SCRIPT], { cwd: ROOT, stdio: 'inherit' });
}
if (!fs.existsSync(SRC)) {
  console.error(`staging missing: ${SRC}`);
  process.exit(1);
}

const files = walk(SRC).filter((f) => !path.basename(f).startsWith('.'));
const totals = new Map();
const changes = [];
for (const file of files) {
  const rel = path.relative(SRC, file).replace(/\\/g, '/');
  const dst = path.join(DST, rel);
  const size = fs.statSync(file).size;
  const g = groupOf(rel);
  totals.set(g, (totals.get(g) ?? 0) + size);
  const same = fs.existsSync(dst) && fs.statSync(dst).size === size && sha256(dst) === sha256(file);
  if (same) continue;
  changes.push({ rel, size });
}

let pruned = 0;
for (const rel of PRUNE) {
  const dst = path.join(DST, rel);
  if (fs.existsSync(dst)) {
    pruned += fs.statSync(dst).size;
    if (DRY) {
      console.log(`[dry-run] prune ${rel} (${fs.statSync(dst).size} B)`);
    } else {
      fs.rmSync(dst);
      console.log(`[prune] ${rel}`);
    }
  }
}

let copied = 0;
for (const c of changes) {
  if (DRY) {
    console.log(`[dry-run] copy ${c.rel} (${c.size} B)`);
    continue;
  }
  const dst = path.join(DST, c.rel);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(path.join(SRC, c.rel), dst);
  copied += c.size;
}

console.log('');
console.log(`staging files : ${files.length}, ${[...totals.values()].reduce((a, b) => a + b, 0).toLocaleString()} B`);
for (const g of GROUP_ORDER) {
  const n = files.filter((f) => groupOf(path.relative(SRC, f).replace(/\\/g, '/')) === g).length;
  console.log(`  ${g.padEnd(14)} ${String(n).padStart(3)} files ${String(totals.get(g) ?? 0).padStart(9)} B`);
}
console.log(`copied        : ${changes.length} files, ${copied.toLocaleString()} B${DRY ? ' (dry-run)' : ''}`);
console.log(`pruned        : ${pruned.toLocaleString()} B`);
