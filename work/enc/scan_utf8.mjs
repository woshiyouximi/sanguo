#!/usr/bin/env node
// 编码守门：扫描项目源码/文档，判定「UTF-8 干净」还是「被 CP936 写坏」。
//
// 判定规则（R199 事故后定：PS 5.1 的 Set-Content 默认 ANSI/CP936，会把中文写坏成 U+FFFD）：
//   - 含 U+FFFD（>=1 个）                -> BAD
//   - 以 UTF-8 严格解码失败              -> BAD
//   - 带 UTF-8 BOM 的 .ps1               -> 正常（Windows PowerShell 5.1 需要 BOM 才认中文）
//   - 带 UTF-8 BOM 的其它文本文件        -> WARN（.ts/.js/.mjs 尤其不该有；不影响退出码）
//
// 用法：
//   node work/enc/scan_utf8.mjs                       # 扫默认目录（见下方 DEFAULT_ROOTS）
//   node work/enc/scan_utf8.mjs game/src tools         # 只扫给定目录（相对仓库根）
//   node work/enc/scan_utf8.mjs game/src --max=5       # 每个文件最多列 5 处
//   node work/enc/scan_utf8.mjs tools/cocos --include-vendor   # 连 vendored 引擎一起扫
//
// 退出码：0 = 干净（或只有 WARN）；1 = 有 BAD。
// 输出刻意用 ASCII：PS 5.1 控制台默认 GBK，中文输出在管道里会乱码。

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname, sep, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');

const DEFAULT_ROOTS = [
  'game/src',
  'game/web',
  'game/tests',
  'game/cocos/assets/scripts',
  'tools',
  'project',
  'docs',
  'work/fidelity',
];

// 只看这些扩展名（二进制/资源文件不参与判定）
const EXTS = new Set(['.ts', '.js', '.mjs', '.html', '.css', '.json', '.md', '.ps1']);

// 生成物 / 依赖 / 版本库，一律不扫
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', 'dist', 'build', 'out', 'coverage', '.cache']);

// vendored 第三方引擎（2 万多个文件，且不是本项目源码）：默认跳过，--include-vendor 才扫
const VENDOR_PATHS = ['tools/cocos'];

// 显式豁免名单：历史归档件 / 文档里故意展示的反面示例。用 --strict 无视它。
const ALLOWLIST = join(HERE, 'allowlist.json');

// 「UTF-8 字节被当 GBK 读」的典型乱码字：真中文里几乎不会同时出现 3 个以上。
// 这类文件是「合法 UTF-8 但内容是垃圾」，U+FFFD 查不出来，只能靠字面特征报警。
const MOJIBAKE_MARKERS = ['锛', '銆', '鈥', '￠', '锝', '銉', '鍜', '鍙', '鏄', '鐨', '璁', '缃', '鏍', '獙'];

const FFFD = '\uFFFD';
const BOM = [0xef, 0xbb, 0xbf];

function parseArgs(argv) {
  const opts = { dirs: [], max: 20, includeVendor: false, quiet: false, strict: false };
  for (const a of argv) {
    if (a === '-h' || a === '--help') {
      printHelp();
      process.exit(0);
    } else if (a.startsWith('--max=')) {
      opts.max = Math.max(1, parseInt(a.slice(6), 10) || 20);
    } else if (a === '--include-vendor') {
      opts.includeVendor = true;
    } else if (a === '--quiet') {
      opts.quiet = true;
    } else if (a === '--strict') {
      opts.strict = true;
    } else if (a.startsWith('-')) {
      console.error(`unknown option: ${a}`);
      process.exit(2);
    } else {
      opts.dirs.push(a);
    }
  }
  if (opts.dirs.length === 0) {
    opts.dirs = DEFAULT_ROOTS.slice();
    opts.explicit = false;
  } else {
    opts.explicit = true;
  }
  return opts;
}

function printHelp() {
  console.log('scan_utf8.mjs - encoding gate (U+FFFD / invalid UTF-8 / BOM)');
  console.log('');
  console.log('  node work/enc/scan_utf8.mjs [dirs...] [--max=N] [--include-vendor] [--strict] [--quiet]');
  console.log('');
  console.log('  default roots: ' + DEFAULT_ROOTS.join(', '));
  console.log('  extensions   : ' + [...EXTS].join(' '));
  console.log('  allowlist    : work/enc/allowlist.json (--strict ignores it)');
  console.log('  exit code    : 0 clean / 1 BAD found');
}

/**
 * 读豁免名单。格式：{ entries: [{ path, maxHits, reason }] }
 * reason 为空直接拒绝加载整张表 —— 豁免必须写明为什么。
 */
function loadAllowlist(file) {
  const map = new Map();
  if (!existsSync(file)) return map;
  let data;
  try {
    data = JSON.parse(readFileSync(file, 'utf8'));
  } catch (e) {
    console.error(`allowlist unreadable (${e.message}); treating as empty`);
    return map;
  }
  for (const ent of data.entries || []) {
    if (!ent || !ent.path) continue;
    if (!ent.reason || !String(ent.reason).trim()) {
      console.error(`allowlist: entry "${ent.path}" has no reason -> ignored`);
      continue;
    }
    const maxHits = ent.maxHits === null || ent.maxHits === undefined ? null : Number(ent.maxHits);
    map.set(String(ent.path).split('\\').join('/'), { maxHits, reason: String(ent.reason) });
  }
  return map;
}

/** 找所有 U+FFFD 的字符下标。 */
function indexOfAll(text, needle) {
  const hits = [];
  let from = 0;
  for (;;) {
    const idx = text.indexOf(needle, from);
    if (idx < 0) return hits;
    hits.push(idx);
    from = idx + 1;
  }
}

/** 递归收集待扫文件（确定性顺序：字典序遍历）。vendorAbs 里的目录整棵跳过。 */
function collect(absDir, out, vendorAbs) {
  if (vendorAbs && vendorAbs.some((v) => absDir === v || absDir.startsWith(v + sep))) return;
  let entries;
  try {
    entries = readdirSync(absDir, { withFileTypes: true });
  } catch (e) {
    out.push({ error: e.code || String(e), path: absDir });
    return;
  }
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const ent of entries) {
    const p = join(absDir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      collect(p, out, vendorAbs);
    } else if (ent.isFile()) {
      if (EXTS.has(extname(ent.name).toLowerCase())) out.push({ file: p });
    }
  }
}

function hasBom(buf) {
  return buf.length >= 3 && buf[0] === BOM[0] && buf[1] === BOM[1] && buf[2] === BOM[2];
}

/**
 * 严格校验 UTF-8，返回所有非法序列的起始字节偏移（最多 limit 个）。
 * 不用 TextDecoder 的 fatal：它在第一个错处就抛，拿不到「一共有几处」。
 */
function invalidUtf8Offsets(buf, limit) {
  const bad = [];
  let i = 0;
  const n = buf.length;
  while (i < n) {
    const b = buf[i];
    if (b < 0x80) {
      i += 1;
      continue;
    }
    let need;
    let min;
    let max;
    if (b >= 0xc2 && b <= 0xdf) {
      need = 1;
      min = 0x80;
      max = 0xbf;
    } else if (b >= 0xe0 && b <= 0xef) {
      need = 2;
      // 排除过长编码 / 代理区 / 超出 U+FFFF 的 e0 80 / ed a0
      min = b === 0xe0 ? 0xa0 : 0x80;
      max = b === 0xed ? 0x9f : 0xbf;
    } else if (b >= 0xf0 && b <= 0xf4) {
      need = 3;
      min = b === 0xf0 ? 0x90 : 0x80;
      max = b === 0xf4 ? 0x8f : 0xbf;
    } else {
      bad.push(i);
      i += 1;
      if (bad.length >= limit) return bad;
      continue;
    }
    if (i + need >= n) {
      bad.push(i);
      i += 1;
      if (bad.length >= limit) return bad;
      continue;
    }
    let ok = true;
    if (buf[i + 1] < min || buf[i + 1] > max) ok = false;
    for (let k = 2; ok && k <= need; k++) {
      const c = buf[i + k];
      if (c < 0x80 || c > 0xbf) ok = false;
    }
    if (!ok) {
      bad.push(i);
      i += 1;
      if (bad.length >= limit) return bad;
      continue;
    }
    i += need + 1;
  }
  return bad;
}

/** 字节偏移 -> {line, col}（col 按字节算；只在解码失败时用）。 */
function posOfByte(buf, off) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < off; i++) {
    if (buf[i] === 0x0a) {
      line += 1;
      lastNl = i;
    }
  }
  return { line, col: off - lastNl };
}

/** 字符下标 -> {line, col}（col 按码点算）。 */
function posOfChar(text, idx) {
  let line = 1;
  let lastNl = -1;
  for (let i = 0; i < idx; i++) {
    if (text.charCodeAt(i) === 0x0a) {
      line += 1;
      lastNl = i;
    }
  }
  return { line, col: idx - lastNl };
}

function rel(p) {
  const r = relative(ROOT, p);
  return r.split(sep).join('/');
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const vendorAbs = opts.includeVendor ? [] : VENDOR_PATHS.map((v) => resolve(ROOT, v));
  const targets = [];
  const missing = [];
  for (const d of opts.dirs) {
    const abs = resolve(ROOT, d);
    if (!existsSync(abs)) {
      missing.push(d);
      console.error(`skip (not found): ${d}`);
      continue;
    }
    const vend = vendorAbs.find((v) => abs === v || abs.startsWith(v + sep));
    if (vend) {
      if (!opts.quiet) console.log(`skip (vendor, --include-vendor to scan): ${rel(vend)}`);
      continue;
    }
    targets.push(abs);
  }

  // 显式点名的目录不存在 -> 直接失败。否则 `-Scope gam/src` 这种手误会让门禁假绿。
  if (missing.length > 0 && opts.explicit) {
    console.error(`error: scope not found: ${missing.join(', ')} (0 files would be scanned -> refusing to pass)`);
    process.exit(2);
  }

  const files = [];
  for (const abs of targets) {
    const st = statSync(abs);
    if (st.isDirectory()) collect(abs, files, vendorAbs);
    else if (EXTS.has(extname(abs).toLowerCase())) files.push({ file: abs });
  }

  let badFiles = 0;
  let badHits = 0;
  let allowedFiles = 0;
  let allowedHits = 0;
  let warnFiles = 0;
  let clean = 0;
  const allowMap = loadAllowlist(ALLOWLIST);
  const lines = [];

  for (const item of files) {
    if (item.error) {
      lines.push(`ERROR ${rel(item.path)}  ${item.error}`);
      continue;
    }
    const rp = rel(item.file);
    let buf;
    try {
      buf = readFileSync(item.file);
    } catch (e) {
      lines.push(`ERROR ${rp}  ${e.code || e.message}`);
      continue;
    }
    const ext = extname(item.file).toLowerCase();

    if (hasBom(buf)) {
      if (ext === '.ps1') {
        // 正常：PS 5.1 读无 BOM 的 UTF-8 会按 GBK 解，中文全坏
      } else {
        warnFiles += 1;
        lines.push(`WARN ${rp}:1:1  UTF-8 BOM on ${ext} (only .ps1 needs it)`);
      }
    }

    // 一次数清坏点：非法 UTF-8 优先（更严重），其次 U+FFFD
    const badOffsets = invalidUtf8Offsets(buf, 1000000);
    const text = buf.toString('utf8');
    const fffdHits = badOffsets.length > 0 ? [] : indexOfAll(text, FFFD);
    const hitCount = badOffsets.length > 0 ? badOffsets.length : fffdHits.length;

    if (hitCount === 0) {
      // 合法 UTF-8 也可能是「UTF-8 字节被当 GBK 读」的乱码（R192 的 gen_expect.corrupt-r192.mjs
      // 就是这样：U+FFFD 为 0，但正文全是「淇濈湡鏍￠獙」）。只 WARN，不判 BAD。
      const moji = MOJIBAKE_MARKERS.filter((c) => text.includes(c));
      if (moji.length >= 3) {
        warnFiles += 1;
        lines.push(`WARN ${rp}:1:1  looks like UTF-8 bytes decoded as GBK (mojibake, ${moji.length} markers)`);
      }
      clean += 1;
      continue;
    }

    // 显式豁免：历史归档件、文档里故意展示的反面示例。仍然打 ALLOW 行，不静默吞掉。
    const allow = opts.strict ? null : allowMap.get(rp);
    if (allow && (allow.maxHits === null || hitCount <= allow.maxHits)) {
      allowedFiles += 1;
      allowedHits += hitCount;
      lines.push(`ALLOW ${rp}  ${hitCount} hits (allowlisted: work/enc/allowlist.json)`);
      continue;
    }

    badFiles += 1;
    badHits += hitCount;
    if (badOffsets.length > 0) {
      for (const off of badOffsets.slice(0, opts.max)) {
        const { line, col } = posOfByte(buf, off);
        const hex = buf[off].toString(16).toUpperCase().padStart(2, '0');
        lines.push(`BAD  ${rp}:${line}:${col}  invalid UTF-8 (byte 0x${hex}, offset ${off})`);
      }
      if (badOffsets.length > opts.max) {
        lines.push(`BAD  ${rp}  ... ${badOffsets.length - opts.max} more invalid bytes not listed (--max=${opts.max})`);
      }
    } else {
      for (const idx of fffdHits.slice(0, opts.max)) {
        const { line, col } = posOfChar(text, idx);
        lines.push(`BAD  ${rp}:${line}:${col}  U+FFFD (${hitCount} in file)`);
      }
      if (fffdHits.length > opts.max) {
        lines.push(`BAD  ${rp}  ... ${fffdHits.length - opts.max} more U+FFFD not listed (--max=${opts.max})`);
      }
    }
  }

  // 顺序：BAD/ALLOW（坏点数多的一方优先展示）在前，WARN 在后
  const badLines = lines.filter((l) => l.startsWith('BAD') || l.startsWith('ERROR'));
  const allowLines = lines.filter((l) => l.startsWith('ALLOW'));
  const warnLines = lines.filter((l) => l.startsWith('WARN'));
  for (const l of badLines) console.log(l);
  for (const l of allowLines) console.log(l);
  for (const l of warnLines) console.log(l);

  const total = files.length;
  const allowed = allowedFiles > 0 ? `, ${allowedFiles} allowlisted / ${allowedHits} hits` : '';
  if (badFiles === 0) {
    console.log(`scan: ${total} files, 0 BAD${allowed}, ${warnFiles} WARN, ${clean} clean -> OK`);
    process.exit(0);
  }
  console.log(`scan: ${total} files, ${badFiles} BAD files / ${badHits} hits${allowed}, ${warnFiles} WARN`);
  console.log('fix: rewrite the file as UTF-8 (read/write/edit or python encoding="utf-8"); do NOT pipe through Set-Content.');
  process.exit(1);
}

main();
