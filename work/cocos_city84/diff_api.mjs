/**
 * diff_api.mjs — 枚举 web 真源与 Cocos CityModel 的行为差异
 *
 * 做法：把两端编成 JS 后逐个导出比「函数体 token 流」：
 *   去掉公共前缀/后缀，剩下的中段就是分歧点，直接打印两端的差异片段。
 * 对象常量则递归比 JSON（打印 key/值差异）。
 *
 * 用法：cd F:\sanguo; node work\cocos_city84\diff_api.mjs [--full]
 * 输出：work\cocos_city84\diff_api.log（同时打屏摘要）
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { compile, loadEsm, loadCjs } from '../parity_num/build_sim.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FULL = process.argv.includes('--full');
const lines = [];
const say = (s = '') => {
  lines.push(s);
  if (FULL || lines.length <= 60) console.log(s);
};

compile('tsconfig.city.json');
const web = await loadEsm('game/web/city_model.js');
const coc = loadCjs('cocos_city/CityModel.js');

const wKeys = Object.keys(web);
const cKeys = Object.keys(coc);
say(`web exports: ${wKeys.length}   cocos exports: ${cKeys.length}`);
const missing = wKeys.filter((k) => !(k in coc));
const extra = cKeys.filter((k) => !(k in web));
say(`web-only (cocos 缺): ${missing.length ? missing.join(', ') : '(none)'}`);
say(`cocos-only (web 无): ${extra.length ? extra.join(', ') : '(none)'}`);

const tokenize = (s) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    .match(/"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`|[A-Za-z_$][\w$]*|\d+(?:\.\d+)?(?:e[+-]?\d+)?|\S/gi) || [];

/** 去掉公共前缀/后缀，返回两端中段 token */
function middle(a, b) {
  let p = 0;
  while (p < a.length && p < b.length && a[p] === b[p]) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s] === b[b.length - 1 - s]) s++;
  return {
    pre: p,
    web: a.slice(p, a.length - s),
    coc: b.slice(p, b.length - s),
    sim: 2 * (p + s) / Math.max(1, a.length + b.length),
  };
}

const clip = (arr, n = 90) => {
  const t = arr.join(' ');
  return t.length > n * 12 ? t.slice(0, n * 12) + ' …' : t;
};

function diffJson(w, c, prefix, out) {
  const both = (v) => v !== null && typeof v === 'object';
  if (both(w) && both(c)) {
    if (Array.isArray(w) !== Array.isArray(c)) {
      out.push(`${prefix}: 类型不同 web=${Array.isArray(w) ? 'array' : 'object'} coc=${Array.isArray(c) ? 'array' : 'object'}`);
      return;
    }
    if (Array.isArray(w)) {
      if (w.length !== c.length) out.push(`${prefix}: 长度 web=${w.length} coc=${c.length}`);
      const n = Math.max(w.length, c.length);
      for (let i = 0; i < n; i++) diffJson(w[i], c[i], `${prefix}[${i}]`, out);
      return;
    }
    const keys = new Set([...Object.keys(w), ...Object.keys(c)]);
    for (const k of keys) diffJson(w[k], c[k], prefix ? `${prefix}.${k}` : k, out);
    return;
  }
  if (JSON.stringify(w) !== JSON.stringify(c)) out.push(`${prefix}: web=${JSON.stringify(w)} coc=${JSON.stringify(c)}`);
}

const rows = [];
for (const k of [...wKeys].filter((x) => x in coc).sort()) {
  const a = web[k];
  const b = coc[k];
  if (typeof a === 'function' && typeof b === 'function') {
    const ta = tokenize(String(a));
    const tb = tokenize(String(b));
    const m = middle(ta, tb);
    if (!m.web.length && !m.coc.length) {
      rows.push({ k, kind: 'fn', same: true });
    } else {
      rows.push({ k, kind: 'fn', same: false, m });
    }
  } else if (a !== null && typeof a === 'object' && b !== null && typeof b === 'object') {
    const out = [];
    diffJson(a, b, k, out);
    rows.push({ k, kind: 'obj', same: out.length === 0, out });
  } else if (typeof a !== typeof b || JSON.stringify(a) !== JSON.stringify(b)) {
    rows.push({ k, kind: 'val', same: false, out: [`${k}: web=${JSON.stringify(a)} coc=${JSON.stringify(b)}`] });
  } else {
    rows.push({ k, kind: 'val', same: true });
  }
}

const bad = rows.filter((r) => !r.same);
say('');
say(`导出对比：共 ${rows.length} 个同名导出，一致 ${rows.length - bad.length}，有差异 ${bad.length}`);
say('='.repeat(78));
for (const r of bad) {
  say('');
  if (r.kind === 'fn') {
    say(`## ${r.k}()  (函数体相似度 ${(r.m.sim * 100).toFixed(1)}%, 公共前缀 ${r.m.pre} tokens)`);
    say(`  [web]  ${clip(r.m.web)}`);
    say(`  [coc]  ${clip(r.m.coc)}`);
  } else {
    say(`## ${r.k}  (${r.kind})`);
    for (const s of r.out.slice(0, 120)) say(`  ${s}`);
    if (r.out.length > 120) say(`  … 共 ${r.out.length} 条`);
  }
}

const missFn = rows.filter((r) => r.kind === 'fn' && !r.same).map((r) => r.k);
const missObj = rows.filter((r) => r.kind !== 'fn' && !r.same).map((r) => r.k);
say('');
say('差异函数: ' + (missFn.join(', ') || '(none)'));
say('差异常量: ' + (missObj.join(', ') || '(none)'));

fs.writeFileSync(path.join(HERE, 'diff_api.log'), lines.join('\n'), 'utf8');
console.log(`\n[log] ${path.join(HERE, 'diff_api.log')}  (${bad.length} diffs)`);
