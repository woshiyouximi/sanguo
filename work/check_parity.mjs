#!/usr/bin/env node
// 双端合并门禁（R214 起）
//
// 用法：
//   node work\check_parity.mjs            # 报表 + 有 ✗ 就 exit 1
//   node work\check_parity.mjs --quiet    # 只打一行总结
//   node work\check_parity.mjs --strict   # 「web 有、cocos 没有」也算失败（默认只报不判）
//
// 两道检查：
//   ① core 单源：game/src/core/** 与 game/cocos/assets/scripts/core/** 必须 0 差异
//      （调 sync_core3.mjs --diff-only，读它的汇总行）
//   ② 功能矩阵：work/parity/features.json 逐条在 Cocos / web 源码里找标记
//
// 每条 feature：{ id, what, cocos:[{file,re}], web:[{file,re}], optional? }
// re 用字符串写，脚本自己 new RegExp（避免 JSON 里转义地狱）。

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = 'F:/sanguo';
const quiet = process.argv.includes('--quiet');
const strict = process.argv.includes('--strict');
const JSON_PATH = path.join(ROOT, 'work/parity/features.json');

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
const cd = coreDiff();
rows.push({ id: 'core 单源', cocos: cd, web: { ok: true }, detail: cd.ok ? `23 个 core 文件一致（same=${cd.same}）` : cd.why });

let features = [];
try {
  features = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
} catch (err) {
  rows.push({ id: '功能矩阵', cocos: { ok: false, why: `读不到 ${JSON_PATH}` }, web: { ok: true }, detail: String(err.message ?? err) });
}

for (const f of features) {
  const c = (f.cocos ?? []).map(hit);
  const w = (f.web ?? []).map(hit);
  const cOk = c.every((r) => r.ok);
  const wOk = w.every((r) => r.ok);
  const why = c.filter((r) => !r.ok).map((r) => r.why).join('; ');
  rows.push({ id: f.id, what: f.what, cocos: { ok: cOk, why }, web: { ok: wOk }, optional: !!f.optional, detail: f.note ?? '' });
}

let fail = 0;
let gap = 0;
if (!quiet) {
  console.log('');
  console.log('  功能                                 Cocos  web    说明');
  console.log('  -----------------------------------  -----  -----  ------------------------------------------');
}
for (const r of rows) {
  const mark = (x) => (x.ok ? '  ✓  ' : '  ✗  ');
  const isGap = !r.cocos.ok && r.web.ok;
  if (!r.cocos.ok && (!r.optional || strict)) fail += 1;
  if (isGap) gap += 1;
  if (!quiet) {
    const name = (r.id + (r.what ? ` ${r.what}` : '')).padEnd(35).slice(0, 35);
    console.log(`  ${name}  ${mark(r.cocos)}  ${mark(r.web)}  ${r.detail || r.cocos.why || ''}`);
  }
}
if (!quiet) console.log('');
const summary = `parity: ${rows.length} 条 · Cocos 缺 ${gap} 处 · 失败 ${fail} · ${fail === 0 ? 'OK' : 'FAIL'}`;
console.log(summary);
process.exit(fail === 0 ? 0 : 1);
