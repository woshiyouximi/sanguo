// prune.mjs — 把 bundles/res 里「零引用」的资源搬回 cocos-park/res（可逆），并删对应 .meta。
// 只动 bundles/res 里的文件；不新增任何资源。默认 dry-run，--apply 才真搬。
//
// 清单依据 refs.tsv（node refs.mjs 产出）：refFiles=0 且不属于「給人看的清單」的档。
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const BUNDLE = path.join(ROOT, 'game/cocos/assets/bundles/res');
const PARK = path.join(ROOT, 'game/cocos-park/res');
const OUT = path.join(ROOT, 'work/cocos_art_final');
const APPLY = process.argv.includes('--apply');

// 1) 整目录搬：fx/（Cocos 侧 0 引用；战斗特效是 Graphics 画的）
const DIRS = ['fx'];
// 2) 单档搬：audio/index.json（音频剔除后无入口；AudioBus 用逻辑名直拼 audio/sfx|bgm）
const FILES = ['audio/index.json'];
// 3) 只删不移：孤立的目录 .meta（bundle 里已经没有 bg/env 目录）
const ORPHANS = ['bg/env.meta'];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const plan = [];
for (const d of DIRS) {
  const dirAbs = path.join(BUNDLE, d);
  if (!fs.existsSync(dirAbs)) continue;
  for (const f of walk(dirAbs)) {
    const rel = path.relative(BUNDLE, f).replace(/\\/g, '/');
    const isMeta = rel.endsWith('.meta');
    plan.push({ kind: isMeta ? 'meta' : 'asset', rel, bytes: fs.statSync(f).size });
  }
  const dirMeta = path.join(BUNDLE, d + '.meta');
  if (fs.existsSync(dirMeta)) plan.push({ kind: 'dirmeta', rel: d + '.meta', bytes: fs.statSync(dirMeta).size });
}
for (const f of FILES) {
  const abs = path.join(BUNDLE, f);
  if (!fs.existsSync(abs)) continue;
  plan.push({ kind: 'asset', rel: f, bytes: fs.statSync(abs).size });
  if (fs.existsSync(abs + '.meta')) plan.push({ kind: 'meta', rel: f + '.meta', bytes: fs.statSync(abs + '.meta').size });
}
for (const f of ORPHANS) {
  const abs = path.join(BUNDLE, f);
  if (fs.existsSync(abs)) plan.push({ kind: 'orphan', rel: f, bytes: fs.statSync(abs).size });
}

const assets = plan.filter((p) => p.kind === 'asset');
const assetBytes = assets.reduce((n, p) => n + p.bytes, 0);
const allBytes = plan.reduce((n, p) => n + p.bytes, 0);

console.log('%s：搬 %d 档资源 / %d 字节（含 .meta 共 %d 档 / %d 字节）',
  APPLY ? 'APPLY' : 'DRY-RUN', assets.length, assetBytes, plan.length, allBytes);
for (const d of DIRS) {
  const a = assets.filter((p) => p.rel.startsWith(d + '/'));
  console.log('  %s/  %d 档  %d B', d, a.length, a.reduce((n, p) => n + p.bytes, 0));
}
for (const f of FILES) {
  const a = assets.filter((p) => p.rel === f);
  if (a.length) console.log('  %s  %d B', f, a[0].bytes);
}
for (const f of ORPHANS) {
  const o = plan.filter((p) => p.rel === f);
  if (o.length) console.log('  孤立 .meta %s  %d B（只删不移）', f, o[0].bytes);
}

if (!APPLY) {
  console.log('（dry-run，加 --apply 才执行）');
  process.exit(0);
}

const log = { moved: [], deleted: [], totalAssetBytes: assetBytes, totalBytes: allBytes };
for (const p of plan) {
  const from = path.join(BUNDLE, p.rel);
  if (p.kind === 'orphan') {
    fs.unlinkSync(from);
    log.deleted.push({ rel: p.rel, bytes: p.bytes });
    continue;
  }
  const to = path.join(PARK, p.rel);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  if (fs.existsSync(to)) throw new Error('目標已存在：' + to);
  fs.renameSync(from, to);
  log.moved.push({ rel: p.rel, bytes: p.bytes, kind: p.kind });
}
// 清掉搬空的目录（自底向上）
for (const d of DIRS) {
  const dirAbs = path.join(BUNDLE, d);
  if (fs.existsSync(dirAbs) && fs.readdirSync(dirAbs).length === 0) fs.rmdirSync(dirAbs);
}
fs.writeFileSync(path.join(OUT, 'prune-log.json'), JSON.stringify(log, null, 2) + '\n', 'utf8');
console.log('已搬 %d 档 / 已删 %d 档，日志写 %s', log.moved.length, log.deleted.length,
  path.join(OUT, 'prune-log.json'));
