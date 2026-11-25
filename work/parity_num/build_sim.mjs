/**
 * build_sim.mjs — parity_num 四块对拍共用的「编译 / 装载 / 差异统计」底座。
 *
 * 职责：
 *   1. 用 tsc 把两侧源码编成 CommonJS，落到 `work/parity_num/_sim/` 下（唯一的写盘位置）。
 *   2. 装载：web 侧的 ESM 模块用 `import()`，Cocos 侧的 CJS 产物用 `createRequire()`
 *      （require 拿到的是 module.exports 本身，因此可以对导出常量做真实改写 = 阴性对照）。
 *   3. 逐字段递归比对 `diffDeep()`，把差异压成扁平 `{path, web, cocos}` 列表。
 *
 * 约定：本文件只读 `game/**`，只写 `work/parity_num/**`。
 */
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const SIM = path.join(HERE, '_sim');
export const TSC = path.join(ROOT, 'game/node_modules/typescript/bin/tsc');

const require_ = createRequire(import.meta.url);

/** 跑一个 tsc 工程（stdio 吞掉，失败才抛） */
export function compile(projectRel, { quiet = true } = {}) {
  const args = [TSC, '-p', path.join(HERE, projectRel)];
  try {
    execFileSync(process.execPath, args, { cwd: ROOT, stdio: quiet ? 'pipe' : 'inherit', encoding: 'utf8' });
  } catch (err) {
    const out = `${err.stdout ?? ''}${err.stderr ?? ''}`;
    throw new Error(`tsc -p ${projectRel} 失败:\n${out.slice(-4000)}`);
  }
  return path.join(HERE, projectRel.replace(/^tsconfig\.(.+)\.json$/, (_, n) => `_sim/${n}`));
}

/** 装载 Cocos 侧 CJS 产物（可写，供阴性对照改常量） */
export function loadCjs(rel) {
  const p = path.join(SIM, rel);
  delete require_.cache?.[p];
  return require_(p);
}

/** 装载 web 侧 ESM 模块（仓库内真源，如 game/web/ai_model.js） */
export async function loadEsm(rel) {
  return import(pathToFileURL(path.join(ROOT, rel)).href);
}

/** 装载 _sim 下的 ESM 产物（web 侧 src/core 的编译结果） */
export async function loadSimEsm(rel) {
  return import(pathToFileURL(path.join(SIM, rel)).href);
}

/** 读 JSON（同一个对象实例喂给两侧，保证数据层不引入差异） */
export function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

/** 序列化：把 undefined / NaN / ±Infinity 显式标出来，避免它们看起来「相等」 */
export function ser(value) {
  return JSON.stringify(value, (k, v) => {
    if (v === undefined) return '\u0000undef\u0000';
    if (typeof v === 'number') {
      if (Number.isNaN(v)) return '\u0000nan\u0000';
      if (!Number.isFinite(v)) return v > 0 ? '\u0000inf\u0000' : '\u0000-inf\u0000';
      if (Object.is(v, -0)) return '\u0000-0\u0000';
    }
    return v;
  });
}

export const clone = (v) => structuredClone(v);

/**
 * 逐字段递归比对。
 * @returns {{fields:number, misses:Array<{path:string,web:any,cocos:any}>, first:string|null}}
 *   fields = 比较到的**叶子字段**数；misses = 不一致的叶子数（受 cap 限制只保留前 cap 条）
 */
export function diffDeep(web, cocos, prefix = '', cap = 400, acc = null) {
  const box = acc ?? { fields: 0, misses: [], capped: 0, first: null };
  const walk = (a, b, p) => {
    if (a === b) {
      // 快速通道：原始值相等。仍要记一次字段数
      box.fields += 1;
      return;
    }
    const ta = a === null ? 'null' : Array.isArray(a) ? 'array' : typeof a;
    const tb = b === null ? 'null' : Array.isArray(b) ? 'array' : typeof b;
    if (ta !== tb) {
      box.fields += 1;
      push(p, a, b);
      return;
    }
    if (ta === 'array') {
      const n = Math.max(a.length, b.length);
      for (let i = 0; i < n; i += 1) walk(a[i], b[i], `${p}[${i}]`);
      return;
    }
    if (ta === 'object') {
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      for (const k of keys) walk(a[k], b[k], p ? `${p}.${k}` : k);
      return;
    }
    // 函数值不按对象身份比：web `city_model.js` 与 Cocos `CityModel.ts` 各自 `() => ...`
    // 建一个箭头函数对象（如 AUTONOMY.ROW），`Object.is` 恒 false ⇒ 每脚本恒 1 条
    // 假阳性。与此前 `incrRows().src`（取证文案）、`hallImageOf`（美术路径）同类，
    // 都属「对拍口径无法比较」而不是数值回归。
    // TODO(若将来要比函数行为，请比调用结果而不是对象身份)
    if (typeof a === 'function' && typeof b === 'function') {
      box.fields += 1;
      return;
    }
    // 原始值不等（含 NaN / -0 的语义差异）
    box.fields += 1;
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    if (Object.is(a, b)) return;
    push(p, a, b);
  };
  const push = (p, a, b) => {
    if (box.first === null) box.first = p;
    if (box.misses.length < cap) box.misses.push({ path: p, web: a, cocos: b });
    else box.capped += 1;
  };
  walk(web, cocos, prefix);
  return box;
}

/** 统一结果对象；每个 unit 返回它 */
export function makeResult(unit, label) {
  return {
    unit,
    label,
    cases: 0, // 比较条目（一次「整份快照/整月/整城轮次」算一条）
    fields: 0, // 比较字段（叶子）
    misses: [], // {path, web, cocos}
    capped: 0,
    notes: [],
    firstDiff: null,
    extra: {},
  };
}

export function addDiff(res, box, caseTag) {
  res.fields += box.fields;
  if (box.misses.length || box.capped) {
    for (const m of box.misses) {
      if (res.misses.length < 200) res.misses.push({ path: caseTag ? `[${caseTag}] ${m.path}` : m.path, web: m.web, cocos: m.cocos });
    }
    res.capped += box.capped;
    res.missesCount = (res.missesCount ?? 0) + box.misses.length + box.capped;
    if (res.firstDiff === null) res.firstDiff = { case: caseTag, path: box.first };
    return false;
  }
  return true;
}

/** 汇总打印：统一格式 `[unit] 比较条目 N / 字段 M / 不一致 K` */
export function report(res, { show = 20, stream = console } = {}) {
  const k = res.missesCount ?? 0;
  stream.log(`\n[${res.unit}] ${res.label}`);
  stream.log(`[${res.unit}] 比较条目 ${res.cases} / 字段 ${res.fields} / 不一致 ${k}`);
  for (const note of res.notes) stream.log(`  · ${note}`);
  if (res.firstDiff) stream.log(`  · 首个不一致：${res.firstDiff.case ?? ''} ${res.firstDiff.path}`);
  if (k > 0) {
    stream.log(`  · 前 ${Math.min(show, res.misses.length)} 条差异：`);
    for (const m of res.misses.slice(0, show)) {
      stream.log(`    ✗ ${m.path}`);
      stream.log(`        web  = ${trunc(m.web)}`);
      stream.log(`        cocos= ${trunc(m.cocos)}`);
    }
    if (res.capped) stream.log(`    … 另有 ${res.capped} 条同类差异未列出`);
  }
  return k;
}

function trunc(v) {
  const s = typeof v === 'string' ? v : ser(v);
  return s.length > 220 ? `${s.slice(0, 220)}…` : s;
}

/** 与两端无关的本地 PRNG（只用来挑参数，保证两侧拿到完全相同的输入） */
export function rngOf(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export { path, fs, fileURLToPath, pathToFileURL, require_ as requireCjs };
