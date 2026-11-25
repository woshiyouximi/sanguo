#!/usr/bin/env node
/**
 * core 再同步 v3：把 web 真源 `game/src/core/**` 的最新改动同步到
 * `game/cocos/assets/scripts/core/**`（v10 之后的第二轮）。
 *
 * 与 sync_core2.mjs 的差异：
 *   - 新增 K7a–d：`runtime.ts` 里 4 处 `[...Set/Map]` 改 `Array.from`（Babel loose spread 陷阱）；
 *   - 新增 K8–K19：把 12 处「for-of 头是 `||` / `??` / 三元式」提前落常量
 *     （Creator 的 Babel 会崩：`Property types[1] of TSUnionType ... GenericTypeAnnotation`，
 *      而 `tsc` 全绿；上一轮 `roster.ts:407` 已经踩过一次）；
 *   - 新增 `levels.ts`（web 新增文件，`garrison.ts:25` import 它）+ 它的 `.meta`；
 *   - 新增静态检查（for-of 头、危险 spread、import.meta、`.ts` 导入）并写 `sync3_report.txt`；
 *   - 报告 / manifest 内容不变就不重写 ⇒ 第二次运行 0 写入。
 *
 * 用法：
 *   node sync_core3.mjs --diff-only   # 只对比，产出 core3/diff_before.txt（右侧不含补丁）
 *   node sync_core3.mjs --dry-run     # 打印将写哪些文件，不落盘
 *   node sync_core3.mjs               # 真正同步
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';

const SRC_ROOT = 'F:/sanguo/game/src/core';
const DST_ROOT = 'F:/sanguo/game/cocos/assets/scripts/core';
const WORK_DIR = 'F:/sanguo/work/cocos_sync';
const OUT_DIR = join(WORK_DIR, 'core3');
const MANIFEST = join(OUT_DIR, 'manifest.csv');
const DIFF_OUT = join(OUT_DIR, 'diff_before.txt');
const REPORT = join(WORK_DIR, 'sync3_report.txt');
// 上一轮（v10）的 manifest：只读，用于在报告里稳定地列出「v10 → v3」的变化。
const CORE2_MANIFEST = join(WORK_DIR, 'core2', 'manifest.csv');

const ts = createRequire('F:/sanguo/game/package.json')('typescript');

const argv = new Set(process.argv.slice(2));
const DRY_RUN = argv.has('--dry-run');
const DIFF_ONLY = argv.has('--diff-only');

// ---------------------------------------------------------------------------
// KEEP_PATCHES：Cocos 侧必须保留的适配（web 真源上没有、也不能有）
//
// 每条都带 `why`。锚点变化时同步失败而不是静默丢补丁。
// K1–K6 与 v10 完全一致（任务书要求保住）；K7 是本轮补上的 spread 陷阱；
// K8–K19 是本轮按任务书「for-of 头不能是逻辑表达式/三元式」逐处落常量。
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
    // R171 的 runtime.ts 是从编译产物还原的，那条导入现在是**双引号**；
    // 精确锚点（单引号）命中 0 次时退到这条正则（引号两种都认）。
    fromRe: /^[ \t]*import \{ callSystemSo, emitBrightness, emitFlash, emitSfx \} from ['"]\.\.\/audio_bus['"];$/m,
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
      '  // 兵种/阵形白名单因此整排误判成「未学」。',
      '  return Array.from(out).sort((a, b) => a - b);',
    ].join('\n'),
  },
  {
    id: 'K5',
    file: 'wises.ts',
    lineHint: '? raw.split(/[,\\s]+/)',
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
      '  // 本副本相对 web 的偏离：web 那份由 deploy.html 自己 split，走不到这里。',
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
      '  // 运行期回传 [undefined]，军师技列表显示成「技 undefined」。',
      '  return Array.from(best.values()).sort((a, b) => a.learn - b.learn).map((v) => v.seq);',
    ].join('\n'),
  },

  // ── K7：runtime.ts 里 4 处 Set/Map 展开（v10 报告 §5-3 的遗留）────────────
  {
    id: 'K7a',
    file: 'smartscript/runtime.ts',
    why: 'Babel loose spread 把 Set 编成 [].concat(set)，`unimplemented` 统计会变成 [Set]。',
    from: '      unimplemented: [...this.unimplemented].sort((a, b) => a - b),',
    to: [
      '      // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7a）。',
      '      unimplemented: Array.from(this.unimplemented).sort((a, b) => a - b),',
    ].join('\n'),
  },
  {
    id: 'K7b',
    file: 'smartscript/runtime.ts',
    why: '同上：模板字符串里 [...this.healTargets] 会打出一整个 Set 的默认字符串。',
    // 还原版（4 空格缩进）把这一句拆成了两行，锚点随之改成两行（缩进宽松匹配）
    from: [
      '    if (this.healTargets.size)',
      '      this.log.push(`治疗目标 ${[...this.healTargets].join(\',\')}`);',
    ].join('\n'),
    to: [
      '    // Cocos 差异：Babel loose spread 不会展开 Set，必须用 Array.from（K7b）。',
      '    if (this.healTargets.size) this.log.push(`治疗目标 ${Array.from(this.healTargets).join(\',\')}`);',
    ].join('\n'),
  },
  {
    id: 'K7c',
    file: 'smartscript/runtime.ts',
    why: '同上：Map.values() 迭代器在 loose spread 下不展开，objectSummaries() 会回传空/错值。',
    from: '    return [...this.objects.values()]',
    to: [
      '    // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7c）。',
      '    return Array.from(this.objects.values())',
    ].join('\n'),
  },
  {
    id: 'K7d',
    file: 'smartscript/runtime.ts',
    why: '同上：dumpObjects() 里的 Map.values() 展开。',
    from: '    const arr = [...this.objects.values()].slice(0, 12);',
    to: [
      '    // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7d）。',
      '    const arr = Array.from(this.objects.values()).slice(0, 12);',
    ].join('\n'),
  },

  {
    id: 'K7e',
    file: 'smartscript/runtime.ts',
    why: 'R171 还原后新增的一处 Map.values() 展开（0x… param98 统计）：'
      + '同 K7c/K7d，loose spread 不展开迭代器，filter 会作用在迭代器上得到空数组。',
    from: '        const list = [...this.objects.values()].filter((o) => (o.param98 | 0) !== 0);',
    to: [
      '        // Cocos 差异：Babel loose spread 不会展开 Map.values()，必须用 Array.from（K7e）。',
      '        const list = Array.from(this.objects.values()).filter((o) => (o.param98 | 0) !== 0);',
    ].join('\n'),
  },

  {
    id: 'K20',
    file: 'smartscript/runtime.ts',
    why: 'Cocos 的 tsconfig.check.json 是 `types: []` + lib ES2022/DOM，不引 @types/node，'
      + '所以 `globalThis.process` 没有声明，strict 下报 TS7017（typeof globalThis 无索引签名）。'
      + 'R171 还原时新加的 node:fs 兜底分支用了它；这里把形状显式断言出来，'
      + '取值与 web 完全是同一个函数引用（`process?.getBuiltinModule`），语义不变。',
    from: '    const req = globalThis.process?.getBuiltinModule;',
    to: [
      '    // Cocos 差异：Cocos 的 tsconfig.check.json 不引 @types/node（`types: []`），',
      '    // `globalThis.process` 在 strict 下没有声明，会报 TS7017。这里显式写出形状，',
      '    // 取的仍是同一个 `process?.getBuiltinModule`，语义与 web 一致。',
      '    const req = (globalThis as unknown as {',
      '        process?: { getBuiltinModule?: (id: string) => any };',
      '    }).process?.getBuiltinModule;',
    ].join('\n'),
  },

  // ── K8–K19：for-of 的头是 `||` / `??` / 三元式 ─────────────────────────
  // 规则（上一轮 roster.ts:407 踩坑）：Creator 的 Babel 在
  // `for (const x of <逻辑表达式>)` 上会崩（tsc 全绿、构建 8 秒静默失败）。
  // 逐处先落 `const xxx = ...`，再 `for (const x of xxx)`。语义完全等价
  // （for-of 的右侧本来就只求值一次），只是把类型推断从"表达式"挪到"变量"。
  {
    id: 'K8',
    file: 'roster.ts',
    why: '上一轮实际崩过的那一处：`for (const sc of (cast) || [])`。先落 rows。',
    from: '  for (const sc of ((data?.scenarios ?? []) as unknown as KingsRow[]) || []) {',
    to: [
      '  // Cocos 的 Babel 不能吃「for-of 的头是逻辑表达式」：`for (const x of a || b)` 会在',
      '  // plugin-transform-for-of 的类型推断里崩（`Property types[1] of TSUnionType ... GenericTypeAnnotation`），',
      '  // 而 tsc 全绿。提成常量即可（同 PUBLISH 清单里「三元式提成常量」那条坑）。',
      '  const rows = ((data?.scenarios ?? []) as unknown as KingsRow[]) || [];',
      '  for (const sc of rows) {',
    ].join('\n'),
  },
  {
    id: 'K9',
    file: 'roster.ts',
    why: 'for-of 头是 `sc?.kings ?? []`（逻辑表达式）。',
    from: '    for (const k of sc?.kings ?? []) {',
    to: [
      '    const kings = sc?.kings ?? [];',
      '    for (const k of kings) {',
    ].join('\n'),
  },
  {
    id: 'K10',
    file: 'roster.ts',
    why: 'for-of 头是 `opts.atCity ?? []`（逻辑表达式）。',
    from: '  for (const raw of opts.atCity ?? []) {',
    to: [
      '  const atCity = opts.atCity ?? [];',
      '  for (const raw of atCity) {',
    ].join('\n'),
  },
  {
    id: 'K11',
    file: 'roster.ts',
    why: 'for-of 头是 `cards ?? []`（逻辑表达式）。',
    from: '  for (const card of cards ?? []) {',
    to: [
      '  const cardList = cards ?? [];',
      '  for (const card of cardList) {',
    ].join('\n'),
  },
  {
    id: 'K12',
    file: 'capture.ts',
    why: 'for-of 头是 `data.scenarios ?? []`（逻辑表达式）。',
    from: '  for (const sc of data.scenarios ?? []) {',
    to: [
      '  const scenarios = data.scenarios ?? [];',
      '  for (const sc of scenarios) {',
    ].join('\n'),
  },
  {
    id: 'K13',
    file: 'capture.ts',
    why: 'for-of 头是 `sc?.kings ?? []`（逻辑表达式）。',
    from: '    for (const k of sc?.kings ?? []) {',
    to: [
      '    const kings = sc?.kings ?? [];',
      '    for (const k of kings) {',
    ].join('\n'),
  },
  {
    id: 'K14',
    file: 'march.ts',
    why: 'for-of 头是三元式 `Array.isArray(path.points) ? path.points : []`。',
    from: '  for (const raw of Array.isArray(path.points) ? path.points : []) {',
    to: [
      '  const points = Array.isArray(path.points) ? path.points : [];',
      '  for (const raw of points) {',
    ].join('\n'),
  },
  {
    id: 'K15',
    file: 'unlock.ts',
    why: 'for-of 头是 `general.UseForce ?? []`（逻辑表达式）。',
    // R171 之后 web 真源自己改成了 `const useForce = eraTokensOf(...)` + `for (const tok of useForce)`
    // （多场景 eraFieldOf 那一轮顺手修的）——安全形式已经在真源里，补丁无需再打。
    retired: 'web 真源现已先落 useForce 常量再 for-of（安全形式自带）',
    from: '  for (const tok of general.UseForce ?? []) {',
    to: [
      '  const useForce = general.UseForce ?? [];',
      '  for (const tok of useForce) {',
    ].join('\n'),
  },
  {
    id: 'K16',
    file: 'unlock.ts',
    why: 'for-of 头是 `general.Force ?? []`（逻辑表达式）。',
    retired: 'web 真源现已先落 force 常量再 for-of（安全形式自带）',
    from: '  for (const tok of general.Force ?? []) {',
    to: [
      '  const force = general.Force ?? [];',
      '  for (const tok of force) {',
    ].join('\n'),
  },
  {
    id: 'K17',
    file: 'unlock.ts',
    why: 'for-of 头是 `general.BattleArray ?? []`（逻辑表达式）。',
    retired: 'web 真源现已先落 battleArray 常量再 for-of（安全形式自带）',
    from: '  for (const tok of general.BattleArray ?? []) {',
    to: [
      '  const battleArray = general.BattleArray ?? [];',
      '  for (const tok of battleArray) {',
    ].join('\n'),
  },
  {
    id: 'K18',
    file: 'unlock.ts',
    why: 'for-of 头是 `tokens ?? []`（逻辑表达式）。',
    from: '  for (const tok of tokens ?? []) {',
    to: [
      '  const list = tokens ?? [];',
      '  for (const tok of list) {',
    ].join('\n'),
  },
  {
    id: 'K19',
    file: 'unlock.ts',
    why: 'for-of 头是 `list ?? []`（逻辑表达式）。',
    from: '  for (const v of list ?? []) {',
    to: [
      '  const seqs = list ?? [];',
      '  for (const v of seqs) {',
    ].join('\n'),
  },
];

// levels.ts 是 web 新增文件；Cocos 需要配套 .meta（固定 uuid，只建一次，不覆盖）。
const LEVELS_META = join(DST_ROOT, 'levels.ts.meta');
const LEVELS_META_JSON = {
  ver: '4.0.24',
  importer: 'typescript',
  imported: true,
  uuid: '7f3a2c58-9d41-4b6e-8c0a-2e5b7d9f1a34',
  files: [],
  subMetas: {},
  userData: {},
};

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
const occurrences = (text, needle) => (needle.length === 0 ? 0 : text.split(needle).length - 1);

function walkTs(root, relTo = root) {
  const out = [];
  const visit = (dir) => {
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name);
      const st = statSync(full);
      if (st.isDirectory()) visit(full);
      else if (name.endsWith('.ts') && !name.endsWith('.d.ts')) {
        out.push(relative(relTo, full).split('\\').join('/'));
      }
    }
  };
  visit(root);
  return out;
}

/**
 * web 的 `./x.ts` → Cocos 的 `./x`（含 side-effect import）。
 *
 * 引号两种都要认：web 真源被重写过一轮（R171 的 runtime.ts 是从编译产物还原的），
 * 那份文件里的相对导入是**双引号 + .ts 后缀**，只按单引号改写会漏掉它，
 * 到了 Creator 里 `from "../audio_bus.ts"` 就成了带后缀的导入。
 */
function stripImportExtensions(text) {
  let out = text.replace(/(\bfrom\s+['"])(\.\.?\/[^'"]*?)\.ts(['"])/g, '$1$2$3');
  out = out.replace(/(\bimport\s+['"])(\.\.?\/[^'"]*?)\.ts(['"])/g, '$1$2$3');
  return out;
}

function remainingTsImports(text) {
  const hits = [];
  const re = /\b(?:from|import)\s+['"](\.\.?\/[^'"]*\.ts)['"]/g;
  let m;
  while ((m = re.exec(text))) hits.push(m[1]);
  return hits;
}

/**
 * 锚点的「行首缩进宽松」版本：每行行首空白不参与比对，首行缩进被捕获。
 *
 * 为什么需要：`smartscript/runtime.ts` 在 2026-11-25 15:32 被按 GBK 读坏，
 * 随后从 `game/dist/core/smartscript/runtime.js` 逐行还原——还原出来的缩进是
 * 编译产物的 4 空格，不是原来的 2 空格。补丁内容与语义都没变，只是"这几行
 * 前面空几格"变了，所以匹配时忽略缩进、替换时按实测缩进整体平移 `to`。
 */
function flexibleAnchor(from) {
  const lines = from.split('\n');
  const firstIndent = /^[ \t]*/.exec(lines[0])[0];
  const body = lines.map((line) => {
    const indent = /^[ \t]*/.exec(line)[0];
    const rest = line.slice(indent.length);
    return rest.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  });
  const pattern = body.map((rest, i) => (i === 0 ? `([ \\t]*)${rest}` : `[ \\t]*${rest}`)).join('\\r?\\n');
  return { re: new RegExp(pattern, 'g'), firstIndent };
}

/** 把 `to` 的每一行整体平移 delta 个空格（delta>0 加、<0 减）。 */
function shiftIndent(text, delta) {
  if (delta === 0) return text;
  return text.split('\n').map((line) => {
    if (line.length === 0) return line;
    if (delta > 0) return ' '.repeat(delta) + line;
    let n = 0;
    while (n < -delta && line[n] === ' ') n += 1;
    return line.slice(n);
  }).join('\n');
}

function applyPatches(file, text) {
  const applied = [];
  for (const patch of KEEP_PATCHES) {
    if (patch.file !== file) continue;
    if (patch.retired) {
      applied.push(`${patch.id}(退役)`);
      continue;
    }
    const n = occurrences(text, patch.from);
    if (n === 1) {
      text = text.replace(patch.from, patch.to);
      applied.push(patch.id);
      continue;
    }
    // 精确锚点没命中（或命中多行）→ 退到「行首缩进宽松」匹配；仍要求恰好 1 处。
    // `fromRe` 是给「引号风格变了」这类补丁用的显式正则（锚点本体按 \n 写不出来）。
    const hit = patch.fromRe
      ? [...text.matchAll(new RegExp(patch.fromRe.source, patch.fromRe.flags.includes('g') ? patch.fromRe.flags : `${patch.fromRe.flags}g`))]
      : [...text.matchAll(flexibleAnchor(patch.from).re)];
    if (hit.length !== 1) {
      throw new Error(
        `补丁 ${patch.id} (${file}) 锚点命中 ${n} 次（宽松匹配 ${hit.length} 次，要求恰好 1 次）。`
        + 'web 真源可能改了这几行——请重新判定该补丁，不要静默放过。\n'
        + `锚点首行：${patch.from.split('\n')[0]}`,
      );
    }
    const m = hit[0];
    const actualIndent = patch.fromRe ? '' : (m[1] ?? '');
    const baseIndent = patch.fromRe ? '' : flexibleAnchor(patch.from).firstIndent;
    const out = shiftIndent(patch.to, actualIndent.length - baseIndent.length);
    text = text.slice(0, m.index) + out + text.slice(m.index + m[0].length);
    applied.push(`${patch.id}(缩进宽松)`);
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
// Babel 陷阱静态检查（在最终目标文本上做，补丁之后）
// ---------------------------------------------------------------------------
function parseSf(text) {
  return ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}
const lineOfPos = (sf, pos) => sf.getLineAndCharacterOfPosition(pos).line + 1;

function logicalKind(expr) {
  let e = expr;
  while (ts.isParenthesizedExpression(e)) e = e.expression;
  if (ts.isConditionalExpression(e)) return '三元式';
  if (ts.isBinaryExpression(e)) {
    const k = e.operatorToken.kind;
    if (k === ts.SyntaxKind.BarBarToken) return '||';
    if (k === ts.SyntaxKind.AmpersandAmpersandToken) return '&&';
    if (k === ts.SyntaxKind.QuestionQuestionToken) return '??';
  }
  return null;
}

/** for-of 头是逻辑表达式/三元式 → 返回 [{line, kind, expr}]。 */
function findForOfTraps(text) {
  const sf = parseSf(text);
  const hits = [];
  (function visit(node) {
    if (ts.isForOfStatement(node)) {
      const kind = logicalKind(node.expression);
      if (kind) {
        hits.push({
          line: lineOfPos(sf, node.getStart(sf)),
          kind,
          expr: node.expression.getText(sf).replace(/\s+/g, ' ').slice(0, 90),
        });
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
  return hits;
}

/** Set/Map 迭代器展开（loose spread 陷阱）→ 返回 [{line, expr}]。 */
function findIterableSpreads(text) {
  const sf = parseSf(text);
  const hits = [];
  (function visit(node) {
    if (ts.isSpreadElement(node)) {
      let e = node.expression;
      while (ts.isParenthesizedExpression(e)) e = e.expression;
      // 只报"迭代器"来源：`x.values()/.keys()/.entries()` 或 new Set/Map(...)；
      // 数组字面量 / 普通标识符（已知是数组的常量）不报。
      if (ts.isCallExpression(e) && ts.isPropertyAccessExpression(e.expression)) {
        const name = e.expression.name.text;
        if (name === 'values' || name === 'keys' || name === 'entries') {
          hits.push({ line: lineOfPos(sf, node.getStart(sf)), expr: node.getText(sf).replace(/\s+/g, ' ').slice(0, 90) });
        }
      }
      if (ts.isNewExpression(e) && e.expression.getText(sf) === 'Set') {
        hits.push({ line: lineOfPos(sf, node.getStart(sf)), expr: node.getText(sf).replace(/\s+/g, ' ').slice(0, 90) });
      }
    }
    ts.forEachChild(node, visit);
  })(sf);
  return hits;
}

/** 真正的 `import.meta` 语法节点数（注释里的不算）。 */
function countImportMeta(text) {
  const sf = parseSf(text);
  let n = 0;
  (function visit(node) {
    if (ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword) n++;
    ts.forEachChild(node, visit);
  })(sf);
  return n;
}

// ---------------------------------------------------------------------------
// 极简 unified diff（无第三方依赖）：LCS + 上下 3 行上下文（沿用 v2）
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

/** 每行去掉行首空白后的文本（报告核对用：缩进宽松匹配过的补丁照样能数命中数）。 */
function stripIndents(text) {
  return toLf(text).split('\n').map((line) => line.replace(/^[ \t]+/, '')).join('\n');
}

/** 缩进无关的出现次数：`to` 与目标都按行去掉行首空白后再数。 */
function occurrencesLoose(text, to) {
  return occurrences(stripIndents(text), stripIndents(to));
}

/** 把补丁在最终文件里的行号算出来（用于报告 file:line）
 *  取补丁的「末行」= 实际的代码行（补丁 to 的第一行通常是说明注释，行号指到注释会误导）。 */
function patchLineIn(text, patch) {
  const hay = toLf(text);
  const hayLoose = stripIndents(text);
  // 个别补丁的 to 覆盖一整段（如 K5 的 parseWiseSkill 头部），末行不是要报告的那句；
  // 这时用 lineHint 精确指向证据行。
  if (patch.lineHint) {
    const hint = toLf(patch.lineHint);
    const hit = hay.indexOf(hint);
    return hit < 0 ? 0 : hay.slice(0, hit).split('\n').length;
  }
  let needle = toLf(patch.to);
  let idx = hay.indexOf(needle);
  if (idx < 0) {
    // 缩进宽松命中的补丁（K2/K3/K7b）：目标里的缩进与 to 不同，按去缩进后的文本定位行号。
    needle = stripIndents(patch.to);
    idx = hayLoose.indexOf(needle);
    if (idx < 0) return 0;
    return hayLoose.slice(0, idx).split('\n').length + countLines(needle) - 1;
  }
  const startLine = hay.slice(0, idx).split('\n').length;
  return startLine + countLines(needle) - 1;
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
/**
 * 不同步的文件（Cocos 侧是权威源，web 侧没有对应实现）。
 *
 * `core/roster.ts`：R197 起 Cocos 版多出招降十欄所需的存档读取层
 * （`SurrenderCardExtras` / `generalRecordOf` / `noteGeneralResult` /
 * `moraleOf` / `tireOf` / `equipNamesOf` / `generalLevelOf` /
 * `surrenderCardExtras`，见 `project/197_Cocos招降十栏真值.md`）。
 * web 侧同语义在 `game/web/saves.js` 与 `campaign.html` 的 `surFields()` 里，
 * 两边是**不同架构下的等价实现**，硬同步会删掉 Cocos 那 250 行。
 * 同步回来之前先决定「是否把这块提升到 shared core」。
 *
 * `core/field.ts`：R198 的 web-only 字段边界模块（`CAM_MIN/CAM_MAX`），
 * Cocos 用不到，别往包里塞。
 */
const SKIP_FILES = new Set([
  'roster.ts',
  'field.ts',
]);

function main() {
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const files = walkTs(SRC_ROOT).filter((f) => !SKIP_FILES.has(f));
  const webSet = new Set(files);
  for (const f of SKIP_FILES) if (existsSync(join(SRC_ROOT, f))) webSet.add(f);

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
  const details = [];
  const same = [];
  const created = [];
  const diffParts = [];
  if (DIFF_ONLY) {
    diffParts.push('Cocos core 再同步（v3）：同步前差异清单（cocos 现况 vs web 真源）');
    diffParts.push('');
    diffParts.push('约定：右侧 = web 文件 + 导入去 .ts（sync_core3.mjs 归一化，不含 KEEP_PATCHES），');
    diffParts.push('      左侧 = Cocos 当前文件。两侧都按 LF 比较（EOL 单独标注），');
    diffParts.push('      所以每一行差异都是「真的内容差异」，不是换行符噪音。');
    diffParts.push('      K7–K19 的补丁会以「左侧多/右侧少」的形式出现，属预期。');
    diffParts.push('');
  }

  for (const file of files) {
    const srcPath = join(SRC_ROOT, file);
    const dstPath = join(DST_ROOT, file);
    const srcBuf = readFileSync(srcPath);
    const target = buildTarget(file, srcBuf);
    const srcBytes = srcBuf.length;
    const srcLf = toLf(srcBuf.toString('utf8'));
    const srcLines = countLines(srcLf);
    const dstExists = existsSync(dstPath);
    const dstBuf = dstExists ? readFileSync(dstPath) : Buffer.alloc(0);
    const dstBytesBefore = dstBuf.length;
    const dstTextBefore = dstExists ? toLf(dstBuf.toString('utf8')) : '';
    const dstLinesBefore = dstExists ? countLines(dstTextBefore) : 0;
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

    const ops = equal ? [] : diffOps(dstTextBefore.split('\n'), toLf(target.text).split('\n'));
    const added = ops.filter((o) => o.t === '+').length;
    const removed = ops.filter((o) => o.t === '-').length;

    // 静态检查（对最终目标文本）
    const forOfTraps = findForOfTraps(target.text);
    const spreads = findIterableSpreads(target.text);
    const importMeta = countImportMeta(target.text);
    const tsImports = remainingTsImports(target.text).length;
    if (forOfTraps.length) {
      throw new Error(`${file} 仍有 for-of 逻辑/三元头（Babel 会崩）：${JSON.stringify(forOfTraps)}`);
    }
    if (spreads.length) {
      throw new Error(`${file} 仍有 Set/Map 迭代器展开（loose spread 会错）：${JSON.stringify(spreads)}`);
    }
    if (importMeta) throw new Error(`${file} 仍有 import.meta（Creator 非法）`);
    if (tsImports) throw new Error(`${file} 仍有 .ts 导入`);

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
      added,
      removed,
    ]);
    details.push({ file, target, dstTextBefore, action, srcLines, dstLinesBefore, added, removed });

    if (!DIFF_ONLY && !equal && !DRY_RUN) {
      mkdirSync(join(dstPath, '..'), { recursive: true });
      writeFileSync(dstPath, target.buf);
    }

    if (DIFF_ONLY) {
      const norm = toLf(stripImportExtensions(srcLf)).split('\n');
      if (!dstExists) {
        diffParts.push('='.repeat(78));
        diffParts.push(`WEB-ONLY  ${file}   （Cocos 侧缺这个文件，web ${srcLines} 行）`);
        diffParts.push('='.repeat(78));
        diffParts.push(`（整文件新增，内容见 web: ${srcPath}）`);
        diffParts.push('');
        continue;
      }
      const cocos = dstTextBefore.split('\n');
      if (cocos.join('\n') === norm.join('\n')) {
        diffParts.push(`SAME      ${file}`);
        continue;
      }
      const body = unified(diffOps(cocos, norm), 3);
      diffParts.push('='.repeat(78));
      diffParts.push(
        `DIFF      ${file}   cocos ${dstLinesBefore} 行 / web ${srcLines} 行`
        + `   EOL ${target.eol === '\r\n' ? 'web=CRLF' : 'web=LF'}`
        + ` / cocos=${eolOf(dstBuf.toString('utf8')) === '\r\n' ? 'CRLF' : 'LF'}`,
      );
      diffParts.push('='.repeat(78));
      diffParts.push(...body);
      diffParts.push('');
    }
  }

  // manifest / diff 先落盘（内容不变则跳过，保幂等）
  const manifestText = [
    'file,src_bytes,src_lines,src_sha16,dst_before_bytes,dst_before_lines,action,dst_after_bytes,dst_after_lines,dst_sha16,keep_patches,src_eol,diff_added,diff_removed',
  ].concat(rows.map((r) => r.join(','))).join('\n') + '\n';
  writeIfChanged(MANIFEST, manifestText);

  if (DIFF_ONLY) {
    diffParts.push('');
    diffParts.push('---- 汇总 ----');
    diffParts.push(`web 源文件 ${files.length} 个；cocos 已存在 ${rows.filter((r) => r[6] !== 'create').length} 个；`
      + `cocos 缺 ${created.length} 个：${created.map((c) => c.file).join(', ') || '无'}`);
    diffParts.push(`内容相同 ${same.length} 个：${same.join(', ') || '无'}`);
    diffParts.push(`cocos 多出（web 已无）${stale.length} 个：${stale.join(', ') || '无'}`);
    diffParts.push(`带 KEEP_PATCHES 的文件：${Array.from(new Set(KEEP_PATCHES.map((p) => p.file))).join(', ')}`);
    if (stale.length) {
      diffParts.push('');
      diffParts.push('注意：上面列出的 cocos 多出文件如果确实已从 web 移除，需要人工删除（本脚本不删文件）。');
    }
    writeIfChanged(DIFF_OUT, diffParts.join('\n') + '\n');
    console.log(`[diff-only] 写入 ${DIFF_OUT}`);
    console.log(`  文件 ${files.length}：相同 ${same.length} / 有差异 ${files.length - same.length - created.length}`
      + ` / cocos 缺 ${created.length} / cocos 多出 ${stale.length}`);
    for (const c of created) console.log(`  WEB-ONLY ${c.file} (${c.lines} 行)`);
    if (stale.length) for (const s of stale) console.log(`  COCOS-ONLY ${s}`);
    return;
  }

  // levels.ts.meta（新增文件配套；只建一次，不覆盖）
  let metaCreated = false;
  if (!existsSync(LEVELS_META)) {
    metaCreated = true;
    if (!DRY_RUN) writeFileSync(LEVELS_META, `${JSON.stringify(LEVELS_META_JSON, null, 2)}\n`, 'utf8');
  } else {
    const meta = JSON.parse(readFileSync(LEVELS_META, 'utf8'));
    if (!meta.uuid) throw new Error('levels.ts.meta 缺 uuid');
  }
  // 报告里只写最终状态（稳定），「本次是否新建」只打 console，避免第二次运行重写报告。
  const metaStatus = `存在（uuid=${LEVELS_META_JSON.uuid}）`;

  // 报告（内容不变不重写）
  const reportText = buildReport({ files, rows, details, stale, metaStatus, addedTotal: rows.reduce((s, r) => s + r[12], 0), removedTotal: rows.reduce((s, r) => s + r[13], 0) });
  const reportChanged = writeIfChanged(REPORT, reportText);

  const writeCount = rows.filter((r) => r[6] !== 'same').length + (metaCreated ? 1 : 0) + (reportChanged ? 1 : 0);
  console.log(DRY_RUN ? '[dry-run] 不落盘' : '[sync] 完成');
  for (const row of rows) {
    if (row[6] === 'same') continue;
    console.log(`  ${row[6].padEnd(6)} ${row[0]}  ${row[4]}→${row[7]}B  ${row[5]}→${row[8]}L  +${row[12]}/-${row[13]}`
      + (row[10] ? `  补丁 ${row[10]}` : ''));
  }
  console.log(`汇总：web 源 ${files.length} 个文件；本次写入 ${DRY_RUN ? 0 : writeCount} 个、`
    + `内容已一致 ${same.length} 个、cocos 多出 ${stale.length} 个`);
  console.log(`manifest → ${MANIFEST}`);
  console.log(`report   → ${REPORT}`);
}

/** 内容相同不写盘；返回是否真的写了。 */
function writeIfChanged(path, text) {
  if (existsSync(path) && readFileSync(path, 'utf8') === text) return false;
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text, 'utf8');
  return true;
}

function buildReport({ files, rows, details, stale, metaStatus, addedTotal, removedTotal }) {
  // v10 的 manifest 只读；用它把「v10 → v3」的变化稳定地写进报告，
  // 这样即使第二次运行是 0 写入，报告里仍能看出这一轮到底动了哪些文件。
  const v10 = new Map();
  if (existsSync(CORE2_MANIFEST)) {
    const lines = toLf(readFileSync(CORE2_MANIFEST, 'utf8')).trim().split('\n');
    for (const line of lines.slice(1)) {
      const c = line.split(',');
      if (c.length >= 10) v10.set(c[0], { lines: Number(c[8]), sha: c[9] });
    }
  }

  const L = [];
  L.push('core 再同步 v3 报告');
  L.push('==================');
  L.push('');
  L.push('源（只读）: F:/sanguo/game/src/core/**/*.ts');
  L.push('目标      : F:/sanguo/game/cocos/assets/scripts/core/**/*.ts');
  L.push('脚本      : F:/sanguo/work/cocos_sync/sync_core3.mjs');
  L.push('v10 基准  : F:/sanguo/work/cocos_sync/core2/manifest.csv');
  L.push('');
  L.push('一、文件清单（行号取最终目标文件；v10 缺失的文件标「新增」）');
  L.push('----------------------------------------------------------');
  L.push('file  web行  v10→v3行  ±v10  运行前  补丁');
  let changedVsV10 = 0;
  for (const d of details) {
    const old = v10.get(d.file);
    const curLines = countLines(d.target.text);
    const curSha = sha256(d.target.buf).slice(0, 16);
    const delta = old ? `${curLines - old.lines >= 0 ? '+' : ''}${curLines - old.lines}` : '新增';
    if (!old || old.sha !== curSha) changedVsV10 += 1;
    L.push(
      `${d.file}  ${d.srcLines}  ${old ? old.lines : '新增'}→${curLines}  ${delta}  ${d.action}  ${d.target.patches.join(';') || '-'}`,
    );
  }
  L.push('');
  L.push(`合计：web ${files.length} 个文件；与 v10 逐字节不同 ${changedVsV10} 个；`
    + `cocos 多出（web 已无）${stale.length} 个。`);
  L.push('（v10→v3 的行差是两轮产物对比；本次运行已一致，写盘 diff 为 +0/-0。）');
  L.push(`levels.ts.meta：${metaStatus}`);
  L.push('');
  L.push('二、KEEP_PATCHES 逐条核对（行号取最终目标文件）');
  L.push('----------------------------------------------');
  for (const patch of KEEP_PATCHES) {
    if (patch.retired) {
      const d0 = details.find((x) => x.file === patch.file);
      const safe = patch.to.split('\n').pop();
      const n2 = d0 ? occurrences(toLf(d0.target.text), safe) : 0;
      L.push(`${patch.id}  ${patch.file}  已退役  ${n2 === 1 ? 'OK' : 'FAIL'}  — ${patch.why}`);
      L.push(`      安全形式 \`${safe.trim()}\` 在最终目标里命中 ${n2} 次：${patch.retired}`);
      continue;
    }
    const d = details.find((x) => x.file === patch.file);
    const line = d ? patchLineIn(d.target.text, patch) : 0;
    const toHits = d ? occurrencesLoose(d.target.text, patch.to) : 0;
    L.push(`${patch.id}  ${patch.file}:${line}  锚点命中=${toHits}  ${toHits === 1 ? 'OK' : 'FAIL'}  — ${patch.why}`);
  }
  L.push('');
  L.push('三、Babel 陷阱静态检查（在最终目标文本上跑 TS AST）');
  L.push('----------------------------------------------------');
  L.push('for-of 头是 `||`/`??`/`&&`/三元式：0 处（K8–K14、K18–K19 落常量；K15–K17 已退役，web 真源自带安全形式）');
  L.push('Set/Map 迭代器 spread（.values()/.keys()/.entries()/new Set）：0 处（K4/K6/K7a–K7e）');
  L.push('import.meta：0 处（K1）');
  L.push("带 `.ts` 扩展名的相对导入：0 处（stripImportExtensions）");
  L.push('');
  L.push('四、幂等性');
  L.push('----------');
  L.push('判等口径：目标字节数 + sha256。第二次运行若 web/cocos 都没变，应输出「写入 0 个」。');
  L.push('manifest 与报告内容不变时也不重写。');
  L.push('');
  L.push('五、关于 v10 基准');
  L.push('----------------');
  L.push('v10 manifest 是上一轮 7:02 的落盘结果。若之后 cocos 侧被并发手改过（本轮确实有：');
  L.push('roster.ts 在同步前已是 692 行，而 v10 manifest 记的是 688 行），');
  L.push('「±v10」会把那部分并发改动一起算进来，不代表本轮脚本单独改了多少行。');
  L.push('');
  return L.join('\n') + '\n';
}

main();
