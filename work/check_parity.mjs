#!/usr/bin/env node
// 双端合并门禁（R214 起；R215 起按 scope 判红）
//
// 用法：
//   node work\check_parity.mjs                 # 报表 + 真红就 exit 1
//   node work\check_parity.mjs --quiet         # 只打一行总结
//   node work\check_parity.mjs --strict        # optional 条目也判红（兼容旧行为）
//   node work\check_parity.mjs --json=<file>   # 换一份 feature 矩阵（自测用，相对 F:/sanguo 解析）
//   node work\check_parity.mjs --no-core       # 跳过 ① core 单源（自测用）
//
// 两道检查：
//   ① core 单源：game/src/core/** 与 game/cocos/assets/scripts/core/** 必须 0 差异
//      （调 sync_core3.mjs --diff-only，读它的汇总行）
//   ② 功能矩阵：work/parity/features.json 逐条在 Cocos / web 源码里找标记
//
// 每条 feature：{ id, what, scope, cocos?:[{file,re}], web?:[{file,re}], optional?, note? }
// re 用字符串写，脚本自己 new RegExp（避免 JSON 里转义地狱）。
//
// scope 语义（project/215_双端口径与调试开关.md §4）：
//   cocos      正式版功能：Cocos 侧 ✗ → 失败；web 侧 ✗ 只记录，不判红
//   both       双端都必备：任一端 ✗ → 失败
//   web-debug  web 专用调试/取证设施：Cocos 侧按 §3「不搬」（没写 cocos 规则时记为预期 ✗）
//              → 只汇总进「调试项（不判红）」行，永不判红
//   scope 缺省或未知 → 按 cocos 判 + 告警（不静默放行）

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = 'F:/sanguo';
const argv = process.argv.slice(2);
const quiet = argv.includes('--quiet');
const strict = argv.includes('--strict');
const noCore = argv.includes('--no-core');
const SCOPES = new Set(['cocos', 'web-debug', 'both']);

function argValue(name) {
  const eq = argv.find((a) => a.startsWith(`--${name}=`));
  if (eq) return eq.slice(name.length + 3);
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : null;
}

const jsonArg = argValue('json');
const JSON_PATH = jsonArg ? path.resolve(ROOT, jsonArg) : path.join(ROOT, 'work/parity/features.json');

function readFile(rel) {
  try {
    return fs.readFileSync(path.join(ROOT, rel), 'utf8');
  } catch {
    return null;
  }
}

function hit(rule) {
  const src = readFile(rule.file);
  if (src == null) return { ok: false, why: `缺文件 ${rule.file}` };
  const re = new RegExp(rule.re, rule.flags ?? 'm');
  return re.test(src) ? { ok: true } : { ok: false, why: `${rule.file} 未命中 /${rule.re}/` };
}

function coreDiff() {
  try {
    const out = execFileSync(process.execPath, [path.join(ROOT, 'work/cocos_sync/sync_core3.mjs'), '--diff-only'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    const m = /相同 (\d+) \/ 有差异 (\d+) \/ cocos 缺 (\d+) \/ cocos 多出 (\d+)/.exec(out);
    if (!m) return { ok: false, why: '解析不到 sync_core3 汇总行', raw: out.slice(-300) };
    const [, same, stale, missing, extra] = m.map(Number);
    const bad = stale + missing + extra;
    return { ok: bad === 0, same, stale, missing, extra, why: bad ? `core 不同步：差异 ${stale} / cocos 缺 ${missing} / 多出 ${extra}` : '' };
  } catch (err) {
    return { ok: false, why: `sync_core3 跑失败：${String(err.message ?? err).slice(0, 200)}` };
  }
}

const rows = [];

// ① core 单源：脚本内置一行，等价 scope=cocos（不属于 features.json）
if (!noCore) {
  const cd = coreDiff();
  rows.push({
    id: 'core 单源',
    what: '',
    scope: 'cocos',
    cocos: cd,
    web: { ok: true },
    detail: cd.ok ? `${cd.same} 个 core 文件一致` : cd.why,
  });
}

// ② 功能矩阵
let features = [];
let parseError = null;
try {
  features = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  if (!Array.isArray(features)) throw new Error('features json 顶层必须是数组');
} catch (err) {
  parseError = `读不到 ${JSON_PATH}：${String(err.message ?? err)}`;
}

if (parseError) {
  rows.push({
    id: '功能矩阵',
    what: '',
    scope: 'cocos',
    cocos: { ok: false, why: parseError },
    web: { ok: true },
    detail: '',
  });
} else {
  for (const f of features) {
    const rawScope = f.scope ?? 'cocos';
    let scope = rawScope;
    if (!SCOPES.has(scope)) {
      console.warn(`⚠ 未知 scope "${rawScope}"（${f.id}），按 cocos 判`);
      scope = 'cocos';
    }
    const cRules = f.cocos ?? [];
    const c = cRules.map(hit);
    let cOk = c.every((r) => r.ok);
    let cWhy = c.filter((r) => !r.ok).map((r) => r.why).join('; ');
    // web-debug 条目没写 cocos 规则 = 明确「Cocos 不搬」（§3），记预期 ✗ 供调试项行汇总
    if (scope === 'web-debug' && cRules.length === 0) {
      cOk = false;
      cWhy = 'Cocos 不搬（web-debug 预期，§3）';
    }
    const w = (f.web ?? []).map(hit);
    const wOk = w.every((r) => r.ok);
    rows.push({
      id: f.id,
      what: f.what,
      scope,
      cocos: { ok: cOk, why: cWhy },
      web: { ok: wOk, why: w.filter((r) => !r.ok).map((r) => r.why).join('; ') },
      optional: !!f.optional,
      detail: f.note ?? '',
    });
  }
}

// ③ 判红：只认 cocos / both；web-debug 的 ✗ 单独汇总，永不判红
let fail = 0;
let gap = 0;
const debugRows = [];
const debugBad = [];
for (const r of rows) {
  if (r.scope === 'web-debug') {
    debugRows.push(r);
    if (!r.cocos.ok || !r.web.ok) debugBad.push(r);
    continue;
  }
  if (!r.cocos.ok) gap += 1;
  const bad = r.scope === 'both' ? !r.cocos.ok || !r.web.ok : !r.cocos.ok;
  if (bad && (!r.optional || strict)) fail += 1;
}

const mark = (ok) => (ok ? '  ✓  ' : '  ✗  ');
if (!quiet) {
  console.log('');
  console.log(`  ${'功能'.padEnd(35)}  ${'scope'.padEnd(9)}  ${'Cocos'}  ${'web'.padEnd(5)}  说明`);
  console.log(`  ${'-'.repeat(35)}  ${'-'.repeat(9)}  ${'-'.repeat(5)}  ${'-'.repeat(5)}  ${'-'.repeat(40)}`);
  for (const r of rows) {
    const name = (r.id + (r.what ? ` ${r.what}` : '')).padEnd(35).slice(0, 35);
    const detail = r.detail || r.cocos.why || '';
    console.log(`  ${name}  ${String(r.scope).padEnd(9)}  ${mark(r.cocos.ok)}  ${mark(r.web.ok)}  ${detail}`);
  }
  if (debugRows.length > 0) {
    const expectedAbsent = debugRows.filter((r) => !r.cocos.ok).length;
    const webMiss = debugRows.filter((r) => !r.web.ok).map((r) => r.id);
    console.log('');
    console.log(
      `  调试项（不判红）: ${debugRows.length} 条 web 专用 · ✗ ${debugBad.length} 处（Cocos 预期不搬 ${expectedAbsent}` +
        `${webMiss.length ? `；web 缺 ${webMiss.length}：${webMiss.join('、')}` : ''}）`,
    );
  }
  console.log('');
}
const summary = `parity: ${rows.length} 条 · Cocos 缺 ${gap} 处 · 调试项 ${debugRows.length}（不判红） · 失败 ${fail} · ${fail === 0 ? 'OK' : 'FAIL'}`;
console.log(summary);
process.exit(fail === 0 ? 0 : 1);
