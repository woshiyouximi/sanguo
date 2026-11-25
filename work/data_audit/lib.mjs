// work/data_audit/lib.mjs
// 《三國群英傳2》竖屏重制 —— 数据表逐字段审计公共库
//
// 设计要点：
//  1. 原作权威源优先用 extract/pak/*.INI（cp950/Big5，传统字原文），
//     与 game/data/*.json 的键名一一对应；extract/json/xls_*.json（简体宝典）
//     只作数值二级交叉校验，避免简繁差异制造假差异。
//  2. 本库自己解 INI，不依赖 extract/json 的既有解析器，保证审计与 parser 独立。
//  3. 比对以「单元格」为单位计数，差异逐条带 行/字段/原作值/本作值 证据。
//  4. 支持 --mutate 注入（把「本作侧」某格替换成指定值），用于负数自证。

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));

export const P = {
  sangoIni: 'extract/pak/SANGO.INI',
  magicIni: 'extract/pak/MAGIC.INI',
  thingsIni: 'extract/pak/THINGS.INI',
  timesIni: (i) => `extract/pak/TIMES${i}.INI`,
  doc04b: 'docs/04b_战斗系统.md',
  data: (name) => `game/data/${name}`,
  xls: (name) => `extract/json/xls_${name}.json`,
  json: (name) => `extract/json/${name}.json`,
};

export function repo(...parts) {
  return path.join(ROOT, ...parts);
}

export function readJson(rel) {
  return JSON.parse(readFileSync(repo(rel), 'utf8'));
}

export function readText(rel) {
  return readFileSync(repo(rel), 'utf8');
}

/** 读 Big5/cp950 编码的原作 INI（不做任何替换，返回字符串） */
export function readBig5(rel) {
  return new TextDecoder('big5').decode(readFileSync(repo(rel)));
}

/**
 * 解析 INI 为段数组。
 * 每段：{ head, lineno, entries:[{key,value,lineno}], get(key), all(key) }
 * - 键、值两端空白都 trim（原作里有 `TYPE_BASE       = 1 ` / `NAME =命療術` 这类脏格式）
 * - 无 `=` 的行跳过（THINGS.INI [DEFINE] 里有 `001-099 師團物件` 这类自由文本）
 * - `#` 开头的行照收（THINGS.INI 确有 `#Flags   = OF_BOMB`，是原作注释行，
 *   但 extract 把它当键收进了 things.json，故此处在比对时保留原样）
 */
export function parseIni(text) {
  const sections = [];
  let cur = null;
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].replace(/^\uFEFF/, '').trim();
    if (!t) continue;
    const m = /^\[([^\]]*)\]/.exec(t);
    if (m) {
      cur = {
        head: m[1].trim(),
        lineno: i + 1,
        entries: [],
        _map: new Map(),
        _all: new Map(),
      };
      sections.push(cur);
      continue;
    }
    if (!cur) continue;
    if (t.startsWith(';')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    const value = t.slice(eq + 1).trim();
    cur.entries.push({ key, value, lineno: i + 1 });
    if (!cur._map.has(key)) cur._map.set(key, value);
    if (!cur._all.has(key)) cur._all.set(key, []);
    cur._all.get(key).push(value);
  }
  for (const s of sections) {
    s.get = (k) => (s._map.has(k) ? s._map.get(k) : undefined);
    s.all = (k) => s._all.get(k) || [];
    s.keys = () => [...s._map.keys()];
  }
  return sections;
}

export function readIni(rel) {
  return parseIni(readBig5(rel));
}

/** 数值可解析判定（''/null/undefined/非数值字符串 → false） */
export function numLike(v) {
  if (typeof v === 'number') return Number.isFinite(v);
  if (typeof v === 'string') {
    const t = v.trim();
    return t !== '' && Number.isFinite(Number(t));
  }
  return false;
}

/** 归一：null/undefined 保持 null（与 '' 区分！盜賊.Loyal 就是 null vs '' 的真差异） */
export function normScalar(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number' || typeof v === 'boolean') return v;
  return String(v).trim();
}

/**
 * 单元格相等判定：
 *  - null/undefined 只与 null/undefined 相等（不把 null 当 ''）
 *  - 两侧都能解析成有限数 → 数值相等即可（INI 全是字符串，JSON 里是数字）
 *  - 数组 → 逐元素判定
 *  - 其余 → trim 后字符串相等
 */
export function sameValue(a, b) {
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameValue(a[i], b[i])) return false;
    return true;
  }
  const na = normScalar(a);
  const nb = normScalar(b);
  if (na === null || nb === null) return na === nb;
  if (numLike(na) && numLike(nb)) return Number(na) === Number(nb);
  return String(na) === String(nb);
}

export function show(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.map(show).join(',')}]`;
  if (typeof v === 'string') return v === '' ? "''" : v;
  return JSON.stringify(v) + (typeof v === 'number' ? '' : '');
}

/**
 * 建立一张表的比对结果收集器。
 * add(rowLabel, rowIndex, field, orig, ours) 逐单元格登记；
 * opts.mutate 是 Map<'table:index:field', value>，命中时把 ours 换成注入值（负数自证用）。
 */
export function mkTable(name, opts = {}) {
  const mutate = opts.mutate instanceof Map ? opts.mutate : new Map();
  const t = {
    name,
    source: opts.source || '',
    cells: 0,
    diffs: [],
    uncomparable: [],
    rows: 0,
    add(rowLabel, rowIndex, field, orig, ours) {
      let value = ours;
      const key = `${name}:${rowIndex}:${field}`;
      const mutated = mutate.has(key);
      if (mutated) value = mutate.get(key);
      t.cells++;
      if (!sameValue(orig, value)) {
        t.diffs.push({
          table: name,
          source: t.source,
          row: rowLabel,
          index: rowIndex,
          field,
          orig: orig === undefined ? '<缺失>' : orig,
          ours: value === undefined ? '<缺失>' : value,
          mutated,
        });
      }
    },
    /** 不可比字段：明确登记，报告里单列，不计入差异 */
    noteUncomparable(field, reason, cells = 0) {
      t.uncomparable.push({ field, reason, cells });
    },
    done() {
      return t;
    },
  };
  return t;
}

/** 解析 `--mutate 表:行下标:字段=值`，可重复 */
export function parseMutateArgs(argv) {
  const out = new Map();
  for (let i = 0; i < argv.length; i++) {
    let spec = null;
    if (argv[i] === '--mutate') spec = argv[++i];
    else if (argv[i].startsWith('--mutate=')) spec = argv[i].slice('--mutate='.length);
    if (!spec) continue;
    const eq = spec.indexOf('=');
    const lhs = eq < 0 ? spec : spec.slice(0, eq);
    const raw = eq < 0 ? '' : spec.slice(eq + 1);
    const parts = lhs.split(':');
    if (parts.length !== 3) throw new Error(`--mutate 格式应为 表:行下标:字段=值，收到 ${spec}`);
    const [table, index, field] = parts;
    out.set(`${table}:${Number(index)}:${field}`, raw);
  }
  return out;
}

/** 从 docs/*.md 里抓指定小节下的 markdown 表格（反汇编表原文） */
export function readMdTable(rel, headingIncludes) {
  const lines = readText(rel).split(/\r?\n/);
  const start = lines.findIndex(
    (l) => /^#{2,4}\s/.test(l) && l.includes(headingIncludes),
  );
  if (start < 0) throw new Error(`${rel} 里找不到标题含「${headingIncludes}」的小节`);
  const rows = [];
  let started = false;
  for (let i = start + 1; i < lines.length; i++) {
    const l = lines[i].trim();
    if (l.startsWith('|')) {
      started = true;
      rows.push(l);
    } else if (started) break;
  }
  if (!rows.length) throw new Error(`${rel} 「${headingIncludes}」小节下没有表格`);
  const cells = rows.map((l) =>
    l
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((c) => c.replace(/\*\*/g, '').replace(/[−–—]/g, '-').trim()),
  );
  // 去掉 |---:|---:| 分隔行
  const body = cells.filter((r) => !r.every((c) => /^:?-{2,}:?$/.test(c) || c === ''));
  return { header: body[0], rows: body.slice(1) };
}
