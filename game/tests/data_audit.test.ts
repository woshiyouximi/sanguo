// @ts-nocheck —— 审计结果是运行时产物（any），与 tests/fidelity_net.test.ts 同风格
/**
 * 数据表逐字段审计 · node:test 版
 *
 * 断言「game/data/*.json 与原作 extract/pak/*.INI 逐字段一致」，审计本体在
 * `work/data_audit/run_all.mjs`（18 张表），本测试只做两件事：
 *   1) 正断言：5 张核心表 + 全部表合计的差异数必须是 0，单元格数必须是预期值
 *      （单元格数写死 → 审计范围被悄悄缩小也会红，不给恒真留口子）；
 *   2) 负自证：用 `--mutate 表:行:字段=值` 故意注入一格假差异，必须变成 ≥1 条差异，
 *      证明上面对应的 0 差异断言确实在比东西（不是空跑）。
 *
 * 单独看人读报告：node work/data_audit/run_all.mjs
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const RUNNER = fileURLToPath(new URL('../../work/data_audit/run_all.mjs', import.meta.url));
const REPO = fileURLToPath(new URL('../../', import.meta.url));

/** 跑一次审计，返回 { status, result }；--json 的输出解析失败时 result 为 null */
function runAudit(args = []) {
  const r = spawnSync(process.execPath, [RUNNER, '--json', ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  let result = null;
  try {
    result = JSON.parse(r.stdout);
  } catch {
    result = null;
  }
  return { status: r.status, result, stderr: r.stderr, stdout: r.stdout };
}

const byName = (result, name) => (result?.tables || []).find((t) => t.name === name);

function detail(t, n = 8) {
  return (t?.diffs || [])
    .slice(0, n)
    .map((d) => `  · 行「${d.row}」字段 ${d.field}：原作＝${JSON.stringify(d.orig)} → 本作＝${JSON.stringify(d.ours)}`)
    .join('\n');
}

/** 每张核心表的预期单元格数（= 行数 × 字段数，写死防范围缩水） */
const CORE = [
  ['items', 1925, 'SANGO.INI [ITEM] 77 条 × 25 字段'],
  ['troops', 195, 'xls_兵种 13×13 相克 + 13 行名 + 13 列名'],
  ['formations', 99, 'xls_阵形 9×9 相克 + 9 行名 + 9 列名'],
  ['magics', 1100, 'MAGIC.INI [MAGIC] 110 条 × 10 字段'],
  ['wises', 469, 'MAGIC.INI [WISE] 67 条 × 7 字段'],
];

describe('数据表逐字段审计（原作 extract/pak/*.INI → game/data/*.json）', () => {
  test('审计入口存在，且能跑出 18 张表的结果', () => {
    assert.ok(existsSync(RUNNER), `缺少审计入口 ${RUNNER}`);
    const { result } = runAudit([]);
    assert.ok(result, '审计 --json 输出无法解析');
    assert.equal(result.tables.length, 18, `表数应为 18，实际 ${result.tables.length}`);
  });

  for (const [name, minCells, what] of CORE) {
    test(`核心表 ${name}：单元格数 ${minCells}（${what}）且差异 0`, () => {
      const { result } = runAudit([]);
      const t = byName(result, name);
      assert.ok(t, `审计里没有表 ${name}`);
      assert.equal(t.cells, minCells, `${name} 单元格数应 ${minCells}，实际 ${t.cells} —— 审计范围被改过？`);
      assert.equal(t.diffs.length, 0, `${name} 有 ${t.diffs.length} 条差异：\n${detail(t)}`);
    });
  }

  test('全部 18 张表合计差异 0（含逐剧本字段与 BaseEXP 规则校验）', () => {
    const { result } = runAudit([]);
    assert.ok(result);
    assert.equal(result.totals.diffs, 0, `合计 ${result.totals.diffs} 条差异：\n${detail({ diffs: result.tables.flatMap((t) => t.diffs) })}`);
    assert.ok(result.totals.cells >= 42000, `单元格总数只有 ${result.totals.cells}，审计范围疑似缩水`);
    assert.ok(result.totals.uncomparable >= 10, '不可比字段组少了，说明有字段被静默丢弃（必须在报告里单列）');
  });

  // ── 时代字段（R167）：5 个字段从「不可比」转成逐剧本比对 ─────────────────
  // 背景：BattleArray/Force/UseForce/LoyalKing/Weapon 在 TIMES1..5 里会变，以前本作只存
  // TIMES1 单值 → 审计只能统计不能比。现在 generals.json 每行加了 `*_by_times[5]`
  // （生成器 work/data_audit/gen_generals_era.mjs，按 NAME 匹配），generals_era 逐剧本比对。
  const ERA_FIELDS = ['BattleArray', 'Force', 'UseForce', 'LoyalKing', 'Weapon'];
  /** 相对 TIMES1 有时代差异的武将数（实测：四字段合计 857，任务书口径） */
  const ERA_VARY = { BattleArray: 379, Force: 381, UseForce: 27, LoyalKing: 70, Weapon: 1 };

  test('generals_era：401 将 × 5 剧本 × 9 字段 = 18045 格，差异 0', () => {
    const { result } = runAudit([]);
    const t = byName(result, 'generals_era');
    assert.ok(t, '审计里没有表 generals_era');
    assert.equal(t.cells, 18045, `generals_era 单元格应 18045（原 8020 + 新时代字段 10025），实际 ${t.cells}`);
    assert.equal(t.rows, 2005, `generals_era 行数应 2005（401×5），实际 ${t.rows}`);
    assert.equal(t.diffs.length, 0, `generals_era 有 ${t.diffs.length} 条差异：\n${detail(t)}`);
  });

  test('时代 5 字段不再登记为「不可比」：generals 里消失，generals_era 只剩 BLOOD_by_times', () => {
    const { result } = runAudit([]);
    const g = byName(result, 'generals');
    const ge = byName(result, 'generals_era');
    assert.ok(g && ge);
    const fields = (t) => (t.uncomparable || []).map((u) => String(u.field));
    for (const f of ERA_FIELDS) {
      assert.ok(
        !fields(g).some((x) => x.startsWith(f)),
        `generals 仍把 ${f} 当不可比：${fields(g).join(' / ')}`,
      );
      assert.ok(
        !fields(ge).includes(f),
        `generals_era 没有逐剧本比 ${f}：${fields(ge).join(' / ')}`,
      );
    }
    assert.deepEqual(fields(ge), ['BLOOD_by_times'], 'generals_era 的不可比字段应只剩 BLOOD_by_times');
    // 改前 17 组（5 个时代字段 + 12 组既有归一），改后应正好少 5 组
    assert.equal(result.totals.uncomparable, 12, '不可比字段组应为 12（5 个时代字段已转为可比）');
  });

  test('generals.json 时代字段完整：10025 个值、S1 等于单值，且 857 个（将,字段）确有时代差异', () => {
    const genPath = fileURLToPath(new URL('../../game/data/generals.json', import.meta.url));
    const rows = JSON.parse(readFileSync(genPath, 'utf8'));
    assert.equal(rows.length, 401, `generals.json 应 401 行，实际 ${rows.length}`);
    const vary = {};
    let values = 0;
    for (const f of ERA_FIELDS) vary[f] = 0;
    for (const g of rows) {
      for (const f of ERA_FIELDS) {
        const arr = g[`${f}_by_times`];
        assert.ok(Array.isArray(arr) && arr.length === 5, `${g.NAME} 缺 ${f}_by_times（或不是 5 项）`);
        values += arr.length;
        // 单值字段 = TIMES1，故 by_times[0] 必须与它逐值相等（盜賊 LoyalKing 单值缺键，按空串）
        const base = f === 'LoyalKing' ? (g.LoyalKing ?? '') : g[f];
        assert.deepEqual(arr[0], base, `${g.NAME} 的 ${f}_by_times[0] 应等于单值字段 ${f}`);
        if (new Set(arr.map((v) => JSON.stringify(v))).size > 1) vary[f]++;
      }
    }
    assert.equal(values, 401 * 5 * 5, `时代字段值总数应 10025，实际 ${values}`);
    assert.deepEqual(vary, ERA_VARY, '有时代差异的武将数与原作统计不一致（数据生成或统计口径被改过）');
    assert.equal(vary.BattleArray + vary.Force + vary.UseForce + vary.LoyalKing, 857, '任务书口径的 857 格');
    assert.equal(vary.BattleArray + vary.Force + vary.UseForce + vary.LoyalKing + vary.Weapon, 858);
  });

  test('负数自证 generals_era：5 个时代字段各改一格必须全部报红（含「S1 的值塞进 S2」）', () => {
    // index = 1000 + s*500 + j（j=0 是模板行盜賊）；1659 = S2 的袁術（j=159，
    // 袁術 Weapon 是 S1=短錐槍 / S2..S5=直劍 → 把 S1 的值放进 S2 必须红，证明按剧本取值）。
    const MUTATIONS_ERA = [
      ['generals_era:1000:BattleArray=999', 'BattleArray'],
      ['generals_era:1500:Force=999', 'Force'],
      ['generals_era:2000:UseForce=999', 'UseForce'],
      ['generals_era:2500:LoyalKing=999', 'LoyalKing'],
      ['generals_era:3000:Weapon=999', 'Weapon'],
      ['generals_era:1659:Weapon=短錐槍', 'Weapon'],
    ];
    const args = MUTATIONS_ERA.flatMap(([spec]) => ['--mutate', spec]);
    const { status, result } = runAudit(args);
    assert.ok(result, '注入 mutation 后 --json 输出无法解析');
    const t = byName(result, 'generals_era');
    assert.ok(t, '审计里没有表 generals_era');
    for (const [spec, field] of MUTATIONS_ERA) {
      assert.ok(
        t.diffs.some((d) => d.mutated && d.field === field),
        `注入 ${spec} 后 generals_era.${field} 没有报差异 → 逐剧本比对是恒真的！`,
      );
    }
    const hit = t.diffs.filter((d) => d.mutated);
    assert.equal(hit.length, MUTATIONS_ERA.length, `应报出 ${MUTATIONS_ERA.length} 条注入差异，实际 ${hit.length}`);
    assert.equal(result.totals.diffs, MUTATIONS_ERA.length, '注入了假差异但合计条数不对');
    assert.equal(status, 1, '有差异时审计应以 exit 1 退出');
  });

  // ── 负数自证：故意注入一格假差异，必须被抓住 ────────────────────────────
  // 每个核心表各注入一处，改的值是 999（原作取值域内不可能出现），
  // 若哪天真出现了 999，测试会以「mutation 未生效」的形式红，不会假装通过。
  const MUTATIONS = [
    ['items', 'items:0:Rate=999', 'Rate'],
    ['troops', 'troops:0:vs[0]=999', 'vs[0]'],
    ['formations', 'formations:0:vs[0]=999', 'vs[0]'],
    ['magics', 'magics:0:MP=999', 'MP'],
    ['wises', 'wises:0:Level=999', 'Level'],
  ];
  for (const [name, spec, field] of MUTATIONS) {
    test(`负数自证 ${name}：注入 ${spec} 必须报出差异（证明上面的 0 差异不是恒真）`, () => {
      const { status, result } = runAudit(['--mutate', spec]);
      assert.ok(result, '注入 mutation 后 --json 输出无法解析');
      const t = byName(result, name);
      assert.ok(t, `审计里没有表 ${name}`);
      const hit = t.diffs.filter((d) => d.field === field && d.mutated);
      assert.ok(hit.length >= 1, `注入 ${spec} 后 ${name}.${field} 没有报差异 → 断言是恒真的！`);
      assert.ok(result.totals.diffs >= 1, '注入了假差异但合计仍是 0');
      assert.equal(status, 1, '有差异时审计应以 exit 1 退出');
    });
  }
});
