#!/usr/bin/env node
/**
 * 两端数值一致性回归 · 一条命令跑完四块
 *
 *   node work/parity_num/run_all.mjs              # 正常对拍：有分歧 → 退出码 1
 *   node work/parity_num/run_all.mjs --negative   # 四块阴性对照：四块都必须转红（RED），否则退出码 1
 *   node work/parity_num/run_all.mjs --only=unit3 # 只跑某一块（可重复/逗号分隔）
 *   node work/parity_num/run_all.mjs --verbose    # 把四块的完整输出也贴出来
 *
 * 口径：同一份 GameData（`game/data/`，两仓 data 并不相同）+ 同一存档 / 同一种子，
 * 比对 web 版与 Cocos 版跑出来的每一个数值字段。统一格式由 `build_sim.mjs:report()` 打印：
 *     [unitN-xxx] 比较条目 N / 字段 M / 不一致 K
 * 本脚本只负责编排 + 解析 + 汇总表 + 退出码，不含任何对拍逻辑。
 */
import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const NEGATIVE = argv.includes('--negative');
const VERBOSE = argv.includes('--verbose');
const onlyArg = argv.find((a) => a.startsWith('--only'));
const ONLY = onlyArg
  ? (onlyArg.includes('=') ? onlyArg.split('=')[1] : argv[argv.indexOf(onlyArg) + 1] || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  : null;

/** 四块对拍：id / 脚本 / 一句话说明 */
const UNITS = [
  { id: 'unit1', file: 'unit1_battle.mjs', what: '战斗内核 battle.ts（54 组参数 × 600 tick，逐 tick + settle 全字段）' },
  { id: 'unit2', file: 'unit2_ai.mjs', what: 'AI 月动作 ai_model.js（5 剧本 × 12 月 planMonth/executeMonth）' },
  { id: 'unit3', file: 'unit3_city.mjs', what: '内政模型 city_model.js（10 城 × 3 seed × 10 轮 × 8 命令）' },
  { id: 'unit4', file: 'unit4_levels.mjs', what: '等级与带兵 levels.ts（400 将 + 边界 + override）' },
];

const RE_HEAD = /^\[([\w-]+)\]\s+比较条目\s+(\d+)\s*\/\s*字段\s+(\d+)\s*\/\s*不一致\s+(\d+)/m;
const RE_NEG = /(?:阴性对照结论：|，)(RED|GREEN)/;

/** 跑一块，返回 {id, cases, fields, misses, red, ok, sec, out, status} */
function runUnit(u) {
  const args = [path.join(HERE, u.file)];
  if (NEGATIVE) args.push('--negative');
  const t0 = Date.now();
  const r = spawnSync(process.execPath, args, {
    cwd: path.join(HERE, '..', '..'),
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`;
  const sec = Math.round((Date.now() - t0) / 1000);
  const head = RE_HEAD.exec(out);
  const neg = RE_NEG.exec(out);
  return {
    id: u.id,
    what: u.what,
    cases: head ? Number(head[2]) : null,
    fields: head ? Number(head[3]) : null,
    misses: head ? Number(head[4]) : null,
    unitName: head ? head[1] : null,
    red: neg ? neg[1] === 'RED' : null,
    status: r.status,
    sec,
    out,
  };
}

const picked = ONLY ? UNITS.filter((u) => ONLY.includes(u.id)) : UNITS;
if (!picked.length) {
  console.error(`[run_all] --only 没匹配到任何单元（可选：${UNITS.map((u) => u.id).join(' / ')}）`);
  process.exit(2);
}

console.log('='.repeat(96));
console.log(`两端数值一致性回归 · ${picked.length} 块${NEGATIVE ? ' · 阴性对照模式' : ''}`);
console.log(`口径：同一份 game/data + 同一存档 / 同一种子；Cocos 侧经 tsc 编成 CJS 后由 node 直接跑`);
console.log('='.repeat(96));

const rows = [];
for (const u of picked) {
  console.log(`\n──── ${u.id}  ${u.what} ────`);
  const row = runUnit(u);
  if (VERBOSE || NEGATIVE) process.stdout.write(row.out);
  else {
    // 正常模式只回显统一格式那一行 + 首条不一致，其余落盘
    const head = row.out.match(RE_HEAD);
    console.log(head ? head[0] : '[run_all] 未解析到统一格式行，见 _run_all_<id>.log');
    const first = row.out.match(/首个不一致：.*/);
    if (first) console.log(`  ${first[0]}`);
    writeFileSync(path.join(HERE, `_run_all_${u.id}.log`), row.out, 'utf8');
  }
  rows.push(row);
}

/* ── 汇总表 ───────────────────────────────────────────────────────────── */
const pad = (s, n) => {
  const w = [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 127 ? 2 : 1), 0);
  return String(s) + ' '.repeat(Math.max(0, n - w));
};
console.log(`\n${'='.repeat(96)}`);
console.log('汇总');
console.log('-'.repeat(96));
if (NEGATIVE) {
  console.log(`${pad('单元', 10)}${pad('条目', 9)}${pad('字段', 11)}${pad('不一致', 10)}${pad('阴性对照', 12)}结论`);
  for (const r of rows) {
    const verdict = r.red === true ? 'RED ✅ 断言会变红' : r.red === false ? 'GREEN ❌ 对拍恒真' : '未输出 ❌';
    console.log(`${pad(r.id, 10)}${pad(r.cases ?? '-', 9)}${pad(r.fields ?? '-', 11)}${pad(r.misses ?? '-', 10)}${pad(r.red === true ? 'RED' : r.red === false ? 'GREEN' : '-', 12)}${verdict}  (${r.sec}s)`);
  }
} else {
  console.log(`${pad('单元', 10)}${pad('比较条目', 10)}${pad('字段', 11)}${pad('不一致', 10)}结论`);
  for (const r of rows) {
    const ok = r.status === 0 && r.misses === 0;
    const verdict = r.misses === null ? 'ERROR（跑失败）' : ok ? '一致 ✅' : `不一致 ${r.misses} ❌`;
    console.log(`${pad(r.id, 10)}${pad(r.cases ?? '-', 10)}${pad(r.fields ?? '-', 11)}${pad(r.misses ?? '-', 10)}${verdict}  (${r.sec}s)`);
  }
  const tot = rows.reduce((a, r) => a + (r.cases ?? 0), 0);
  const totF = rows.reduce((a, r) => a + (r.fields ?? 0), 0);
  const totM = rows.reduce((a, r) => a + (r.misses ?? 0), 0);
  console.log('-'.repeat(96));
  console.log(`${pad('合计', 10)}${pad(tot, 10)}${pad(totF, 11)}${pad(totM, 10)}`);
}
console.log('='.repeat(96));

/* ── 退出码 ───────────────────────────────────────────────────────────── */
let code;
if (NEGATIVE) {
  const bad = rows.filter((r) => r.red !== true);
  code = bad.length ? 1 : 0;
  console.log(
    bad.length
      ? `\n[run_all] 阴性对照失败：${bad.map((r) => `${r.id}(RED 未确认)`).join(' ')} → 退出码 1`
      : `\n[run_all] 四块阴性对照全部 RED（断言确实会变红，对拍不是恒真）→ 退出码 0`,
  );
} else {
  const bad = rows.filter((r) => r.status !== 0 || r.misses !== 0);
  code = bad.length ? 1 : 0;
  console.log(
    bad.length
      ? `\n[run_all] 两端数值不一致：${bad.map((r) => `${r.id}(${r.misses ?? 'ERR'} 条)`).join(' ')} → 退出码 1`
      : `\n[run_all] 四块全部逐字段一致 → 退出码 0`,
  );
}

writeFileSync(
  path.join(HERE, NEGATIVE ? '_run_all_negative.json' : '_run_all.json'),
  JSON.stringify(
    {
      at: new Date().toISOString(),
      negative: NEGATIVE,
      rows: rows.map(({ out, ...rest }) => ({ ...rest, out: VERBOSE ? out : undefined })),
      code,
    },
    null,
    2,
  ),
  'utf8',
);
process.exit(code);
