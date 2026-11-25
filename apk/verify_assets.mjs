#!/usr/bin/env node
// [216_apk] APK 里那份 assets 的体检：不打开 APK，直接读 apk\assets\www。
// 目标是把「APK 能装、装完能跑」里最容易坏的那几件事，在打包前就断言掉：
//   ① 入口页在不在（campaign.html 是壳的首页，index.html 是战斗页）；
//   ② 页面引用的 js / dist 模块、模块之间 import 的相对路径，全都能落到真实文件；
//   ③ 音乐是 10 首母带、总字节 >= 13 MB（证明没被换成 64kbps 那套），且和 game\web 逐字节相同；
//   ④ 99 个音效齐；
//   ⑤ 没有异常大 / 空文件。
// 退出码 0 = 全 PASS；有 FAIL 就非 0，构建脚本可以直接卡住。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = 'F:\\sanguo';
const WWW = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'apk', 'assets', 'www');

const passes = [];
const fails = [];

function ok(label, detail) {
  passes.push(`${label}${detail ? ' — ' + detail : ''}`);
}
function bad(label, detail) {
  fails.push(`${label}${detail ? ' — ' + detail : ''}`);
}
function check(label, fn) {
  try {
    const detail = fn();
    ok(label, detail);
  } catch (e) {
    bad(label, e && e.message ? e.message : String(e));
  }
}

// ---------- 文件索引 ----------
const files = new Map(); // posix 相对路径 -> { size, abs }
function walk(dir, rel = '') {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, ent.name);
    const r = rel ? rel + '/' + ent.name : ent.name;
    if (ent.isDirectory()) walk(abs, r);
    else if (ent.isFile()) files.set(r, { size: fs.statSync(abs).size, abs });
  }
}
if (!fs.existsSync(WWW)) {
  console.error(`assets\www 不存在：${WWW}\n先跑 tools\\build_apk.ps1 生成它。`);
  process.exit(2);
}
walk(WWW);

const totalBytes = [...files.values()].reduce((a, f) => a + f.size, 0);
const has = (p) => files.has(p);
const sizeOf = (p) => (files.get(p) || { size: -1 }).size;

// ---------- ① 入口与脚本 ----------
check('入口页齐全', () => {
  const need = ['campaign.html', 'index.html', 'city.html', 'deploy.html', 'items.html'];
  const miss = need.filter((p) => !has(p));
  if (miss.length) throw new Error('缺：' + miss.join(', '));
  return need.map((p) => `${p} ${sizeOf(p)} B`).join(' / ');
});

check('脚本齐全', () => {
  const need = ['main.js', 'audio.js', 'devflags.js', 'release.js', 'face_map.js', 'saves.js'];
  const miss = need.filter((p) => !has(p));
  if (miss.length) throw new Error('缺：' + miss.join(', '));
  return need.map((p) => `${p} ${sizeOf(p)} B`).join(' / ');
});

check('release.js 声明了 __RELEASE__', () => {
  const src = fs.readFileSync(files.get('release.js').abs, 'utf8');
  if (!/__RELEASE__/.test(src)) throw new Error('release.js 里没有 __RELEASE__');
  return 'window.__RELEASE__ 门控脚本在包里';
});

// ---------- ② 引用可解析 ----------
function stripQuery(p) {
  return p.split('#')[0].split('?')[0];
}
// 按浏览器的规矩解析：页面在站点根时，'../dist/x' 会被夹到 '/dist/x'（越过根的 .. 直接丢掉）。
// 不能直接用 path.posix.normalize —— 它会保留 '../'，把本来能跑的引用误判成坏引用。
function normalizeRef(fromRel, spec) {
  const dir = path.posix.dirname(fromRel);
  const raw = (dir === '.' ? '' : dir + '/') + stripQuery(spec);
  const parts = [];
  for (const seg of raw.split('/')) {
    if (!seg || seg === '.') continue;
    if (seg === '..') {
      parts.pop();
      continue;
    }
    parts.push(seg);
  }
  return parts.join('/');
}
function resolveRef(fromRel, spec) {
  if (!spec) return null;
  if (/^(https?:|data:|blob:|mailto:|javascript:|about:)/i.test(spec)) return true; // 外部/内联，跳过
  // 内联脚本里的模板串（src="${face}"）不是静态引用，跳过
  if (spec.includes('${') || /['"`+ ]/.test(spec)) return true;
  const base = normalizeRef(fromRel, spec);
  const cands = [base, base + '.js', base + '/index.js', base + '.mjs', base + '.css'];
  return cands.find((c) => has(c)) || null;
}

check('HTML 的 script/link/img 引用都能落到文件', () => {
  const htmls = [...files.keys()].filter((p) => p.endsWith('.html'));
  const missing = [];
  let checked = 0;
  for (const h of htmls) {
    const src = fs.readFileSync(files.get(h).abs, 'utf8');
    const re = /(?:src|href)\s*=\s*"([^"]+)"/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1];
      if (/^(https?:|data:|blob:|mailto:|javascript:|#)/i.test(spec)) continue;
      if (spec.startsWith('/')) continue;
      checked++;
      if (!resolveRef(h, spec)) missing.push(`${h} → ${spec}`);
    }
  }
  if (missing.length) throw new Error('解析不到：' + missing.slice(0, 8).join('; '));
  return `${htmls.length} 个页面 / ${checked} 条引用`;
});

check('dist 模块之间的相对 import 都能解析', () => {
  const js = [...files.keys()].filter((p) => p.startsWith('dist/') && p.endsWith('.js'));
  const missing = [];
  let checked = 0;
  for (const f of js) {
    const src = fs.readFileSync(files.get(f).abs, 'utf8');
    const re = /(?:^|[\s;}])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(src))) {
      const spec = m[1] || m[2];
      if (!spec || !spec.startsWith('.')) continue;
      checked++;
      if (!resolveRef(f, spec)) missing.push(`${f} → ${spec}`);
    }
  }
  if (missing.length) throw new Error('解析不到：' + missing.slice(0, 8).join('; '));
  return `${js.length} 个模块 / ${checked} 条 import`;
});

check('页面 import 的 ../dist/* 都能落到打包进来的 dist/', () => {
  const htmls = [...files.keys()].filter((p) => p.endsWith('.html'));
  const missing = [];
  let checked = 0;
  for (const h of htmls) {
    const src = fs.readFileSync(files.get(h).abs, 'utf8');
    const re = /from\s*['"](\.\.\/(?:dist|data)\/[^'"]+)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      checked++;
      const base = normalizeRef(h, m[1]);
      if (!has(base) && !has(base + '.js')) missing.push(`${h} → ${m[1]}`);
    }
  }
  if (missing.length) throw new Error('解析不到：' + missing.slice(0, 8).join('; '));
  return `${htmls.length} 个页面 / ${checked} 条 ../dist 或 ../data 引用`;
});

check('data/ 的 JSON 都能解析', () => {
  const jsons = [...files.keys()].filter((p) => p.startsWith('data/') && p.endsWith('.json'));
  const broken = [];
  for (const j of jsons) {
    try {
      JSON.parse(fs.readFileSync(files.get(j).abs, 'utf8'));
    } catch (e) {
      broken.push(`${j}: ${e.message}`);
    }
  }
  if (broken.length) throw new Error(broken.slice(0, 5).join('; '));
  return `${jsons.length} 个 JSON / ${jsons.reduce((a, p) => a + sizeOf(p), 0).toLocaleString('en-US')} B`;
});

// ---------- ③ 音频：母带 ----------
check('bgm 是 10 首 mp3 且总字节 >= 13 MB', () => {
  const mp3 = [...files.keys()].filter((p) => p.startsWith('assets/audio/bgm/') && p.endsWith('.mp3'));
  const total = mp3.reduce((a, p) => a + sizeOf(p), 0);
  const max = mp3.sort((a, b) => sizeOf(b) - sizeOf(a))[0];
  if (mp3.length !== 10) throw new Error(`不是 10 首：${mp3.length}（${mp3.join(', ')}）`);
  if (total < 13e6) throw new Error(`总字节 ${total} < 13,000,000（疑似被换成压缩档）`);
  if (sizeOf(max) < 2.5e6) throw new Error(`最大一首只有 ${sizeOf(max)} B，母带不该这么小`);
  return `10 首 / ${total.toLocaleString('en-US')} B / 最大 ${path.posix.basename(max)} ${sizeOf(max).toLocaleString('en-US')} B`;
});

check('sfx 有 99 个文件', () => {
  const sfx = [...files.keys()].filter((p) => p.startsWith('assets/audio/sfx/') && !p.endsWith('/'));
  if (sfx.length !== 99) throw new Error(`不是 99 个：${sfx.length}`);
  return `${sfx.reduce((a, p) => a + sizeOf(p), 0).toLocaleString('en-US')} B`;
});

check('audio/index.json 与磁盘一致', () => {
  const p = 'assets/audio/index.json';
  if (!has(p)) throw new Error('缺 assets/audio/index.json');
  const idx = JSON.parse(fs.readFileSync(files.get(p).abs, 'utf8'));
  if (!idx.bgm || typeof idx.bgm !== 'object') throw new Error('index.json 没有 bgm 表');
  const bad = [];
  let bgmBytes = 0;
  for (const [id, e] of Object.entries(idx.bgm)) {
    const rel = 'assets/audio/bgm/' + e.file;
    if (!has(rel)) bad.push(`bgm ${id} → ${e.file} 不存在`);
    else if (sizeOf(rel) !== e.bytes) bad.push(`bgm ${id} ${e.file} 大小 ${sizeOf(rel)} != 元数据 ${e.bytes}`);
    else bgmBytes += e.bytes;
  }
  for (const [k, t] of Object.entries(idx.terrain || {})) {
    if (t && t.bgm && !has('assets/audio/bgm/' + t.bgm)) bad.push(`terrain ${k} → ${t.bgm} 不存在`);
  }
  const tracks = new Set(Object.keys(idx.bgm));
  for (const t of idx.sceneTracks || []) {
    if (!tracks.has(String(t))) bad.push(`sceneTracks 里的 ${t} 没有对应 bgm 条目`);
  }
  if (bad.length) throw new Error(bad.slice(0, 6).join('; '));
  return `bgm ${Object.keys(idx.bgm).length} 条 / ${bgmBytes.toLocaleString('en-US')} B，terrain ${Object.keys(idx.terrain || {}).length} 条、sceneTracks ${(idx.sceneTracks || []).length} 条都对得上`;
});

// ---------- ④ 与源目录逐字节一致 ----------
function sha256(abs) {
  return crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
}
check('与 game\\web + game\\data + game\\dist 逐字节一致（原样复制，没被压过）', () => {
  const pairs = [
    ['F:\\sanguo\\game\\web', ''],
    ['F:\\sanguo\\game\\data', 'data/'],
    ['F:\\sanguo\\game\\dist', 'dist/'],
  ];
  let same = 0;
  const diff = [];
  const srcFiles = new Map();
  for (const [src, prefix] of pairs) {
    const walkSrc = (dir, rel) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const abs = path.join(dir, ent.name);
        const r = rel ? rel + '/' + ent.name : ent.name;
        if (ent.isDirectory()) walkSrc(abs, r);
        else if (ent.isFile()) srcFiles.set(prefix + r, abs);
      }
    };
    walkSrc(src, '');
  }
  for (const [rel, abs] of srcFiles) {
    if (!has(rel)) {
      diff.push(`${rel} 在 APK assets 里缺失`);
      continue;
    }
    if (files.get(rel).size !== fs.statSync(abs).size || sha256(files.get(rel).abs) !== sha256(abs)) {
      diff.push(`${rel} 内容不一致`);
      continue;
    }
    same++;
  }
  if (diff.length) throw new Error(diff.slice(0, 8).join('; '));
  return `${same.toLocaleString('en-US')} 个文件 sha256 全等`;
});

// ---------- ⑤ 异常文件 ----------
check('没有 > 100 MB 的异常文件 / 空文件', () => {
  const huge = [...files.entries()].filter(([, f]) => f.size > 100 * 1024 * 1024);
  const empty = [...files.entries()].filter(([, f]) => f.size === 0);
  if (huge.length) throw new Error('过大：' + huge.map(([p, f]) => `${p} ${f.size}`).join(', '));
  if (empty.length) throw new Error('空文件：' + empty.map(([p]) => p).slice(0, 8).join(', '));
  return `最大 ${Math.max(...[...files.values()].map((f) => f.size)).toLocaleString('en-US')} B`;
});

// ---------- 汇总 ----------
console.log('APK assets 体检：' + WWW);
console.log(`  规模        : ${files.size.toLocaleString('en-US')} 个文件 / ${totalBytes.toLocaleString('en-US')} B = ${(totalBytes / 1e6).toFixed(2)} MB = ${(totalBytes / 1048576).toFixed(2)} MiB`);
console.log('');
for (const p of passes) console.log('  PASS  ' + p);
for (const f of fails) console.log('  FAIL  ' + f);
console.log('');
if (fails.length) {
  console.log(`FAILED ${fails.length} / ${passes.length + fails.length}`);
  process.exit(1);
}
console.log(`ALL PASS (${passes.length}/${passes.length})`);
