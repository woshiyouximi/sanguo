#!/usr/bin/env node
/**
 * [115_release] 发布自检（静态扫描，不需要浏览器）。
 *
 *   node web/release_check.mjs           # 人类可读
 *   node web/release_check.mjs --json    # 机器可读
 *
 * 退出码：0 = 全部通过（warning 不算失败）；1 = 至少一条 FAIL。
 *
 * 扫的对象是「5 个页面 + 这些页面实际会加载的本地脚本」：
 *   index.html campaign.html city.html deploy.html items.html
 *   + <script src> 指向的文件
 *   + 这些文件（含内联 module）里相对 import 的**闭包**（含 ../dist/** 编译产物）
 * 也就是「玩家打开页面时会真的下载并执行到的代码」。
 *
 * 断言一览（阈值与理由见每条注释）：
 *   C1  发布目录里没有探针页（文件名含 probe 的 .html）
 *   C2  5 个页面不引用任何探针页（xxx_probe.html / probe_xxx.html）
 *   C3  没有 __DEV__ 这种硬编码开关（统一开关只认 ?dev=1）
 *   C4  [?&]dev=1 只出现在 devflags.js；用到 SGDev 的页面必须 <script> 它
 *   C5  每个 <script src> / <link href> 的目标文件存在
 *   C6  相对 ESM import 闭包全部可达（这条就是「dist 里某个 js 被改名」的守卫）
 *   C7  console.log 预算 + 没有 debugger
 *   C8  没有 localhost / 127.0.0.1 硬编码
 *   C9  没有本机绝对路径（代码 0 容忍；只出现在注释里降级为 WARN）
 *   W1  file:// 提及（只是提醒，不算失败）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HERE);
const GAME = path.resolve(HERE, '..');

const PAGES = ['index.html', 'campaign.html', 'city.html', 'deploy.html', 'items.html'];

// console.log 预算：现在实测 6 个页面/脚本 + dist 全是 0 条。
// 留「单文件 ≤2、合计 ≤5」是给上线前临时排查用的余量；超过就说明有人把调试打印留下了。
// 为什么不设 0：真出事时第一个动作就是加一条 log，设 0 只会逼人绕过检查。
// 为什么不更大：一条 log 在发布版里要么泄露内部数据、要么在玩家控制台刷屏。
const LOG_MAX_PER_FILE = 2;
const LOG_MAX_TOTAL = 5;

const read = (p) => fs.readFileSync(p, 'utf8');
const rel = (p) => path.relative(WEB, p).replace(/\\/g, '/');

/** 粗暴但够用的注释剥离：不能剥字符串里的 // （https:// 这种），所以带一个前导字符保护。 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/[^\n]*/g, '$1');
}

/** 取 <script> 块：返回 [{ src|null, body, type }] */
function scriptsOf(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const attrs = m[1] || '';
    const srcM = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(attrs);
    const typeM = /\btype\s*=\s*["']([^"']+)["']/i.exec(attrs);
    out.push({ src: srcM ? srcM[1] : null, body: m[2] || '', type: typeM ? typeM[1].toLowerCase() : '' });
  }
  return out;
}

/** 取 import/export/动态 import 的 specifier。 */
function importsOf(src) {
  const specs = [];
  const code = stripComments(src);
  const stat = /(?:^|[;\s}])(?:import|export)\b([^;'"]*?)['"]([^'"]+)['"]/g;
  let m;
  while ((m = stat.exec(code)) !== null) specs.push(m[2]);
  const dyn = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((m = dyn.exec(code)) !== null) specs.push(m[1]);
  return specs;
}

const isRel = (s) => s.startsWith('./') || s.startsWith('../') || s.startsWith('/');

// ---------------------------------------------------------------- 采集
const pages = new Map();          // abs -> html
for (const name of PAGES) {
  const abs = path.join(WEB, name);
  if (fs.existsSync(abs)) pages.set(abs, read(abs));
}

const entryScripts = new Map();   // abs -> text （页面 <script src> 的本地文件）
const unresolved = [];            // { from, spec }
const missingRefs = [];           // { page, tag, ref }
const visited = new Map();        // abs -> text （import 闭包，含 entryScripts）

function addFile(abs) {
  if (visited.has(abs)) return;
  if (!fs.existsSync(abs)) return;
  const text = read(abs);
  visited.set(abs, text);
  for (const spec of importsOf(text)) {
    if (!isRel(spec)) continue;                      // 裸模块名（'three' 之类）不归本检查管
    const target = path.resolve(path.dirname(abs), spec.split('?')[0].split('#')[0]);
    if (!fs.existsSync(target)) {
      unresolved.push({ from: rel(abs), spec });
      continue;
    }
    if (/\.(m?js)$/i.test(target)) addFile(target);
  }
}

for (const [abs, html] of pages) {
  for (const s of scriptsOf(html)) {
    if (s.src && !/^(https?:|data:|\/\/)/i.test(s.src)) {
      const target = path.resolve(path.dirname(abs), s.src);
      if (!fs.existsSync(target)) {
        missingRefs.push({ page: rel(abs), tag: 'script', ref: s.src });
        continue;
      }
      entryScripts.set(target, read(target));
      addFile(target);
    } else if (!s.src && s.type === 'module') {
      // 内联 module：import 相对 WEB 解析
      for (const spec of importsOf(s.body)) {
        if (!isRel(spec)) continue;
        const target = path.resolve(path.dirname(abs), spec.split('?')[0].split('#')[0]);
        if (!fs.existsSync(target)) {
          unresolved.push({ from: `${rel(abs)} (inline module)`, spec });
          continue;
        }
        if (/\.(m?js)$/i.test(target)) addFile(target);
      }
    }
  }
}

// 被扫的「发布代码」集合：5 个页面 + <script src> + import 闭包
const shipped = new Map();  // abs -> { text, kind }
for (const [abs, html] of pages) shipped.set(abs, { text: html, kind: 'page' });
for (const [abs, text] of entryScripts) shipped.set(abs, { text, kind: 'script' });
for (const [abs, text] of visited) if (!shipped.has(abs)) shipped.set(abs, { text, kind: 'dep' });

// ---------------------------------------------------------------- 断言框架
const results = [];
function check(id, title, fn) {
  const notes = [];
  let ok = true;
  let warn = false;
  const fail = (msg) => { ok = false; notes.push(msg); };
  const note = (msg) => notes.push(msg);
  const soft = (msg) => { warn = true; notes.push(msg); };
  try {
    const r = fn({ fail, note, soft });
    if (r === false) ok = false;
  } catch (err) {
    ok = false;
    notes.push(`检查自身抛错：${err && err.message ? err.message : err}`);
  }
  results.push({ id, title, ok, notes, warn: warn && ok });
}

const count = (text, re) => (text.match(re) || []).length;
const each = (fn) => { for (const [abs, v] of shipped) fn(abs, v.text, v.kind); };

// ---------------------------------------------------------------- C1
check('C1', '发布目录没有探针页（文件名含 probe 的 html）', ({ fail, note }) => {
  const hits = fs.readdirSync(WEB).filter((n) => /probe/i.test(n));
  if (hits.length) fail(`game/web 下还有探针文件：${hits.join(', ')}`);
  else note(`game/web 顶层 ${fs.readdirSync(WEB).length} 个文件，无 probe*`);
});

// ---------------------------------------------------------------- C2
check('C2', '页面不引用探针页（*probe*.html）', ({ fail, note }) => {
  // 只匹配「探针页文件名」，不动 work/bg_align_probe.py 这类注释里的正常引用
  const re = /[A-Za-z0-9_-]*probe[A-Za-z0-9_-]*\.html?/gi;
  let n = 0;
  for (const [abs, html] of pages) {
    for (const m of html.match(re) || []) { fail(`${rel(abs)} 引用了探针页 ${m}`); n += 1; }
  }
  note(`扫描 5 个页面，探针页引用 ${n} 处`);
});

// ---------------------------------------------------------------- C3
check('C3', '没有 __DEV__ 硬编码开关', ({ fail, note }) => {
  let n = 0;
  each((abs, text) => {
    const c = count(text, /__DEV__/g);
    if (c) { fail(`${rel(abs)} 出现 __DEV__ ×${c}`); n += c; }
  });
  note(`__DEV__ 命中 ${n} 处（应为 0：开关只认 ?dev=1）`);
});

// ---------------------------------------------------------------- C4
check('C4', '调试开关唯一化：dev=1 只认 devflags.js', ({ fail, note }) => {
  const devflags = path.join(WEB, 'devflags.js');
  if (!fs.existsSync(devflags)) fail('缺少 game/web/devflags.js（统一开关）');
  else if (!/[?&]dev=1/.test(read(devflags))) fail('devflags.js 里没有 /[?&]dev=1/ 判定');
  let leak = 0;
  each((abs, text) => {
    if (path.resolve(abs) === path.resolve(devflags)) return;
    const c = count(text, /\[\?&\]dev=1/g);
    if (c) { fail(`${rel(abs)} 自己写了 dev=1 判定 ×${c}（应改用 SGDev）`); leak += c; }
  });
  // 用到 SGDev 的页面必须真的加载 devflags.js，否则 shim 退化成"全关"，调试口静默失效
  for (const [abs, html] of pages) {
    if (!/\bSGDev\b/.test(html)) continue;
    if (!/<script[^>]+src=["']\.\/devflags\.js["']/i.test(html)) fail(`${rel(abs)} 用了 SGDev 却没 <script src="./devflags.js">`);
  }
  note(`dev=1 判定泄漏 ${leak} 处（应为 0）`);
});

// ---------------------------------------------------------------- C5
check('C5', '每个 <script src>/<link href> 的目标存在', ({ fail, note }) => {
  let n = 0;
  for (const [abs, html] of pages) {
    for (const tag of html.match(/<(?:script|link)\b[^>]*>/gi) || []) {
      const refM = /\b(?:src|href)\s*=\s*["']([^"']+)["']/i.exec(tag);
      if (!refM) continue;
      const ref = refM[1];
      if (/^(https?:|data:|#|mailto:|\/\/)/i.test(ref)) continue;
      n += 1;
      const target = path.resolve(path.dirname(abs), ref.split('?')[0]);
      if (!fs.existsSync(target)) fail(`${rel(abs)} → ${ref} 不存在`);
    }
  }
  for (const m of missingRefs) fail(`${m.page} → <${m.tag} src="${m.ref}"> 不存在`);
  note(`检查 ${n} 个资源引用`);
});

// ---------------------------------------------------------------- C6
check('C6', '相对 ESM import 闭包全部可达', ({ fail, note }) => {
  for (const u of unresolved) fail(`${u.from} → import '${u.spec}' 找不到文件`);
  if (!unresolved.length) note(`${visited.size} 个 js 文件、import 全部可达（含 ../dist/**）`);
});

// ---------------------------------------------------------------- C7
check('C7', `console.log 预算（单文件 ≤${LOG_MAX_PER_FILE}、合计 ≤${LOG_MAX_TOTAL}）+ 无 debugger`, ({ fail, note }) => {
  let total = 0;
  let dbg = 0;
  each((abs, text) => {
    const c = count(text, /console\.log\(/g);
    total += c;
    if (c > LOG_MAX_PER_FILE) fail(`${rel(abs)} console.log ×${c} > ${LOG_MAX_PER_FILE}`);
    const d = count(text, /\bdebugger\b/g);
    if (d) { fail(`${rel(abs)} 残留 debugger ×${d}`); dbg += d; }
  });
  if (total > LOG_MAX_TOTAL) fail(`console.log 合计 ${total} > ${LOG_MAX_TOTAL}`);
  note(`console.log 合计 ${total} 条、debugger ${dbg} 处；扫描 ${shipped.size} 个文件`);
});

// ---------------------------------------------------------------- C8
check('C8', '没有 localhost / 127.0.0.1 硬编码', ({ fail, note }) => {
  let n = 0;
  each((abs, text) => {
    const c = count(text, /localhost:|127\.0\.0\.1/g);
    if (c) { fail(`${rel(abs)} 命中 ${c} 处`); n += c; }
  });
  note(`命中 ${n} 处（应为 0：发布包要能落在任意机器/域名）`);
});

// ---------------------------------------------------------------- C9
check('C9', '没有本机绝对路径（代码里）', ({ fail, soft, note }) => {
  // 只判「代码」：注释里出现 F:\sanguo 是文档泄漏（会跟着 tsc 进 dist），不影响运行，
  // 但发布包里不该带着开发机的路径 —— 所以代码命中算 FAIL，只剩注释报 WARN 点名。
  const re = /F:\\sanguo|\bfile:\/\/\/[A-Za-z]:/gi;
  const reLine = /F:\\sanguo|file:\/\/\/[A-Za-z]:/i;
  let codeHits = 0;
  const commentHits = [];
  each((abs, text) => {
    const codeC = count(stripComments(text), re);
    if (codeC) { fail(`${rel(abs)} 代码里写死本机路径 ×${codeC}`); codeHits += codeC; }
    const rawC = count(text, re);
    if (rawC > codeC) {
      const lines = text.split('\n').map((s, i) => (reLine.test(s) ? i + 1 : 0)).filter(Boolean);
      commentHits.push(`${rel(abs)}:${lines.join(',')}（注释 ×${rawC - codeC}）`);
    }
  });
  if (!codeHits && commentHits.length) soft(`仅注释中出现（不影响运行，但会跟着 tsc 进 dist）：${commentHits.join('；')}`);
  note(`代码命中 ${codeHits} 处（应为 0）`);
});

// ---------------------------------------------------------------- W1
{
  const notes = [];
  let n = 0;
  each((abs, text) => {
    const c = count(text, /file:\/\//g);
    if (c) { notes.push(`${rel(abs)} 提到 file:// ×${c}（注释/文案，确认不是可点链接即可）`); n += c; }
  });
  results.push({ id: 'W1', title: 'file:// 提及（提醒，不算失败）', ok: true, notes, warn: n > 0 });
}

// ---------------------------------------------------------------- 输出
const failed = results.filter((r) => !r.ok);
const asJson = process.argv.includes('--json');
if (asJson) {
  process.stdout.write(`${JSON.stringify({ ok: failed.length === 0, results }, null, 2)}\n`);
} else {
  const line = (s) => process.stdout.write(`${s}\n`);
  line(`发布自检 release_check —— ${WEB}`);
  line(`扫描范围：${pages.size} 个页面 + ${entryScripts.size} 个 <script src> + import 闭包 → 合计 ${shipped.size} 个文件`);
  line('');
  for (const r of results) {
    const tag = r.ok ? (r.warn ? 'WARN' : 'PASS') : 'FAIL';
    line(`[${tag}] ${r.id}  ${r.title}`);
    for (const n of r.notes) line(`        ${n}`);
  }
  line('');
  const pass = results.length - failed.length;
  line(`结果：${pass} 通过 / ${failed.length} 失败 / ${results.length} 项`);
  line(failed.length === 0 ? 'RELEASE CHECK OK' : `RELEASE CHECK FAILED（${failed.map((r) => r.id).join(', ')}）`);
}
process.exit(failed.length === 0 ? 0 : 1);
