#!/usr/bin/env node
/**
 * check_audio_cdn.mjs —— 音频交付的发版前自检（构建 gate 与手动都用它）
 *
 * 为什么要有：音频一旦「清单缺档 / 代码点名的曲子不在包里或 CDN 上 / base 没注入 / 文件是旧的」，
 * 运行时表现是**静音但不报错**（AudioHost 缺档只记账）。这种错只能靠自动检查抓，不能靠听。
 *
 * 两种模式（按 --pkg 自动判）：
 *   - CDN 包：包根有 audio-manifest.json（`build_wechat.ps1 -Audio cdn` 写）。
 *   - 本地包：包根没有 audio-manifest.json（`-Audio embed`，R204 把音频打进 res 分包）。
 *
 * 四段：
 *   [1] 清单：CDN 模式查 dist\audio-cdn 的 109 档字节数 + sha256 前 12 位，并要求包根清单与
 *       CDN 清单逐字节一致；本地模式查 assets\bundles\res\audio 的 109 档，并**逐档核对包里
 *       native\<uuid>.<hash>.mp3 真的存在且大小与清单一致**（Cocos 编译后的路径映射）。
 *   [2] 代码点名：AudioHost.ts 的 MAGIC_SFX / BATTLE_PRELOAD / TERRAIN_TRACK 与 AudioBus.ts
 *       里被硬编码的曲目（当前 44 音效 + 3 BGM）必须都在清单里 —— 漏一个就是「有代码没声音」。
 *   [3] 包内 base：--pkg 时核对包里的 audio-remote.json（raw 副本 + Cocos 编译后的 import json）
 *       的 base 是否等于 --base。只写 raw 不改编译资源的话运行时读不到，所以两处都要对。
 *       本地包这一项必须是空 base（有 base 才会走 CDN 覆盖）。
 *   [4] 远端可达：--base 非空时逐档 HEAD（并发 ≤4），要求 200 且 Content-Length 一致；
 *       本地包跳过（默认根本不访问网络）。
 *
 * 退出码：0 通过；1 本地失败（①②③）；2 仅远端失败；3 用法错误。
 * --allow-remote-fail：远端失败不算失败（构建期用；CDN 上传通常发生在出包之后），
 *                      但会打印 [warn] 和发布前必须复跑的命令。默认远端失败仍然非 0。
 *
 * 用法：
 *   node tools/check_audio_cdn.mjs                       # CDN 模式：只查本地
 *   node tools/check_audio_cdn.mjs --pkg dist/wechat-upload --base ''      # CDN 包 + 包内 base 必须为空
 *   node tools/check_audio_cdn.mjs --pkg dist/wechat-upload --base https://cdn.x/sanguo/audio-cdn
 *   node tools/check_audio_cdn.mjs --pkg dist/wechat-upload # 本地音频包：查包内 109 档 + 空 base
 *   node tools/check_audio_cdn.mjs --base https://cdn.x/sanguo/audio-cdn --allow-remote-fail
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXPECT_COUNT = 109;

function parseArgs(argv) {
  const o = {
    pkg: '',
    base: null,            // null = 未指定（不查远端）；'' = 明确要求 base 为空
    cdn: path.join(ROOT, 'dist', 'audio-cdn'),
    concurrency: 4,
    timeout: 20000,
    allowRemoteFail: false,
    expectCount: EXPECT_COUNT,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--base=')) { o.base = a.slice('--base='.length); continue; }
    const next = () => {
      const v = argv[++i];
      if (v === undefined) { console.error(`[error] ${a} 缺参数`); process.exit(3); }
      return v;
    };
    switch (a) {
      case '--pkg': o.pkg = next(); break;
      case '--base': o.base = next(); break;
      case '--cdn': o.cdn = next(); break;
      case '--concurrency': o.concurrency = Math.max(1, Math.min(4, Number(next()) || 4)); break;
      case '--timeout': o.timeout = Math.max(1000, Number(next()) || 20000); break;
      case '--expect-count': o.expectCount = Number(next()) || EXPECT_COUNT; break;
      case '--allow-remote-fail': o.allowRemoteFail = true; break;
      case '-h': case '--help':
        console.log('node tools/check_audio_cdn.mjs [--pkg <dir>] [--base <url>] [--cdn <dir>] [--allow-remote-fail]');
        process.exit(0);
        break;
      default:
        console.error(`[error] 未知参数：${a}`);
        process.exit(3);
    }
  }
  return o;
}

const opt = parseArgs(process.argv.slice(2));
const normBase = opt.base === null ? null : String(opt.base).trim().replace(/\/+$/, '');
// R193：占位/本机地址一律当失败——历史上 example.com 曾被写进发布包（project/142 §6）。
// 允许 --base '' 表示「明确要求静音包」，但不允许 example.com / localhost 这类假地址混过去。
if (normBase && /(?:^|\.)(?:example\.(?:com|org|net))$|your\.com|localhost|127\.0\.0\.1/i.test(new URL(normBase, 'https://x/').hostname)) {
  console.log(`\n  FAIL base 是占位或本机地址：${normBase}`);
  console.log('       请把真实 CDN 根填进 tools/audio_cdn_config.json（或传 --base），发布包不能带占位域名。');
  process.exit(3);
}
// 包内 base 的期望值：未给 --base 时按「空 base 的包」校验（raw 不存在、编译资源 base 为空）。
const expectedBase = normBase === null ? '' : normBase;

// 模式判定（R204）：包根有 audio-manifest.json = CDN 包；没有 = 音频已打进 res 分包的本地包。
const pkgRoot = opt.pkg ? path.resolve(opt.pkg) : '';
const pkgRootManifest = pkgRoot ? path.join(pkgRoot, 'audio-manifest.json') : '';
const localMode = !!pkgRoot && !fs.existsSync(pkgRootManifest);
const localBundle = path.join(ROOT, 'game/cocos/assets/bundles/res');
const manifestPath = localMode
  ? path.join(localBundle, 'audio-manifest.json')
  : path.join(opt.cdn, 'audio-manifest.json');
const fileRoot = localMode ? localBundle : opt.cdn;
const sha256_12 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
const failLocal = [];
const failRemote = [];
const notes = [];
const fmt = (n) => n.toLocaleString('en-US');

function head(title) { console.log(`\n== ${title}`); }
function ok(msg) { console.log(`  OK   ${msg}`); }
function bad(msg) { console.log(`  FAIL ${msg}`); }
function note(msg) { console.log(`  -    ${msg}`); }

console.log('三国群英传 2 · 音频交付自检');
console.log(`  repo   : ${ROOT}`);
console.log(`  模式   : ${localMode ? '本地包（音频已打进 res 分包）' : 'CDN 包'}`);
if (!localMode) console.log(`  cdn    : ${opt.cdn}`);
if (opt.pkg) console.log(`  pkg    : ${pkgRoot}`);
console.log(`  base   : ${normBase === null ? '(未指定：跳过远端)' : normBase === '' ? '(空)' : normBase}`);

// ---------------------------------------------------------------------------
// [1] 清单 109 档（CDN 模式查 dist\audio-cdn；本地模式查 assets\bundles\res\audio + 包内 native）
// ---------------------------------------------------------------------------
head(localMode
  ? `[1] 包内清单（${path.relative(ROOT, manifestPath)}）`
  : `[1] CDN 清单（${path.relative(ROOT, opt.cdn) || opt.cdn}）`);
let manifest = null;
let entries = [];
if (!fs.existsSync(manifestPath)) {
  bad(`缺清单：${manifestPath}（${localMode ? '先跑 tools\\pack_audio_local.ps1' : '先跑 tools\\build_wechat.ps1 -Audio cdn'}）`);
  failLocal.push('manifest missing');
} else {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (e) {
    bad(`清单不是合法 JSON：${e.message}`);
    failLocal.push('manifest parse');
  }
}
if (manifest) {
  entries = Object.entries(manifest.files || {});
  console.log(`  manifest: version=${manifest.version} count=${manifest.count} bytes=${fmt(manifest.bytes)} 条目=${entries.length}`);
  if (localMode && manifest.encode) console.log(`  encode  : bgm=${manifest.encode.bgm || '?'} sfx=${manifest.encode.sfx || '?'}`);
  if (entries.length !== Number(manifest.count)) {
    bad(`清单自相矛盾：count=${manifest.count} 实际条目=${entries.length}`);
    failLocal.push('count mismatch');
  }
  if (Number(manifest.count) !== opt.expectCount) {
    bad(`档数不是 ${opt.expectCount}：count=${manifest.count}（--expect-count 可改，但别拿来掩盖缺档）`);
    failLocal.push('expect-count');
  }
  let sum = 0;
  let missing = 0;
  let sizeBad = 0;
  let shaBad = 0;
  for (const [key, v] of entries) {
    const abs = path.join(fileRoot, String(v.path).replace(/\//g, path.sep));
    sum += Number(v.bytes) || 0;
    if (!fs.existsSync(abs)) { missing++; if (missing <= 10) bad(`缺文件 ${v.path}（键 ${key}）`); continue; }
    const st = fs.statSync(abs);
    if (st.size !== Number(v.bytes)) {
      sizeBad++;
      if (sizeBad <= 10) bad(`大小不符 ${v.path}：清单 ${v.bytes} 实际 ${st.size}`);
      continue;
    }
    const sha = sha256_12(abs);
    if (sha !== String(v.sha256)) {
      shaBad++;
      if (shaBad <= 10) bad(`sha256 不符 ${v.path}：清单 ${v.sha256} 实际 ${sha}`);
    }
  }
  if (sum !== Number(manifest.bytes)) {
    bad(`清单 bytes 字段 ${manifest.bytes} ≠ 逐档求和 ${sum}`);
    failLocal.push('bytes sum');
  }
  if (missing || sizeBad || shaBad) failLocal.push(`local files missing=${missing} size=${sizeBad} sha=${shaBad}`);
  if (!missing && !sizeBad && !shaBad && entries.length === Number(manifest.count)) {
    ok(`${entries.length}/${opt.expectCount} 档存在，字节与 sha256(12) 全部一致（${fmt(manifest.bytes)} B）`);
  }

  if (localMode) {
    // 本地包：源清单对还不够，必须证明「包里真的有这 109 个 mp3，且大小与清单一致」
    verifyLocalPackage(pkgRoot, entries);
  } else if (opt.pkg) {
    // CDN 包：包根清单必须与 CDN 清单逐字节一致
    if (!fs.existsSync(pkgRootManifest)) {
      bad(`包里没有 audio-manifest.json：${pkgRootManifest}`);
      failLocal.push('pkg manifest missing');
    } else if (!fs.readFileSync(pkgRootManifest).equals(fs.readFileSync(manifestPath))) {
      bad('包根 audio-manifest.json 与 dist\\audio-cdn\\audio-manifest.json 不一致（包与 CDN 不同步，重新出包）');
      failLocal.push('pkg manifest differs');
    } else {
      ok('包根 audio-manifest.json 与 CDN 清单逐字节一致');
    }
  }
}

// ---------------------------------------------------------------------------
// 本地包核验：清单里每一档都要能在包里 native\ 下找到，且字节数一致
// （Cocos 把 AudioClip 落成 native/<uuid前2位>/<uuid>.<hash>.mp3；逻辑路径→uuid 在 config 里）
// ---------------------------------------------------------------------------
function decodeUuid2(str) {
  // 表放函数内：本文件在 [1] 阶段就会调用（早于模块尾部），模块级 const 会踩 TDZ
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const HEXD = '0123456789abcdef';
  if (typeof str !== 'string' || str.length !== 22) return str;
  let buf = '';
  for (let i = 2; i < 22; i += 2) {
    const lhs = B64.indexOf(str[i]);
    const rhs = B64.indexOf(str[i + 1]);
    if (lhs < 0 || rhs < 0) return str;
    buf += HEXD[lhs >> 2] + HEXD[((lhs & 3) << 2) | (rhs >> 4)] + HEXD[rhs & 0xf];
  }
  const hex = str.slice(0, 2) + buf;
  return hex.slice(0, 8) + '-' + hex.slice(8, 12) + '-' + hex.slice(12, 16) + '-' + hex.slice(16, 20) + '-' + hex.slice(20, 32);
}

function findCompiledJsonByMarker(bundleDir, marker) {
  const importDir = path.join(bundleDir, 'import');
  if (!fs.existsSync(importDir)) return '';
  const stack = [importDir];
  let scanned = 0;
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { stack.push(p); continue; }
      if (!ent.name.endsWith('.json')) continue;
      if (++scanned > 30000) return '';
      try {
        if (fs.readFileSync(p, 'utf8').includes(marker)) return p;
      } catch { /* 跳过坏文件 */ }
    }
  }
  return '';
}

function manifestPayload(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set();
  const walk = (n) => {
    if (!n || typeof n !== 'object' || seen.has(n)) return null;
    seen.add(n);
    if (!Array.isArray(n) && n.files && typeof n.count !== 'undefined') return n;
    for (const v of (Array.isArray(n) ? n : Object.values(n))) {
      const hit = walk(v);
      if (hit) return hit;
    }
    return null;
  };
  return walk(data);
}

function verifyLocalPackage(pkg, list) {
  const bundleDir = findBundleDir(pkg);
  if (!bundleDir) {
    bad('包里找不到 res bundle 目录（subpackages\\res / assets\\bundles\\res 都没有 config.*.json）');
    failLocal.push('pkg bundle dir');
    return;
  }
  note(`bundle: ${path.relative(pkg, bundleDir)}`);
  const cfgName = fs.readdirSync(bundleDir).find((n) => /^config\..*\.json$/.test(n));
  if (!cfgName) {
    bad('bundle 缺 config.*.json，无法把 assets/bundles/res 的逻辑路径映射到包内文件');
    failLocal.push('pkg config');
    return;
  }
  let cfg;
  try {
    cfg = JSON.parse(fs.readFileSync(path.join(bundleDir, cfgName), 'utf8'));
  } catch (e) {
    bad(`config 解析失败：${e.message}`);
    failLocal.push('pkg config parse');
    return;
  }
  const paths = cfg.paths || {};
  const uuids = cfg.uuids || [];
  const nativeArr = (cfg.versions && cfg.versions.native) || [];
  const hashByIndex = new Map();
  for (let i = 0; i < nativeArr.length; i += 2) hashByIndex.set(String(nativeArr[i]), String(nativeArr[i + 1]));
  const idxByPath = new Map();
  for (const idx of Object.keys(paths)) {
    const e = paths[idx];
    if (Array.isArray(e) && typeof e[0] === 'string') idxByPath.set(e[0], idx);
  }

  let found = 0;
  const miss = [];
  const sizeBad = [];
  const noHash = [];
  for (const [key, v] of list) {
    const rel = String(v.path).replace(/\\/g, '/');
    const base = rel.replace(/\.[a-z0-9]+$/i, '');
    const idx = idxByPath.get(base);
    if (idx === undefined) { miss.push(`${key}（config.paths 里没有 ${base}）`); continue; }
    const hash = hashByIndex.get(idx);
    if (!hash) { noHash.push(`${key}（config.versions.native 无 hash）`); continue; }
    const uuid = decodeUuid2(String(uuids[idx] || ''));
    const abs = path.join(bundleDir, 'native', uuid.slice(0, 2), `${uuid}.${hash}.mp3`);
    if (!fs.existsSync(abs)) { miss.push(`${key} → ${path.relative(pkg, abs)}`); continue; }
    const sz = fs.statSync(abs).size;
    if (sz !== Number(v.bytes)) { sizeBad.push(`${key} 清单 ${v.bytes} 实际 ${sz}`); continue; }
    found += 1;
  }
  for (const m of miss.slice(0, 12)) bad(`包内缺档 ${m}`);
  if (miss.length > 12) note(`… 还有 ${miss.length - 12} 档缺失`);
  for (const m of sizeBad.slice(0, 12)) bad(`包内大小不符 ${m}`);
  if (sizeBad.length > 12) note(`… 还有 ${sizeBad.length - 12} 档大小不符`);
  for (const m of noHash.slice(0, 5)) bad(`无法定位 ${m}`);
  if (miss.length) failLocal.push(`pkg audio missing ${miss.length}`);
  if (sizeBad.length) failLocal.push(`pkg audio size ${sizeBad.length}`);
  if (noHash.length) failLocal.push(`pkg audio no hash ${noHash.length}`);
  if (!miss.length && !sizeBad.length && !noHash.length) ok(`包内 native 音频 ${found}/${list.length} 档存在且字节一致`);

  const compiled = findCompiledJsonByMarker(bundleDir, '"audio-manifest"');
  if (!compiled) {
    bad('包里找不到编译后的 audio-manifest 资产（bundle.load("audio-manifest") 会失败 → 运行时静默缺档）');
    failLocal.push('pkg compiled manifest');
  } else {
    try {
      const payload = manifestPayload(compiled);
      if (!payload) {
        bad(`编译后的 audio-manifest 里没有 files/count：${path.relative(pkg, compiled)}`);
        failLocal.push('pkg manifest payload');
      } else {
        const pfiles = payload.files || {};
        const lost = Object.keys(manifest.files || {}).filter((k) => !pfiles[k]);
        if (Number(payload.count) !== list.length || lost.length) {
          bad(`包内编译清单元数据不全：count=${payload.count}/${list.length}，缺键 ${lost.slice(0, 8).join(',') || '无'}`);
          failLocal.push('pkg manifest coverage');
        } else {
          ok(`包内编译清单 count=${payload.count}，${list.length} 个键齐全（${path.relative(pkg, compiled)}）`);
        }
      }
    } catch (e) {
      bad(`编译清单解析失败：${e.message}`);
      failLocal.push('pkg manifest parse');
    }
  }
}

// ---------------------------------------------------------------------------
// [2] 代码点名的键都在清单里
// ---------------------------------------------------------------------------
head('[2] 代码点名键覆盖（AudioHost.ts / AudioBus.ts）');
try {
  const host = fs.readFileSync(path.join(ROOT, 'game/cocos/assets/scripts/AudioHost.ts'), 'utf8');
  const bus = fs.readFileSync(path.join(ROOT, 'game/cocos/assets/scripts/AudioBus.ts'), 'utf8');
  const keys = new Set(entries.map(([k]) => k));
  const pad2 = (n) => String(n).padStart(2, '0');

  const magicBlock = /const MAGIC_SFX[\s\S]*?\n};/.exec(host);
  const magics = [...(magicBlock ? magicBlock[0] : '').matchAll(/'m(\d{3})snd\d{2}'/g)].map((m) => m[1]);
  const preloadBlock = /const BATTLE_PRELOAD[\s\S]*?\];/.exec(host);
  const preloads = [...(preloadBlock ? preloadBlock[0] : '').matchAll(/'([a-z0-9]+)'/g)].map((m) => m[1]);
  const terrainBlock = /const TERRAIN_TRACK[\s\S]*?\];/.exec(host);
  const terrains = [...(terrainBlock ? terrainBlock[0] : '').matchAll(/\d+/g)].map((m) => Number(m[0]));
  const busNames = [...bus.matchAll(/emitSfx\(\s*'([a-zA-Z0-9_]+)'/g)].map((m) => m[1]);
  const fixedTracks = ['04'];

  const wantSfx = new Set([...preloads, ...busNames]);
  for (const m of magics) wantSfx.add(`m${m}snd01`);
  const wantBgm = new Set([...terrains.map(pad2), ...fixedTracks]);

  const missSfx = [...wantSfx].filter((n) => !keys.has(`audio/sfx/${n}`));
  const missBgm = [...wantBgm].filter((n) => !keys.has(`audio/bgm/${n}`));
  if (wantSfx.size === 0) { bad('没从 AudioHost.ts 解析出任何音效名（正则失效？）'); failLocal.push('keys parse'); }
  if (wantBgm.size === 0) { bad('没从 AudioHost.ts 解析出任何 BGM 曲号（正则失效？）'); failLocal.push('keys parse bgm'); }
  if (missSfx.length) { bad(`音效 ${wantSfx.size - missSfx.length}/${wantSfx.size}，缺：${missSfx.join(', ')}`); failLocal.push(`sfx missing ${missSfx.length}`); }
  else if (wantSfx.size) ok(`音效 ${wantSfx.size}/${wantSfx.size} 命中`);
  if (missBgm.length) { bad(`BGM ${wantBgm.size - missBgm.length}/${wantBgm.size}，缺：${missBgm.join(', ')}`); failLocal.push(`bgm missing ${missBgm.length}`); }
  else if (wantBgm.size) ok(`BGM ${wantBgm.size}/${wantBgm.size} 命中（${[...wantBgm].sort().join(',')}）`);
  const unused = [...keys].filter((k) => (k.startsWith('audio/bgm/') ? !wantBgm.has(k.slice(10)) : !wantSfx.has(k.slice(10))));
  note(`清单 ${keys.size} 键，其中 ${unused.length} 键未被代码点名（正常：原作曲库比当前剧情多）`);
} catch (e) {
  bad(`读 AudioHost.ts / AudioBus.ts 失败：${e.message}`);
  failLocal.push('keys read');
}

// ---------------------------------------------------------------------------
// [3] 包内 base（raw 副本 + Cocos 编译后的 import json）
// ---------------------------------------------------------------------------
function findBundleDir(pkg) {
  const cands = [
    path.join(pkg, 'subpackages', 'res'),
    path.join(pkg, 'assets', 'bundles', 'res'),
    path.join(pkg, 'assets', 'res'),
    path.join(pkg, 'res'),
  ];
  for (const c of cands) {
    if (!fs.existsSync(c)) continue;
    const hasConfig = fs.readdirSync(c).some((n) => /^config\..*\.json$/.test(n));
    if (hasConfig) return c;
  }
  return '';
}

function findCompiledAsset(bundleDir) {
  const metaPath = path.join(ROOT, 'game/cocos/assets/bundles/res/audio-remote.json.meta');
  if (fs.existsSync(metaPath)) {
    try {
      const uuid = JSON.parse(fs.readFileSync(metaPath, 'utf8')).uuid;
      if (uuid) {
        const dir = path.join(bundleDir, 'import', uuid.slice(0, 2));
        if (fs.existsSync(dir)) {
          const hit = fs.readdirSync(dir).filter((n) => n.startsWith(uuid) && n.endsWith('.json'));
          if (hit.length) return path.join(dir, hit[0]);
        }
      }
    } catch { /* 回退到扫描 */ }
  }
  // 回退：扫描 import\**\*.json（命中最先一个）
  const importDir = path.join(bundleDir, 'import');
  if (!fs.existsSync(importDir)) return '';
  const stack = [importDir];
  let scanned = 0;
  while (stack.length) {
    const d = stack.pop();
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) { stack.push(p); continue; }
      if (!ent.name.endsWith('.json')) continue;
      if (++scanned > 30000) return '';
      try {
        if (fs.readFileSync(p, 'utf8').includes('"audio-remote"')) return p;
      } catch { /* 跳过坏文件 */ }
    }
  }
  return '';
}

function baseFromCompiled(file) {
  // 资产结构：[1,0,0,[types],…,[[0,"audio-remote",{...}]],…]；递归找带 base 字段的对象
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const seen = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object' || seen.has(node)) return null;
    seen.add(node);
    if (typeof node.base === 'string') return node;
    for (const v of (Array.isArray(node) ? node : Object.values(node))) {
      const hit = walk(v);
      if (hit) return hit;
    }
    return null;
  };
  const obj = walk(data);
  return obj ? obj.base : null;
}

if (opt.pkg) {
  head(`[3] 包内 base（${path.relative(ROOT, path.resolve(opt.pkg))}）`);
  const pkg = path.resolve(opt.pkg);
  const bundleDir = findBundleDir(pkg);
  if (!bundleDir) {
    bad('包里找不到 res bundle 目录（subpackages\\res / assets\\bundles\\res 都没有 config.*.json）');
    failLocal.push('bundle dir');
  } else {
    note(`bundle: ${path.relative(pkg, bundleDir)}`);
    const rawPath = path.join(bundleDir, 'audio-remote.json');
    let rawBase = null;
    if (fs.existsSync(rawPath)) {
      try { rawBase = JSON.parse(fs.readFileSync(rawPath, 'utf8')).base ?? null; }
      catch (e) { bad(`audio-remote.json 不是合法 JSON：${e.message}`); failLocal.push('raw parse'); }
    }
    if (rawBase === null && expectedBase === '') {
      ok(localMode
        ? '包内没有 audio-remote.json（纯本地播放，不覆盖 CDN）'
        : '包内 audio-remote.json 不存在（base 为空时不写该文件，运行时静音）');
    } else if (rawBase === null) {
      bad('包内缺 audio-remote.json：base 注入没生效');
      failLocal.push('raw missing');
    } else if (String(rawBase).replace(/\/+$/, '') !== expectedBase) {
      bad(`raw audio-remote.json base=${JSON.stringify(rawBase)}，期望 ${JSON.stringify(expectedBase)}`);
      failLocal.push('raw base mismatch');
    } else {
      ok(`raw audio-remote.json base=${rawBase || '(空)'}`);
    }

    const compiled = findCompiledAsset(bundleDir);
    if (!compiled) {
      bad('找不到 Cocos 编译后的 audio-remote 资产（import json）—— 运行时 bundle.load 读的是它');
      failLocal.push('compiled missing');
    } else {
      try {
        const cb = baseFromCompiled(compiled);
        const rel = path.relative(pkg, compiled);
        if (cb === null) {
          bad(`编译资源里没有 base 字段：${rel}`);
          failLocal.push('compiled no base');
        } else if (String(cb).replace(/\/+$/, '') !== expectedBase) {
          bad(`编译资源 base=${JSON.stringify(cb)}，期望 ${JSON.stringify(expectedBase)}（${rel}）`);
          failLocal.push('compiled base mismatch');
        } else {
          ok(`编译资源 base=${cb || '(空)'}（${rel}）`);
        }
      } catch (e) {
        bad(`编译资源解析失败：${e.message}`);
        failLocal.push('compiled parse');
      }
    }
  }
}

// ---------------------------------------------------------------------------
// [4] 远端 HEAD 探测
// ---------------------------------------------------------------------------
if (localMode) {
  head('[4] 远端可达');
  note('本地包跳过远端检查：默认一首都不访问网络');
  if (normBase) note(`--base 对本地包不生效（包内 56k 与 CDN 源文件字节不同，HEAD 对比只会假红）：${normBase}`);
} else if (!normBase) {
  head('[4] 远端可达');
  console.log('[warn] audio base 未设置，包内静音');
  note('要上线 CDN：出包时传 -AudioBase <url>，或改 assets\\bundles\\res\\audio-remote.json 后重出包');
  note('拿到 base 后复跑：node tools/check_audio_cdn.mjs --base <url>');
} else if (normBase) {
  head(`[4] 远端 HEAD（${normBase}，并发 ≤${opt.concurrency}）`);
  const targets = entries.map(([k, v]) => ({ rel: String(v.path), bytes: Number(v.bytes), url: `${normBase}/${v.path}` }));
  targets.push({ rel: 'audio-manifest.json', bytes: fs.existsSync(manifestPath) ? fs.statSync(manifestPath).size : 0, url: `${normBase}/audio-manifest.json` });
  const queue = targets.slice();
  let done = 0;
  const results = [];
  const worker = async () => {
    while (queue.length) {
      const t = queue.shift();
      let status = 0;
      let len = null;
      let error = '';
      try {
        const r = await fetch(t.url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(opt.timeout) });
        status = r.status;
        const cl = r.headers.get('content-length');
        len = cl === null ? null : Number(cl);
      } catch (e) {
        error = e?.name === 'TimeoutError' ? `超时 >${opt.timeout}ms` : (e?.cause?.message || e?.message || String(e));
      }
      results.push({ ...t, status, len, error });
      if (++done % 25 === 0) console.log(`  … ${done}/${targets.length}`);
    }
  };
  await Promise.all(Array.from({ length: opt.concurrency }, worker));

  const missing = results.filter((r) => r.status !== 200);
  const mismatch = results.filter((r) => r.status === 200 && (r.len === null || r.len !== r.bytes));
  const okay = results.length - missing.length - mismatch.length;
  if (missing.length) {
    bad(`缺失 / 非 200：${missing.length} 档`);
    for (const m of missing.slice(0, 20)) note(`${m.rel}  HTTP ${m.status}${m.error ? `（${m.error}）` : ''}`);
    if (missing.length > 20) note(`… 还有 ${missing.length - 20} 档`);
  }
  if (mismatch.length) {
    bad(`大小不符 / 无法核对：${mismatch.length} 档`);
    for (const m of mismatch.slice(0, 20)) note(m.len === null ? `${m.rel}  200 但没有 Content-Length` : `${m.rel}  期望 ${m.bytes} 实际 ${m.len}`);
    if (mismatch.length > 20) note(`… 还有 ${mismatch.length - 20} 档`);
  }
  if (!missing.length && !mismatch.length) ok(`${results.length}/${targets.length} 档 200 且 Content-Length 一致`);
  if (missing.length || mismatch.length) failRemote.push(`remote missing=${missing.length} mismatch=${mismatch.length}`);
  console.log(`  统计：通过 ${okay}/${results.length}`);
}

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------
head('结果');
const localPass = failLocal.length === 0;
const remotePass = failRemote.length === 0;
if (localPass) ok(`${localMode ? '包内音频（清单/native 落盘/编译清单）' : '本地（清单/覆盖/base 注入）'} 全部通过（${notes.length ? notes.join('; ') : '无告警'}）`);
else bad(`本地：${failLocal.join('; ')}`);
if (localMode) {
  note('远端：本地包不访问网络（默认路径）');
} else if (normBase) {
  if (remotePass) ok('远端：HEAD 全部通过');
  else bad(`远端：${failRemote.join('; ')}`);
} else {
  note('远端：未检查（base 为空）');
}

if (localPass && (remotePass || opt.allowRemoteFail)) {
  if (!remotePass && opt.allowRemoteFail) {
    console.log('[warn] 远端未通过，但构建期 --allow-remote-fail 非阻塞');
    console.log(`[warn] 发布前必须复跑：node tools/check_audio_cdn.mjs --base ${normBase}`);
    console.log('\nRESULT: WARN（本地 PASS / 远端 FAIL）');
    process.exit(0);
  }
  console.log('\nRESULT: PASS');
  process.exit(0);
}
if (!localPass) {
  console.log('\nRESULT: FAIL（本地）');
  process.exit(1);
}
console.log('\nRESULT: FAIL（远端）');
process.exit(2);
