#!/usr/bin/env node
// work/data_audit/run_all.mjs
// 《三國群英傳2》竖屏重制 —— game/data 全表逐字段审计入口
//
// 用法：
//   node work/data_audit/run_all.mjs             # 人读报告，有差异时 exit 1
//   node work/data_audit/run_all.mjs --json      # 机器可读（game/tests/data_audit.test.ts 用）
//   node work/data_audit/run_all.mjs --limit 30  # 每表最多列多少条差异
//   node work/data_audit/run_all.mjs --only items,magics
//   node work/data_audit/run_all.mjs --mutate items:0:Rate=999   # 负数自证：注入一格假差异
//
// 每个 cmp_<表>.mjs 导出 run(opts) → Table[]，Table = {name, source, cells, rows, diffs[], uncomparable[]}
import { parseMutateArgs } from './lib.mjs';
import * as items from './cmp_items.mjs';
import * as troops from './cmp_troops.mjs';
import * as formations from './cmp_formations.mjs';
import * as magics from './cmp_magics.mjs';
import * as wises from './cmp_wises.mjs';
import * as things from './cmp_things.mjs';
import * as terrains from './cmp_terrains.mjs';
import * as garrison from './cmp_garrison.mjs';
import * as generals from './cmp_generals.mjs';

export const MODULES = [
  ['items', items],
  ['troops', troops],
  ['formations', formations],
  ['magics', magics],
  ['wises', wises],
  ['things', things],
  ['terrains', terrains],
  ['garrison', garrison],
  ['generals', generals],
];

export function runAll(opts = {}) {
  const mutate = opts.mutate instanceof Map ? opts.mutate : new Map();
  const only = opts.only && opts.only.length ? new Set(opts.only) : null;
  const tables = [];
  for (const [key, mod] of MODULES) {
    if (only && !only.has(key)) continue;
    const out = mod.run({ mutate });
    for (const t of out) tables.push(t);
  }
  const totals = {
    tables: tables.length,
    cells: tables.reduce((a, t) => a + t.cells, 0),
    diffs: tables.reduce((a, t) => a + t.diffs.length, 0),
    uncomparable: tables.reduce((a, t) => a + t.uncomparable.length, 0),
  };
  return { tables, totals, mutated: [...mutate.keys()] };
}

function w(s) {
  let n = 0;
  for (const ch of String(s)) n += ch.codePointAt(0) > 0x2e7f ? 2 : 1;
  return n;
}
function pad(s, width) {
  const d = width - w(s);
  return d > 0 ? String(s) + ' '.repeat(d) : String(s);
}

export function formatReport(result, { limit = 10 } = {}) {
  const { tables, totals } = result;
  const lines = [];
  lines.push('='.repeat(96));
  lines.push('game/data 全表逐字段审计（原作源：extract/pak/*.INI 优先，xls 宝典 / docs 反汇编表作二级校验）');
  lines.push('='.repeat(96));
  lines.push(`${pad('表', 18)}${pad('原作源', 44)}${pad('行', 8)}${pad('单元格', 10)}差异`);
  lines.push('-'.repeat(96));
  let nameW = 18;
  for (const t of tables) nameW = Math.max(nameW, w(t.name) + 2);
  for (const t of tables) {
    lines.push(
      `${pad(t.name, nameW)}${pad(t.source, 44)}${pad(t.rows, 8)}${pad(t.cells, 10)}${t.diffs.length}`,
    );
  }
  lines.push('-'.repeat(96));
  lines.push(
    `合计 ${tables.length} 张表 · 单元格 ${totals.cells} · 差异 ${totals.diffs} · 不可比字段组 ${totals.uncomparable}`,
  );

  for (const t of tables) {
    if (!t.diffs.length) continue;
    lines.push('');
    lines.push(`【${t.name}】差异 ${t.diffs.length} 条（源：${t.source}），前 ${Math.min(limit, t.diffs.length)} 条：`);
    for (const d of t.diffs.slice(0, limit)) {
      const mut = d.mutated ? ' [mutate 注入]' : '';
      lines.push(`  · 行「${d.row}」 字段 ${d.field}：原作＝${show(d.orig)} → 本作＝${show(d.ours)}${mut}`);
    }
  }

  const unc = tables.filter((t) => t.uncomparable.length);
  if (unc.length) {
    lines.push('');
    lines.push('不可比 / 按规则归一 的字段组：');
    for (const t of unc) {
      for (const u of t.uncomparable) {
        lines.push(`  · [${t.name}] ${u.field}（${u.cells} 格）：${u.reason}`);
      }
    }
  }

  if (result.mutated && result.mutated.length) {
    lines.push('');
    lines.push(`已注入 --mutate：${result.mutated.join(', ')}`);
  }
  lines.push('');
  lines.push(totals.diffs === 0 ? '结论：0 差异 ✅' : `结论：${totals.diffs} 处差异 ❌`);
  return lines.join('\n');
}

function show(v) {
  if (v === null) return 'null';
  if (v === undefined) return 'undefined';
  if (Array.isArray(v)) return `[${v.join(',')}]`;
  if (typeof v === 'string') return v === '' ? "''" : v;
  return String(v);
}

function main(argv) {
  const json = argv.includes('--json');
  const limitArg = argv.indexOf('--limit');
  const limit = limitArg >= 0 ? Number(argv[limitArg + 1]) : 10;
  const onlyArg = argv.find((a) => a.startsWith('--only=')) || (argv.indexOf('--only') >= 0 ? `--only=${argv[argv.indexOf('--only') + 1]}` : null);
  const only = onlyArg ? onlyArg.slice('--only='.length).split(',').map((s) => s.trim()).filter(Boolean) : null;
  const mutate = parseMutateArgs(argv);
  const result = runAll({ mutate, only });

  if (json) {
    process.stdout.write(`${JSON.stringify({
      totals: result.totals,
      mutated: result.mutated,
      tables: result.tables.map((t) => ({
        name: t.name,
        source: t.source,
        rows: t.rows,
        cells: t.cells,
        diffs: t.diffs,
        uncomparable: t.uncomparable,
      })),
    }, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(result, { limit })}\n`);
  }
  return result.totals.diffs === 0 ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('run_all.mjs')) {
  process.exitCode = main(process.argv.slice(2));
}
