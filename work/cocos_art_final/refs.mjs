// refs.mjs — 把 bundles/res 与 cocos-park/res 的每个资源，对 game/cocos/assets/scripts/**/*.ts
// 做一遍「路径前缀」引用普查，输出「每个资源 → 引用文件数」。
//
// 为什么要前缀匹配：Cocos 侧的路径大多是拼出来的（`bg/policy/palais_${tag}`、
// `map/city_${i}`、`hero/${gen.NAME}`），对最终 key 做字面量 grep 一定查不到。
// 做法：把每个 .ts 里的字符串字面量 + 模板字面量的静态片段取出来（`${...}` 记成 \x00），
// 一个资源 key 被某个片段「覆盖」的定义是：key 以该片段开头（片段含 '/' 且长度 ≥ 4），
// 或片段以 key 开头。前者覆盖拼出来的后缀，后者覆盖 'bg/deploy_bg' 这种整段常量。
//
// 用法：node work/cocos_art_final/refs.mjs [--tsv out.tsv] [--quiet]
import fs from 'node:fs';
import path from 'node:path';

const ROOT = 'F:/sanguo';
const SCRIPTS = path.join(ROOT, 'game/cocos/assets/scripts');
const BUNDLE = path.join(ROOT, 'game/cocos/assets/bundles/res');
const PARK = path.join(ROOT, 'game/cocos-park/res');
const OUT_DIR = path.join(ROOT, 'work/cocos_art_final');
const EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.json', '.mp3', '.ogg', '.wav', '.m4a', '.aac', '.plist', '.txt']);
const MIN_PREFIX = 4;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

/** 从 .ts 源码里抽「路径片段」 */
function tokensOf(src) {
  const out = [];
  // 模板字面量：`bg/policy/palais_${tag}` → ["bg/policy/palais_", "bg/policy/palais_"]（断开处也当一个片段）
  const tickRe = /`(?:[^`\\]|\\.)*`/g;
  let m;
  while ((m = tickRe.exec(src)) !== null) {
    for (const part of m[0].slice(1, -1).split(/\$\{[^}]*\}/)) {
      if (part.trim().length >= MIN_PREFIX) out.push(part);
    }
  }
  // 普通引号
  const strRe = /'([^'\\\n]*)'|"([^"\\\n]*)"/g;
  while ((m = strRe.exec(src)) !== null) {
    const s = m[1] !== undefined ? m[1] : m[2];
    if (s && s.length >= MIN_PREFIX) out.push(s);
  }
  return out;
}

const scriptFiles = walk(SCRIPTS).filter((f) => f.endsWith('.ts'));
const tokens = new Map(); // relFile -> string[]
for (const f of scriptFiles) {
  const src = fs.readFileSync(f, 'utf8');
  tokens.set(path.relative(ROOT, f).replace(/\\/g, '/'), tokensOf(src));
}
const tokenCount = Array.from(tokens.values()).reduce((n, a) => n + a.length, 0);

/** key：相对 res 根、去掉扩展名的路径，如 bg/policy/palais_03 */
function keyOf(file, base) {
  return path.relative(base, file).replace(/\\/g, '/').replace(/\.[^./]+$/, '');
}

function refsOf(key) {
  const hits = [];
  for (const [file, list] of tokens) {
    let n = 0;
    for (const t of list) {
      if (t.length < MIN_PREFIX) continue;
      if (key.startsWith(t) || (t.length >= key.length && t.startsWith(key))) {
        n += 1;
        break;
      }
    }
    if (n > 0) hits.push(file);
  }
  return hits;
}

function collect(base, label) {
  const files = walk(base).filter((f) => EXT.has(path.extname(f).toLowerCase()));
  const rows = [];
  for (const f of files) {
    const key = keyOf(f, base);
    const hits = refsOf(key);
    rows.push({ root: label, key, bytes: fs.statSync(f).size, refs: hits.length, files: hits });
  }
  return rows;
}

const rows = collect(BUNDLE, 'bundle').concat(collect(PARK, 'park'));
rows.sort((a, b) => a.root.localeCompare(b.root) || a.key.localeCompare(b.key));

// ---- 输出 ----
const tsv = process.argv.indexOf('--tsv') > 0 ? process.argv[process.argv.indexOf('--tsv') + 1] : null;
const lines = ['root\tkey\tbytes\trefFiles\tfiles'];
for (const r of rows) lines.push([r.root, r.key, r.bytes, r.refs, r.files.join(',')].join('\t'));
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(tsv || path.join(OUT_DIR, 'refs.tsv'), lines.join('\n') + '\n', 'utf8');

const byDir = new Map();
for (const r of rows) {
  const dir = r.key.includes('/') ? r.key.slice(0, r.key.lastIndexOf('/')) : '(res root)';
  const k = r.root + ':' + dir;
  const cur = byDir.get(k) || { n: 0, zero: 0, bytes: 0, zeroBytes: 0 };
  cur.n += 1;
  cur.bytes += r.bytes;
  if (r.refs === 0) {
    cur.zero += 1;
    cur.zeroBytes += r.bytes;
  }
  byDir.set(k, cur);
}

console.log('scripts 文件 %d 个，抽出路径片段 %d 条', scriptFiles.length, tokenCount);
console.log('资源 %d 个（bundle %d + park %d）', rows.length,
  rows.filter((r) => r.root === 'bundle').length, rows.filter((r) => r.root === 'park').length);
console.log('');
console.log('目录\t档数\t字节\t零引用档\t零引用字节');
for (const k of Array.from(byDir.keys()).sort()) {
  const v = byDir.get(k);
  console.log('%s\t%d\t%d\t%d\t%d', k, v.n, v.bytes, v.zero, v.zeroBytes);
}
const zero = rows.filter((r) => r.refs === 0);
console.log('');
console.log('零引用合计：%d 档 / %d 字节（bundle %d 档 %d B；park %d 档 %d B）',
  zero.length, zero.reduce((n, r) => n + r.bytes, 0),
  zero.filter((r) => r.root === 'bundle').length, zero.filter((r) => r.root === 'bundle').reduce((n, r) => n + r.bytes, 0),
  zero.filter((r) => r.root === 'park').length, zero.filter((r) => r.root === 'park').reduce((n, r) => n + r.bytes, 0));
if (process.argv.indexOf('--quiet') < 0) {
  console.log('');
  for (const r of zero) console.log('ZERO\t%s\t%s\t%d', r.root, r.key, r.bytes);
}
