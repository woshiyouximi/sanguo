#!/usr/bin/env node
/**
 * 把 Cocos 的逻辑层从旧 fork 重同步到 web 真源。
 *
 *   web 真源（只读，唯一真相）：F:\sanguo\game\src\core\**\*.ts
 *   Cocos 目标（可写）        ：F:\sanguo\game\cocos\assets\scripts\core\**\*.ts
 *
 * 规则：
 *   1. 逐文件「拷贝 + 两处变换」：
 *      - 导入路径：web 是 `./x.ts`（配 rewriteRelativeImportExtensions），Cocos 的
 *        Creator/tsc 编译链只认无扩展名 `./x` → 统一去掉 `.ts`；
 *      - 适配补丁：KEEP_PATCHES 里的 `from` 必须**恰好出现一次**才算同步成功，
 *        锚点被上游改动时脚本直接报错，避免"悄悄丢了 Cocos 适配"。
 *   2. `size + sha256` 判等：内容相同就不写盘（幂等，第二次运行 0 写入）。
 *   3. 每个文件都记进 `manifest.csv`（含补丁 id、字节数、行数、sha256、动作）。
 *
 * 用法：
 *   node sync_core.mjs --diff-only   # 只对比，产出 diff_before.txt（cocos 现况 vs web 归一化导入后）
 *   node sync_core.mjs --dry-run     # 打印将写哪些文件，不落盘
 *   node sync_core.mjs               # 真正同步
 *
 * 注意：`--diff-only` 的右侧**不打补丁**，这样适配差异（DATA_URL / sound / Array.from …）
 * 会原样出现在 diff 里，供逐条判定「web 新功能」还是「cocos 适配」。
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC_ROOT = 'F:/sanguo/game/src/core';
const DST_ROOT = 'F:/sanguo/game/cocos/assets/scripts/core';
const OUT_DIR = 'F:/sanguo/work/cocos_core';
const MANIFEST = join(OUT_DIR, 'manifest.csv');
const DIFF_OUT = join(OUT_DIR, 'diff_before.txt');

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const DIFF_ONLY = argv.has('--diff-only');

// ---------------------------------------------------------------------------
// KEEP_PATCHES：Cocos 侧必须保留的适配（web 真源上没有、也不能有）
//
// 每条都带 `why`，报告 project/68 §2 逐条引用。锚点变化时同步失败而不是静默丢补丁。
// ---------------------------------------------------------------------------
const KEEP_PATCHES = [
  {
    id: 'K1',
    file: 'smartscript/runtime.ts',
    why: 'Creator 产物是 System.register 函数体，`import.meta` 不是合法语法（rollup 直接判死）；'
      + 'Cocos 走 assets/scripts/shim/host.ts 预加载，DATA_URL 只给同步 XHR / node:fs 兜底用。',
    from: "const DATA_URL = new URL('../../../data/', import.meta.url);",
    to: [
      '/**',
      ' * Cocos 差异（web 那份用 `import.meta.url`，本副本不能有）：Creator 的产物是',
      ' * System.register 包起来的函数体，`import.meta` 不是合法语法（rollup 直接判死）。',
      ' * Cocos 走「预加载」路径（`assets/scripts/shim/host.ts` 已把 SO/数据装好），',
      ' * 这个常量只给下面的同步 XHR / node:fs 兜底分支用，指哪都无所谓。',
      ' */',
      "const DATA_URL = new URL('data/', 'https://cocos.local/');",
    ].join('\n'),
  },
  {
    id: 'K2',
    file: 'smartscript/runtime.ts',
    why: 'Cocos 的音频总线是 assets/scripts/AudioBus.ts（AudioHost 只认这个实例）；'
      + '若指向 truth-copy 的 ../audio_bus，脚本音效会进另一个模块实例，听不见。',
    from: "import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../audio_bus';",
    to: [
      '// Cocos 差异：音频总线在 `assets/scripts/AudioBus.ts`（AudioHost 也只认这个实例），',
      '// 不能指向 `../audio_bus`——那份是 web 真源的副本，另建实例会让脚本音效听不见。',
      "import { callSystemSo, emitBrightness, emitFlash, emitSfx } from '../../AudioBus';",
    ].join('\n'),
  },
  {
    id: 'K3',
    file: 'smartscript/runtime.ts',
    why: 'Cocos AudioBus.SfxInput.unit 只收 Unit 对象（3D 定位用），脚本的 unit 是槽位序号；'
      + 'source/clock 也只有 web 版 audio_bus 认。照旧只送 name/volume/source。',
    from: [
      '    this.soundsEmitted++;',
      '    emitSfx({',
      '      name,',
      '      volume,',
      '      unit,',
      "      source: unit === undefined ? 'syscall:0x301' : 'syscall:0x300',",
      '      clock: this.clockValue,',
      '    });',
    ].join('\n'),
    to: [
      '    this.soundsEmitted++;',
      '    // Cocos 差异：AudioBus.SfxInput 只收 `unit: Unit` 对象（用于 3D 定位），脚本的',
      '    // `unit` 是槽位序号，硬塞会把事件打歪；source/clock 也只有 web 版 audio_bus 认。',
      "    emitSfx({ name, volume, source: 'script' });",
    ].join('\n'),
  },
  {
    id: 'K4',
    file: 'unlock.ts',
    why: 'Creator 的 Babel（plugin-transform-spread loose）把 [...set] 编成 [].concat(set)，'
      + '得到 [Set] 而不是 number[]，兵符/阵法白名单会整排误判「未学」。',
    from: '  return [...out].sort((a, b) => a - b);',
    to: [
      '  // 注意：这里必须写 Array.from，不能写 [...out]。',
      '  // Creator 的 Babel（plugin-transform-spread loose 模式）把 [...set] 编成',
      '  // `[].concat(set)`，Set 不会被展开，运行期得到 [Set] 而不是 number[]，',
      '  // 兵种/阵形白名单因此整排误判成「未学」。这是本副本相对 web 的第 2 处偏离。',
      '  return Array.from(out).sort((a, b) => a - b);',
    ].join('\n'),
  },
  {
    id: 'K5',
    file: 'wises.ts',
    why: 'Cocos 的 generals.json 里 WISESKILL 是整串 "34, 47"（web 的 deploy 页自己 split，'
      + '走不到这里）；web 版 `if (!Array.isArray(raw)) return []` 会让军师技列表全空。',
    from: [
      'export function parseWiseSkill(general: General): Array<[number, number]> {',
      '  const raw = general.WISESKILL;',
      '  if (!Array.isArray(raw)) return [];',
      '  const out: Array<[number, number]> = [];',
      '  for (const row of raw as unknown[]) {',
    ].join('\n'),
    to: [
      'export function parseWiseSkill(general: General): Array<[number, number]> {',
      '  // types.ts 把 WISESKILL 声明成 [number, number][]，实际数据可能是字符串，',
      '  // 所以先按 unknown 取出再判型（否则 typeof 分支会被收窄成 never）。',
      '  const raw = (general as unknown as { WISESKILL?: unknown }).WISESKILL;',
      '  // 数据里 WISESKILL 可能是一整串 "34, 47"（cocos 的 generals.json 就是这样），',
      '  // 也可能是一行一组的数组。字符串先按逗号/空白切成 token 再两两配对。',
      '  // 本副本第 4 处偏离：web 那份由 deploy.html 自己 split，走不到这里。',
      "  const tokens: string[] = typeof raw === 'string'",
      '    ? raw.split(/[,\\s]+/).filter((s) => s.length > 0)',
      '    : [];',
      "  const rows: unknown[] = typeof raw === 'string'",
      '    ? tokens.reduce<string[][]>((acc, tok, i) => {',
      "      if (i % 2 === 0) acc.push([tok]); else acc[acc.length - 1].push(tok);",
      '      return acc;',
      "    }, []).map((pair) => pair.join(','))",
      '    : Array.isArray(raw) ? (raw as unknown[]) : [];',
      '  if (rows.length === 0) return [];',
      '  const out: Array<[number, number]> = [];',
      '  for (const row of rows) {',
    ].join('\n'),
  },
  {
    id: 'K6',
    file: 'wises.ts',
    why: '同 K4：Babel loose spread 把 Map.values() 编成 [].concat(iterator)，'
      + '军师技列表显示成「技 undefined」。',
    from: '  return [...best.values()].sort((a, b) => a.learn - b.learn).map((v) => v.seq);',
    to: [
      '  // 注意：必须写 Array.from，不能写 [...best.values()]——Creator 的 Babel（loose',
      '  // spread）把它编成 `[].concat(iterator)`，迭代器不展开，sort/map 全落在迭代器上，',
      '  // 运行期回传 [undefined]，军师技列表显示成「技 undefined」。本副本第 3 处偏离。',
      '  return Array.from(best.values()).sort((a, b) => a.learn - b.learn).map((v) => v.seq);',
    ].join('\n'),
  },
];

// ---------------------------------------------------------------------------
// 工具
// ---------------------------------------------------------------------------
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const countLines = (text) => {
  if (text.length === 0) return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
};
const eolOf = (text) => (text.includes('\r\n') ? '\r\n' : '\n');
const toLf = (text) => text.replace(/\r\n/g, '\n');
const toEol = (text, eol) => (eol === '\n' ? text : text.replace(/\n/g, eol));

function walkTs(root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) {
        // 只跟 core/ 与其子目录（smartscript），不跟 node_modules 之类
        visit(full);
      } else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
        out.push(relative(SRC_ROOT, full).split('\\').join('/'));
      }
    }
  };
  visit(root);
  return out;
}

/** web 的 `./x.ts` → Cocos 的 `./x`（含 side-effect import）。 */
function stripImportExtensions(text) {
  let out = text.replace(/(\bfrom\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3');
  out = out.replace(/(\bimport\s+')(\.\.?\/[^']*?)\.ts(')/g, '$1$2$3');
  return out;
}

function remainingTsImports(text) {
  const hits = [];
  const re = /\b(?:from|import)\s+'(\.\.?\/[^']*\.ts)'/g;
  let m;
  while ((m = re.exec(text))) hits.push(m[1]);
  return hits;
}

function applyPatches(file, text) {
  const applied = [];
  for (const patch of KEEP_PATCHES) {
    if (patch.file !== file) continue;
    const n = text.split(patch.from).length - 1;
    if (n !== 1) {
      throw new Error(
        `补丁 ${patch.id} (${file}) 锚点命中 ${n} 次（要求恰好 1 次）。`
        + 'web 真源可能改了这几行——请重新判定该补丁，不要静默放过。\n'
        + `锚点首行：${patch.from.split('\n')[0]}`,
      );
    }
    text = text.replace(patch.from, patch.to);
    applied.push(patch.id);
  }
  return { text, applied };
}

/** 生成目标的完整字节内容（补丁 + 导入改写），返回 {buf, text, patches, eol}。 */
function buildTarget(file, srcBuf) {
  const srcText = srcBuf.toString('utf8');
  const eol = eolOf(srcText);
  // 统一按 LF 做变换（补丁锚点写的是 \n），最后再换回源文件的 EOL，避免混两种换行
  let text = stripImportExtensions(toLf(srcText));
  const { text: patched, applied } = applyPatches(file, text);
  text = toEol(patched, eol);
  const left = remainingTsImports(text);
  if (left.length) throw new Error(`${file} 仍有带 .ts 的导入：${left.join(', ')}`);
  return { buf: Buffer.from(text, 'utf8'), text, patches: applied, eol };
}

// ---------------------------------------------------------------------------
// 极简 unified diff（无第三方依赖）：LCS + 上下 3 行上下文
// ---------------------------------------------------------------------------
function diffOps(a, b) {
  const n = a.length;
  const m = b.length;
  let p = 0;
  while (p < n && p < m && a[p] === b[p]) p++;
  let s = 0;
  while (s < n - p && s < m - p && a[n - 1 - s] === b[m - 1 - s]) s++;
  const A = a.slice(p, n - s);
  const B = b.slice(p, m - s);
  const dp = Array.from({ length: A.length + 1 }, () => new Uint32Array(B.length + 1));
  for (let i = A.length - 1; i >= 0; i--) {
    for (let j = B.length - 1; j >= 0; j--) {
      dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  for (let k = 0; k < p; k++) ops.push({ t: ' ', line: a[k] });
  let i = 0;
  let j = 0;
  while (i < A.length && j < B.length) {
    if (A[i] === B[j]) {
      ops.push({ t: ' ', line: A[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: '-', line: A[i] });
      i++;
    } else {
      ops.push({ t: '+', line: B[j] });
      j++;
    }
  }
  while (i < A.length) ops.push({ t: '-', line: A[i++] });
  while (j < B.length) ops.push({ t: '+', line: B[j++] });
  for (let k = n - s; k < n; k++) ops.push({ t: ' ', line: a[k] });
  return ops;
}

function unified(ops, ctx = 3) {
  const lines = [];
  let i = 0;
  while (i < ops.length) {
    if (ops[i].t === ' ') {
      i++;
      continue;
    }
    let start = Math.max(0, i - ctx);
    let end = i;
    // 向后吃掉相邻改动（间隔 <= 2*ctx 合并成一个 hunk）
    let k = i;
    while (k < ops.length) {
      if (ops[k].t !== ' ') {
        end = k;
        k++;
        continue;
      }
      let gap = 0;
      while (k + gap < ops.length && ops[k + gap].t === ' ') gap++;
      if (k + gap < ops.length && gap <= ctx * 2) {
        end = k + gap;
        k = k + gap;
      } else {
        break;
      }
    }
    const last = Math.min(ops.length, end + ctx + 1);
    const aBefore = ops.slice(0, start).filter((o) => o.t !== '+').length;
    const bBefore = ops.slice(0, start).filter((o) => o.t !== '-').length;
    const aLen = ops.slice(start, last).filter((o) => o.t !== '+').length;
    const bLen = ops.slice(start, last).filter((o) => o.t !== '-').length;
    lines.push(`@@ -${aBefore + 1},${aLen} +${bBefore + 1},${bLen} @@`);
    for (let q = start; q < last; q++) lines.push(ops[q].t + ops[q].line);
    i = last;
  }
  return lines;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const files = walkTs(SRC_ROOT);
  const webSet = new Set(files);

  // Cocos 侧多出来的 .ts（web 已经删掉的旧文件）
  const stale = [];
  if (existsSync(DST_ROOT)) {
    const visit = (dir) => {
      for (const name of readdirSync(dir).sort()) {
        const full = join(dir, name);
        const st = statSync(full);
        if (st.isDirectory()) visit(full);
        else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
          const rel = relative(DST_ROOT, full).split('\\').join('/');
          if (!webSet.has(rel)) stale.push(rel);
        }
      }
    };
    visit(DST_ROOT);
  }

  const rows = [];
  const write = [];
  const same = [];
  const created = [];
  const diffParts = [];
  if (DIFF_ONLY) {
    diffParts.push('Cocos core 重同步：同步前差异清单（cocos 现况 vs web 真源）');
    diffParts.push('');
    diffParts.push('约定：右侧 = web 文件 + 导入去 .ts（sync_core.mjs 归一化，不含 KEEP_PATCHES），');
    diffParts.push('      左侧 = Cocos 当前文件。两侧都按 LF 比较（EOL 单独标注），');
    diffParts.push('      所以每一行差异都是「真的内容差异」，不是换行符噪音。');
    diffParts.push('');
  }

  for (const file of files) {
    const srcPath = join(SRC_ROOT, file);
    const dstPath = join(DST_ROOT, file);
    const srcBuf = readFileSync(srcPath);
    const target = buildTarget(file, srcBuf);
    const srcBytes = srcBuf.length;
    const srcLines = countLines(toLf(srcBuf.toString('utf8')));
    const dstExists = existsSync(dstPath);
    const dstBuf = dstExists ? readFileSync(dstPath) : Buffer.alloc(0);
    const dstBytesBefore = dstBuf.length;
    const dstLinesBefore = dstExists ? countLines(toLf(dstBuf.toString('utf8'))) : 0;
    const equal = dstExists
      && dstBytesBefore === target.buf.length
      && sha256(dstBuf) === sha256(target.buf);
    let action;
    if (!dstExists) {
      action = 'create';
      created.push({ file, lines: srcLines });
    } else if (equal) {
      action = 'same';
      same.push(file);
    } else {
      action = 'update';
    }
    if (!DIFF_ONLY && !equal) write.push(file);

    rows.push([
      file,
      srcBytes,
      srcLines,
      sha256(srcBuf).slice(0, 16),
      dstBytesBefore,
      dstLinesBefore,
      action,
      target.buf.length,
      countLines(target.text),
      sha256(target.buf).slice(0, 16),
      target.patches.join(';'),
      target.eol === '\r\n' ? 'CRLF' : 'LF',
    ]);

    if (DIFF_ONLY) {
      const srcLf = toLf(srcBuf.toString('utf8'));
      const norm = toLf(stripImportExtensions(srcLf)).split('\n');
      if (!dstExists) {
        diffParts.push('='.repeat(78));
        diffParts.push(`WEB-ONLY  ${file}   （Cocos 侧缺这个文件，web ${srcLines} 行）`);
        diffParts.push('='.repeat(78));
        diffParts.push(`（整文件新增，内容见 web: ${srcPath}）`);
        diffParts.push('');
        continue;
      }
      const cocos = toLf(dstBuf.toString('utf8')).split('\n');
      if (cocos.join('\n') === norm.join('\n')) {
        diffParts.push(`SAME      ${file}`);
        continue;
      }
      const ops = diffOps(cocos, norm);
      const body = unified(ops, 3);
      diffParts.push('='.repeat(78));
      diffParts.push(
        `DIFF      ${file}   cocos ${dstLinesBefore} 行 / web ${srcLines} 行`
        + `   EOL ${target.eol === '\r\n' ? 'web=CRLF' : 'web=LF'}`
        + ` / cocos=${eolOf(dstBuf.toString('utf8')) === '\r\n' ? 'CRLF' : 'LF'}`,
      );
      diffParts.push('='.repeat(78));
      diffParts.push(...body);
      diffParts.push('');
    } else if (!DRY_RUN && !equal) {
      mkdirSync(join(dstPath, '..'), { recursive: true });
      writeFileSync(dstPath, target.buf);
    }
  }

  const header = [
    'file,src_bytes,src_lines,src_sha16,dst_before_bytes,dst_before_lines,action,dst_after_bytes,dst_after_lines,dst_sha16,keep_patches,src_eol',
  ];
  writeFileSync(MANIFEST, header.concat(rows.map((r) => r.join(','))).join('\n') + '\n', 'utf8');

  if (DIFF_ONLY) {
    diffParts.push('');
    diffParts.push('---- 汇总 ----');
    diffParts.push(`web 源文件 ${files.length} 个；cocos 已存在 ${rows.filter((r) => r[6] !== 'create').length} 个；`
      + `cocos 缺 ${created.length} 个：${created.map((c) => c.file).join(', ') || '无'}`);
    diffParts.push(`内容相同 ${same.length} 个：${same.join(', ') || '无'}`);
    diffParts.push(`cocos 多出（web 已无）${stale.length} 个：${stale.join(', ') || '无'}`);
    diffParts.push(`带 KEEP_PATCHES 的文件：${[...new Set(KEEP_PATCHES.map((p) => p.file))].join(', ')}`);
    if (stale.length) {
      diffParts.push('');
      diffParts.push('注意：上面列出的 cocos 多出文件如果确实已从 web 移除，需要人工删除（本脚本不删文件）。');
    }
    writeFileSync(DIFF_OUT, diffParts.join('\n') + '\n', 'utf8');
    console.log(`[diff-only] 写入 ${DIFF_OUT}`);
    console.log(`  文件 ${files.length}：相同 ${same.length} / 有差异 ${files.length - same.length - created.length}`
      + ` / cocos 缺 ${created.length} / cocos 多出 ${stale.length}`);
    for (const c of created) console.log(`  WEB-ONLY ${c.file} (${c.lines} 行)`);
    if (stale.length) for (const s of stale) console.log(`  COCOS-ONLY ${s}`);
    return;
  }

  console.log(DRY_RUN ? '[dry-run] 不落盘' : '[sync] 已写入');
  for (const row of rows) {
    if (row[6] === 'same') continue;
    console.log(`  ${row[6].padEnd(6)} ${row[0]}  ${row[4]}→${row[7]}B  ${row[5]}→${row[8]}L`
      + (row[10] ? `  补丁 ${row[10]}` : ''));
  }
  console.log(`汇总：web 源 ${files.length} 个文件；本次写入 ${write.length} 个、`
    + `内容已一致 ${same.length} 个、cocos 多出 ${stale.length} 个`);
  console.log(`manifest → ${MANIFEST}`);
}

main();
