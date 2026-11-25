#!/usr/bin/env node
/**
 * 保真校验网 —— 拿 gen_expect.mjs 生成的期望 JSON，逐条核对运行期实现。
 *
 *   node work/fidelity/check.mjs                 # 核对 game/dist/core/*.js（默认）
 *   node work/fidelity/check.mjs --src           # 核对 game/src/core/*.ts（node 24 原生剥离）
 *   node work/fidelity/check.mjs --only=magic    # 只跑某个前缀
 *   node work/fidelity/check.mjs --verbose       # PASS 也打印 got/want
 *   node work/fidelity/check.mjs --json          # 结果以 JSON 打到 stdout
 *
 * 断言分级：
 *   FAIL —— 有原作地址级证据（VA / INI 行 / 反汇编行）却不一致；退出码 1。
 *   WARN —— 期望本身是 [推断]/[推测]，或只是历史数据漂移提示；不计 FAIL。
 *   SKIP —— 竖屏化必然差异（letterbox / 视野 / 版面），不是缺口。
 *
 * 输出每条 { id, ok, skip, warn, got, want, evidence }。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const EXPECT_PATH = path.join(HERE, 'fidelity_expect.json');

const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ONLY = opt('only');
const MUTATE = opt('mutate');
const MODE = flag('src') ? 'src' : 'dist';
const VERBOSE = flag('verbose');
const JSON_OUT = flag('json');

// ── 输出框架 ────────────────────────────────────────────────────────────────
const rows = [];
const want = (id) => !ONLY || id.startsWith(ONLY);
const on = (prefix) => !ONLY || prefix.startsWith(ONLY) || ONLY.startsWith(prefix);
const fmt = (v) => {
  if (typeof v === 'string') return v;
  const s = JSON.stringify(v);
  return s && s.length > 200 ? s.slice(0, 200) + '…' : String(s);
};
const rec = {};

function ok(id, cond, got, want_, evidence) {
  if (!want(id)) return;
  rec[id] = rec[id] || 0;
  rows.push({ id, ok: !!cond, skip: false, warn: false, got, want: want_, evidence });
}
function warn(id, cond, got, want_, evidence) {
  if (!want(id)) return;
  rows.push({ id, ok: !!cond, skip: false, warn: true, got, want: want_, evidence });
}
function skip(id, why, evidence) {
  if (!want(id)) return;
  rows.push({ id, ok: true, skip: true, warn: false, got: 'skip', want: why, evidence });
}

const readText = (rel) => readFileSync(path.join(ROOT, rel), 'utf8');
const sha16 = (buf) => crypto.createHash('sha1').update(buf).digest('hex').slice(0, 16);
const clip = (s, n = 6) => (s.length > n ? s.slice(0, n) + '…' : s);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

if (!existsSync(EXPECT_PATH)) {
  console.error('缺少 work/fidelity/fidelity_expect.json —— 先跑 node work/fidelity/gen_expect.mjs');
  process.exit(2);
}
const E = JSON.parse(readFileSync(EXPECT_PATH, 'utf8'));

// ── 运行期数据（game/data/*.json）──────────────────────────────────────────
const DATA_FILES = [
  'magics', 'wises', 'troops', 'terrains', 'generals', 'items',
  'scenarios', 'formations', 'garrison', 'levels_by_scenario',
];
const D = {};
for (const name of DATA_FILES) {
  try {
    D[name] = JSON.parse(readText(`game/data/${name}.json`));
  } catch (err) {
    console.error(`读不到 game/data/${name}.json: ${err.message}`);
    process.exit(2);
  }
}
const MISSING = [];

// --mutate=magics.0.MP=999 —— 只改内存里的 D，用来证明校验网真的会红（不改仓库文件）
if (MUTATE) {
  const m = MUTATE.match(/^([A-Za-z_]+)\.(\d+)\.([A-Za-z0-9_]+)=(.*)$/);
  if (!m) {
    console.error(`--mutate 格式：table.index.field=value，例：--mutate=magics.0.MP=999（收到 ${MUTATE}）`);
    process.exit(2);
  }
  const [, table, idx, field, rawVal] = m;
  let val;
  try { val = JSON.parse(rawVal); } catch { val = rawVal; }
  if (!Array.isArray(D[table]) || !D[table][Number(idx)]) {
    console.error(`--mutate 目标不存在：${table}[${idx}]`);
    process.exit(2);
  }
  D[table][Number(idx)][field] = val;
  console.error(`[mutate] ${table}[${idx}].${field} := ${JSON.stringify(val)}（仅内存，用于验证断言会红）`);
}

// ── 运行期实现 ──────────────────────────────────────────────────────────────
const CORE = path.join(ROOT, 'game', MODE, 'core');
const EXT = MODE === 'src' ? '.ts' : '.js';
const imp = async (name) => {
  const file = path.join(CORE, name + EXT);
  if (!existsSync(file)) {
    MISSING.push(`game/${MODE}/core/${name}${EXT}`);
    return null;
  }
  return import(pathToFileURL(file).href);
};
const B = await imp('battle');
const W = await imp('wises');
const S = await imp('strategy');
const M = await imp('march');
const L = await imp('levels');
const G = await imp('garrison');
const A = await imp('audio_bus');
const U = await imp('unlock');

for (const m of MISSING) {
  ok('env.module.' + path.basename(m).replace(/\.(js|ts)$/, ''), false, 'missing', m,
    `跑一次构建（或 --src）让 ${m} 存在`);
}

// ── A. 环境与期望值新鲜度 ───────────────────────────────────────────────────
ok('env.mode', MODE === 'dist' || MODE === 'src', MODE, 'dist|src', '--src 直读 TS；默认 dist');
ok('env.expect.schema', E.schema === 1, E.schema, 1, 'work/fidelity/gen_expect.mjs 产出的 schema 版本');
ok('env.expect.generatedAt', typeof E.generatedAt === 'string' && !Number.isNaN(Date.parse(E.generatedAt)),
  E.generatedAt, 'ISO 时间', '期望值的生成时间；过期就重跑 gen_expect');

const changedExtract = [];
const changedData = [];
for (const s of E.sources || []) {
  const abs = path.join(ROOT, s.path);
  if (!existsSync(abs)) {
    changedExtract.push(`${s.path}(缺失)`);
    continue;
  }
  const buf = readFileSync(abs);
  if (buf.length !== s.bytes || sha16(buf) !== s.sha1_16) {
    (s.path.startsWith('game/data/') ? changedData : changedExtract).push(s.path);
  }
}
ok('env.expect.fresh', changedExtract.length === 0, changedExtract.length, 0,
  `原作侧源文件变了，期望值需要重生成：${clip(changedExtract.join(', '), 160) || '无'}`);
warn('env.expect.dataFresh', changedData.length === 0, changedData.length, 0,
  `game/data 指纹变了（允许的数据更新；若数值变了应重跑 gen_expect）：${clip(changedData.join(', '), 160) || '无'}`);
const badSelf = (E.selfCheck || []).filter((c) => !c.ok);
ok('env.expect.selfCheck', badSelf.length === 0, badSelf.map((c) => c.id), [],
  'gen_expect 自检：INI↔XLS↔data 的交叉核对必须全 ok');
ok('env.expect.speculations',
  (E.speculations || []).length > 0 && E.speculations.every((s) => s.id && s.what && s.why),
  (E.speculations || []).length, '>0 且每条有 id/what/why', '见 project/144_保真校验网.md §[推测] 清单');

// dist 是否落后于 src（并行 agent 可能正在改实现）
const staleFiles = [];
try {
  const srcDir = path.join(ROOT, 'game', 'src', 'core');
  const distDir = path.join(ROOT, 'game', 'dist', 'core');
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
  for (const src of walk(srcDir)) {
    if (!src.endsWith('.ts')) continue;
    const rel = path.relative(srcDir, src).replace(/\.ts$/, '.js');
    const dist = path.join(distDir, rel);
    if (existsSync(dist) && statSync(src).mtimeMs > statSync(dist).mtimeMs + 1000) {
      staleFiles.push(`game/src/core/${path.relative(srcDir, src).replace(/\\/g, '/')}`);
    }
  }
} catch { /* 目录缺失不致命 */ }
warn('env.dist.stale', staleFiles.length === 0, staleFiles.length, 0,
  `dist 落后于 src，先 npm run build 再判定 FAIL：${clip(staleFiles.join(', '), 160) || '无'}`);

// ── B. 条数与序号 ───────────────────────────────────────────────────────────
const counts = E.counts;
ok('meta.count.magics', D.magics.length === counts.magics, D.magics.length, counts.magics, 'MAGIC.INI 110 条（extract/json/magic.json magic_count）');
ok('meta.count.wises', D.wises.length === counts.wises, D.wises.length, counts.wises, 'MAGIC.INI [WISE] 67 条');
ok('meta.count.troops', D.troops.names.length === counts.troops, D.troops.names.length, counts.troops, 'XLS 宝典 13 兵种');
ok('meta.count.terrains', D.terrains.length === counts.terrains, D.terrains.length, counts.terrains, 'SANGO.INI [TERRAIN] 12 条');
ok('meta.count.generals', D.generals.length === counts.generals, D.generals.length, counts.generals, 'TIMES 401 GENERAL 段（含 id0 盜賊模板）');
ok('meta.count.items', D.items.length === counts.items, D.items.length, counts.items, 'SANGO.INI [ITEM] 77 条');
ok('meta.count.scenarios', D.scenarios.length === counts.scenarios, D.scenarios.length, counts.scenarios, 'TIMES1..5');
ok('meta.count.cities', D.scenarios.every((s) => s.cities.length === counts.citiesPerScenario),
  D.scenarios.map((s) => s.cities.length), counts.citiesPerScenario, '每剧本 60 城');
ok('meta.count.paths', D.scenarios.every((s) => s.paths.length === counts.pathsPerScenario),
  D.scenarios.map((s) => s.paths.length), counts.pathsPerScenario, '每剧本 116 条 PATH');
ok('meta.count.sentinels',
  D.scenarios.every((s) => s.paths.filter((p) => p.Length >= E.origin.sentinelLength).length === counts.sentinelPerScenario),
  D.scenarios.map((s) => s.paths.filter((p) => p.Length >= E.origin.sentinelLength).length),
  counts.sentinelPerScenario, 'docs/00_项目总览与文档索引.md:32「116 条里 39 条是 Length=30000 哨兵」');

const seqOk = (tbl) => tbl.every((r, i) => Number(r.SEQUENCE) === i + 1);
ok('meta.seq.magics', seqOk(D.magics), D.magics.map((m) => m.SEQUENCE).slice(0, 3), '1..110 连续', 'MAGIC.INI [MAGIC] SEQUENCE 无跳号');
ok('meta.seq.wises', seqOk(D.wises), D.wises.map((m) => m.SEQUENCE).slice(0, 3), '1..67 连续', 'MAGIC.INI [WISE] SEQUENCE 无跳号');
ok('meta.seq.generals',
  D.generals.slice(1).every((g, i) => Number(g.SEQUENCE ?? g.id) === i + 1 && Number(g.id) === i + 1),
  'ok', 'id=index 且 SEQUENCE 连续', 'scenarios.json 按 TIMES 行序落库');
ok('meta.generals.template',
  D.generals[0].NAME === E.generals.rows[0].name && Number(D.generals[0].BaseEXP) === E.generals.rows[0].baseExp &&
  Number(D.generals[0].TYPE) === E.generals.rows[0].type,
  { name: D.generals[0].NAME, baseExp: D.generals[0].BaseEXP, type: D.generals[0].TYPE },
  { name: E.generals.rows[0].name, baseExp: E.generals.rows[0].baseExp, type: E.generals.rows[0].type },
  'id0「盜賊」是模板行：BaseEXP=9999→Lv12、TYPE=30（造型符 0）');

// ── C. 武将技 110 条逐字段（INI 原始值）────────────────────────────────────
const MAGIC_FIELDS = [
  ['SEQUENCE', 'seq'], ['NAME', 'name'], ['MP', 'mp'], ['POWER', 'power'],
  ['ATTACK', 'attack'], ['SCRIPT', 'script'], ['ATTRIB', 'attrib'],
  ['TITLE', 'title'], ['NOTE', 'note'], ['ACTIVE', 'active'],
];
for (const em of E.magics) {
  if (!on('magic.row')) break;
  const got = D.magics[em.seq - 1] || {};
  const diffs = MAGIC_FIELDS.filter(([k, ek]) => !same(got[k], em[ek]))
    .map(([k, ek]) => `${k}:${fmt(got[k])}≠${fmt(em[ek])}`);
  ok(`magic.row.${String(em.seq).padStart(3, '0')}`, diffs.length === 0, diffs, 'INI 10 字段一致',
    `extract/json/magic.json entries[kind=magic, sequence=${em.seq}]（MAGIC.INI cp950）· xls_武将技 第${em.seq}行数值 0 差异`);
}

// ── D. 武将技音效（MAGIC.SO 的 PUSHS 字符串）───────────────────────────────
for (const em of E.magics) {
  if (!on('magic.sfx')) break;
  const got = A.magicSfxName(em.seq);
  const all = em.sfx.all;
  const cond = all.includes(got) && (all.length !== 1 || got === all[0]);
  ok(`magic.sfx.${String(em.seq).padStart(3, '0')}`, cond, got, all.join('|'),
    `work/dis_magicmap_skills.txt 「#${em.seq} ${em.name}」音效字符串（${em.sfx.direct ? '直证' : '策展'}，证级 ${em.sfx.grade}，via ${em.sfx.via}）`);
}
if (on('magic.sfx')) {
  const keys = Object.keys(A.MAGIC_SFX);
  const expectKeys = E.magics.map((m) => String(m.seq).padStart(3, '0'));
  ok('magic.sfx.count', keys.length === E.magics.length && expectKeys.every((k) => k in A.MAGIC_SFX),
    keys.length, E.magics.length, 'MAGIC_SFX 键 = SEQUENCE 三位补零，110 条全覆盖');
  const gradeDiffs = E.magics.filter((m) => {
    const g = A.MAGIC_SFX_GRADE[String(m.seq).padStart(3, '0')];
    return g !== m.sfx.gradeRaw && ['A', 'A2', 'C'].includes(m.sfx.gradeRaw);
  }).map((m) => `${m.seq}:${A.MAGIC_SFX_GRADE[String(m.seq).padStart(3, '0')]}≠${m.sfx.gradeRaw}`);
  warn('magic.sfx.grade', gradeDiffs.length === 0, gradeDiffs.length, 0,
    `音效证级是策展口径（work/sfx84/map6.json），不一致不代表错：${clip(gradeDiffs.join(', '), 160)}`);
  const directBad = E.magics.filter((m) => m.sfx.direct).filter((m) => !m.sfx.all.includes(A.magicSfxName(m.seq)))
    .map((m) => `${m.seq}:${A.magicSfxName(m.seq)}∉${m.sfx.all.join('|')}`);
  ok('magic.sfx.direct', directBad.length === 0, directBad.length, 0,
    `有 dis 直证的音效必须取自该技能 PUSHS 字符串集合（seq 95 同时有 m038snd01/02，取后者即可）：${clip(directBad.join(', '), 160)}`);
}

// ── E. 派生规则（气力/特效/取表）────────────────────────────────────────────
if (on('magic.')) {
  const kindDiffs = [];
  for (const em of E.magics) {
    const k = B.skillKindOf(D, em.seq);
    if (k !== em.castKind) kindDiffs.push(`${em.seq}:${k}≠${em.castKind}(${em.attrib})`);
  }
  warn('magic.castkind', kindDiffs.length === 0, kindDiffs.length, 0,
    `[推断] ATTRIB 補血/補兵→恢复、ATTACK≥40→群体、其余单体；与 magic.json category 非一一对应：${clip(kindDiffs.join(', '), 240)}`);

  const qiDiffs = E.magics.filter((em) => B.qiPowerPercentOf(D.magics[em.seq - 1]) !== em.qiPercent)
    .map((em) => `${em.seq}:${B.qiPowerPercentOf(D.magics[em.seq - 1])}≠${em.qiPercent}`);
  warn('magic.qipercent', qiDiffs.length === 0, qiDiffs.length, 0,
    `[推测] POWER 全 100 → 用 clamp(round(MP),20,80) 当百分比：${clip(qiDiffs.join(', '), 160)}`);

  const costDiffs = E.magics.filter((em) =>
    B.qiCostOf(D, em.seq) !== Math.round(em.qiPercent * E.origin.qiMax / 100))
    .map((em) => `${em.seq}:${B.qiCostOf(D, em.seq)}≠${Math.round(em.qiPercent * E.origin.qiMax / 100)}`);
  warn('magic.qicost', costDiffs.length === 0, costDiffs.length, 0,
    `[推测] 气力消耗 = POWER% × QI_MAX/100 = qiPercent×1200：${clip(costDiffs.join(', '), 160)}`);

  const ttlDiffs = E.magics.filter((em) => {
    const frames = Number(D.magics[em.seq - 1].fx_frames) || 0;
    const ttl = B.fxTtlOf(D, em.seq);
    if (frames <= 0) return ttl !== B.FX_TTL_DEFAULT;
    const want_ = Math.min(B.FX_TTL_MAX, Math.max(B.FX_TTL_MIN, Math.round(frames * B.FX_TICK_PER_FRAME)));
    return ttl !== want_;
  }).map((em) => em.seq);
  warn('magic.fxttl', ttlDiffs.length === 0, ttlDiffs.length, 0,
    `[推测] 特效驻留 = clamp(round(帧数×2.2),24,132)，无帧→30；frames 来自 MAGIC.SO 目录：${clip(ttlDiffs.join(','), 160)}`);

  const bySeqDiffs = E.magics.filter((em) => B.magicBySeq(D, em.seq)?.NAME !== em.name).map((em) => em.seq);
  ok('magic.byseq', bySeqDiffs.length === 0, bySeqDiffs.length, 0,
    'magicBySeq(seq) 必须按 SEQUENCE 取到同名技能（battle.ts 取表口径）');

  ok('magic.qimax',
    B.QI_MAX === E.origin.qiMax && B.QI_START === E.origin.qiStart && B.QI_COST_SCALE === E.origin.qiCostScale,
    { qiMax: B.QI_MAX, qiStart: B.QI_START, qiCostScale: B.QI_COST_SCALE },
    E.origin.qiMax && { qiMax: E.origin.qiMax, qiStart: E.origin.qiStart, qiCostScale: E.origin.qiCostScale },
    'docs/04b3_单挑流程.md:259,381「气力上限 0x1D4C0=120000、初始 0xEA60=60000」');
}

// ── F. 军师技 67 条逐字段 ───────────────────────────────────────────────────
for (const ew of E.wises) {
  if (!on('wise.row')) break;
  const got = D.wises[ew.seq - 1] || {};
  const pairs = [
    ['SEQUENCE', ew.seq], ['NAME', ew.name], ['Execute', ew.execute],
    ['WiseLevel', ew.wiseLevel], ['Level', ew.level],
    ['ATTRIB', String(ew.attrib)], ['ACTIVE', ew.activeMask],
  ];
  const diffs = pairs.filter(([k, v]) => String(got[k]) !== String(v)).map(([k, v]) => `${k}:${fmt(got[k])}≠${v}`);
  ok(`wise.row.${String(ew.seq).padStart(3, '0')}`, diffs.length === 0, diffs, 'INI 7 字段一致',
    `extract/json/magic.json entries[kind=wise, sequence=${ew.seq}] · xls_军师技 第${ew.seq}行（docs/03b:499-507 逐条 0 不一致）`);
}

if (on('wise.')) {
  const execs = new Set(D.wises.map((w) => Number(w.Execute)));
  ok('wise.exec.unique', execs.size === D.wises.length, execs.size, D.wises.length,
    'MAGIC.INI [WISE] 67 条执行代码互不重复（策略表按 Execute 索引）');

  ok('wise.strategy.table', S.STRATEGY_TABLE.length === D.wises.length,
    S.STRATEGY_TABLE.length, D.wises.length, 'strategy.ts STRATEGY_TABLE 必须按 67 条军师技建表');
  const tableExecs = new Set(S.STRATEGY_TABLE.map((d) => Number(d.exec)));
  const missExec = [...execs].filter((e) => !tableExecs.has(e));
  ok('wise.strategy.exec', missExec.length === 0, missExec.length, 0,
    `军师技 Execute 必须都能在策略表查到（strategyDefOf）：缺 ${clip(missExec.join(','), 120)}`);

  const specBad = Object.entries(W.WISE_SPECS).filter(([k, v]) =>
    !(Number(k) >= 1 && Number(k) <= D.wises.length) ||
    typeof v.kind !== 'string' || !['self', 'enemy'].includes(v.target) ||
    typeof v.op !== 'string' || !Number.isFinite(v.value));
  ok('wise.specs.shape', specBad.length === 0, specBad.map(([k]) => k).slice(0, 6), '结构合法',
    'WISE_SPECS 键=wises.SEQUENCE，值 {kind,target:self|enemy,op,value}');

  const unimpl = W.WISE_UNIMPLEMENTED;
  const unimplNoStrategy = unimpl.filter((seq) => {
    const w = D.wises[seq - 1];
    return !w || !S.strategyDefOf(Number(w.Execute));
  });
  ok('wise.unimpl.strategy', unimplNoStrategy.length === 0, unimplNoStrategy, [],
    `[推断] 13 条未实现军师技仍应能作为战术指令下达：${clip(unimpl.join(','), 120)}`);
  const gap = unimpl.filter((seq) => W.wiseEffectOf(D, seq) === null && W.wiseHintOf(seq) === '');
  warn('wise.unimpl.effect', gap.length <= 1, gap, '≤1（预期只有 seq 3 後選出陣）',
    `无 spec 也无 hint 的占位条目：${clip(gap.join(','), 120)}（battle 效果未复现，文档 §待修）`);

  const expectParse = (si) => E.generals.rows.slice(1).map((r) => r.wiseSkills);
  const parseDiffs = [];
  for (const r of E.generals.rows.slice(1)) {
    const gen = D.generals[r.id];
    if (!gen) continue;
    const got = W.parseWiseSkill(gen).map(([lv, seq]) => [lv, seq]);
    const want_ = r.wiseSkills;
    if (!same(got, want_)) parseDiffs.push(r.id);
  }
  const totalPairs = E.generals.rows.slice(1).reduce((n, r) => n + r.wiseSkills.length, 0);
  ok('wise.parse', parseDiffs.length === 0, parseDiffs.length, 0,
    `parseWiseSkill（'等级, seq' 字符串/数组兼容）必须还原 TIMES 的 ${totalPairs} 条军师技学习行：差 ${clip(parseDiffs.join(','), 120)}`);
  const rangeBad = E.generals.rows.slice(1).flatMap((r) => r.wiseSkills)
    .filter(([lv, seq]) => !(lv >= 1 && lv <= E.origin.actionIntervalFrames + 1) || !(seq >= 1 && seq <= D.wises.length));
  ok('wise.parse.range', rangeBad.length <= 1, rangeBad.length, 0,
    `学习等级/技能号越界（仅允许 seq3 的 [阻塞] 特例）：${clip(JSON.stringify(rangeBad.slice(0, 3)), 120)}`);

  const emptyChoices = E.generals.rows.slice(1).filter((r) => W.listWisdomChoices(D, D.generals[r.id]).length === 0);
  ok('wise.choices', emptyChoices.length === 0, emptyChoices.length, 0,
    '99 级时每个武将都应有可学军师技（listWisdomChoices 过滤 learn<=level 且 WiseLevel<=level，同名取最高档）');

  const w0 = B.createWorld({ data: D });
  const before = w0.sides.A.morale;
  W.applyWise(w0, 'A', 1);
  const spec1 = W.WISE_SPECS[1];
  ok('wise.apply.morale', w0.sides.A.morale - before === spec1.value,
    w0.sides.A.morale - before, spec1.value, '军师技 1 鼓舞士氣（Execute=4, morale-up 15?）→ WISE_SPECS[1] 的 morale_add');
}

// ── G. 兵种 13 × 相克 13×13 ────────────────────────────────────────────────
ok('troop.names', same(D.troops.names, E.troops.names), D.troops.names, E.troops.names,
  'XLS 宝典 兵种表 13 列名（与 extract/json/xls_兵种.json header 一致）');
for (let i = 0; i < E.troops.names.length; i++) {
  if (!on('troop.matrix')) break;
  const got = D.troops.matrix[i] || {};
  const cond = got.name === E.troops.names[i] && same(got.vs, E.troops.matrix[i]);
  ok(`troop.matrix.${String(i).padStart(2, '0')}`, cond, { name: got.name, vs: got.vs }, { name: E.troops.names[i], vs: E.troops.matrix[i] },
    `xls_兵种.json rows[${i}][1..13]（正负号相克值）`);
}
if (on('troop.bonus')) {
  const bad = [];
  for (let i = 0; i < E.troops.matrix.length; i++) {
    for (let j = 0; j < E.troops.matrix.length; j++) {
      const got = B.troopBonus(D, i, j);
      if (got !== E.troops.matrix[i][j]) bad.push(`${i},${j}:${got}≠${E.troops.matrix[i][j]}`);
    }
  }
  ok('troop.bonus', bad.length === 0, bad.length, 0,
    `troopBonus(攻击方,防守方) 169 格必须等于 XLS 矩阵：${clip(bad.join(';'), 200)}`);
  ok('troop.bonus.diag', E.troops.matrix.every((r, i) => r[i] === 0) && B.troopBonus(D, 0, 0) === 0, 'ok', 0,
    '同兵种相克值为 0（XLS 对角 0）');
}
ok('troop.interval.general', B.actionIntervalOf({ isGeneral: true }) === E.troops.attackIntervalFrames,
  B.actionIntervalOf({ isGeneral: true }), E.troops.attackIntervalFrames,
  'work/dis_battle_units.txt:1624「0043B5DE mov dword ptr [ecx+0x34], 0x28」=40 帧');
ok('troop.interval.soldier', B.actionIntervalOf({ isGeneral: false }) === E.troops.attackIntervalFrames,
  B.actionIntervalOf({ isGeneral: false }), E.troops.attackIntervalFrames,
  'docs/04b3_单挑流程.md:71-89「普通 40 帧；0x4000 状态 46 帧未实现[推测]」');
ok('troop.interval.consts',
  B.ACTION_INTERVAL_TICKS === E.troops.attackIntervalFrames && B.ATTACK_COOLDOWN === E.troops.attackIntervalFrames,
  { general: B.ACTION_INTERVAL_TICKS, soldier: B.ATTACK_COOLDOWN }, E.troops.attackIntervalFrames,
  '主将/士兵共用同一 40 帧常量（原作 unit+0x34）');
ok('troop.tickhz', B.TICK_HZ === E.origin.tickHz, B.TICK_HZ, E.origin.tickHz, '战斗 tick 30Hz');
ok('troop.nospeedfield', E.troops.perTroopSpeedField === false && !('speed' in (D.troops.matrix[0] || {})),
  E.troops.perTroopSpeedField, false,
  '原作 13 兵种没有各自攻速/移动字段：间隔统一 40 帧、速度由 MOVE_PER_TICK 全局系数决定');

// ── H. 地形 12 条 + 资源存在 ────────────────────────────────────────────────
for (const et of E.terrains) {
  if (!on('terrain.row')) break;
  const got = D.terrains[et.seq] || {};
  const diffs = [
    ['Sequence', et.seq], ['Name', et.name], ['SoundTrack', et.soundtrack], ['Floor', et.floor],
    ['Foreground', et.foreground], ['Midground', et.midground], ['Background', et.background],
  ].filter(([k, v]) => !same(got[k], v)).map(([k, v]) => `${k}:${fmt(got[k])}≠${fmt(v)}`);
  ok(`terrain.row.${String(et.seq).padStart(2, '0')}`, diffs.length === 0, diffs, 'INI 7 字段一致',
    `extract/json/sango.json terrain[${et.seq}]（SANGO.INI [TERRAIN]）`);
}
for (const et of E.terrains) {
  if (!on('terrain.files')) break;
  const missing = [];
  if (!existsSync(path.join(ROOT, et.files.floor))) missing.push(et.files.floor);
  for (const f of [...et.files.fg, ...et.files.mg, ...et.files.bg]) {
    if (!existsSync(path.join(ROOT, f))) missing.push(f);
  }
  ok(`terrain.files.${String(et.seq).padStart(2, '0')}`, missing.length === 0, missing, [],
    `Floor 1 张 TGA + FG/MG/BG 各 2 张 SHP 必须存在（${et.files.floor}）`);
}
if (on('terrain.soundtrack')) {
  ok('terrain.soundtrack', E.terrains.every((et) => Number.isInteger(et.soundtrack) && D.terrains[et.seq].SoundTrack === et.soundtrack),
    E.terrains.map((et) => et.soundtrack), 'SANGO.INI SoundTrack 原值',
    '地形 BGM 编号来自 SANGO.INI，check 只做回归保护（音频资源未在 extract 里）');
}

// ── I. 武将 401：证件 / 造型 / 数值 / 学习表 ───────────────────────────────
ok('general.count', D.generals.length === counts.generals, D.generals.length, counts.generals, 'TIMES 401 段');
ok('general.names.unique', new Set(D.generals.map((g) => g.NAME)).size === D.generals.length,
  new Set(D.generals.map((g) => g.NAME)).size, D.generals.length, '401 个名字互不重复（学习表按名字索引）');
if (on('general.face')) {
  const faceBad = E.generals.rows.filter((r) => {
    const g = D.generals[r.id];
    return !g || String(g.FACE) !== r.face;
  }).map((r) => r.id);
  const faceMissing = E.generals.rows.filter((r) => !existsSync(path.join(ROOT, r.faceFile))).map((r) => r.faceFile);
  ok('general.face.ref', faceBad.length === 0, faceBad.length, 0,
    `FACE 字段必须等于 TIMES 的图形文件名：差 ${clip(faceBad.join(','), 120)}`);
  ok('general.face.files', faceMissing.length === 0, faceMissing.length, 0,
    `extract/pak/SHAPE/FACE/FACE001..400.SHP 全部存在（times cross_checks.face_miss=0）：缺 ${clip(faceMissing.join(','), 120)}`);
}
if (on('general.type')) {
  const typeBad = E.generals.rows.filter((r) => Number(D.generals[r.id]?.TYPE) !== r.type).map((r) => r.id);
  ok('general.type', typeBad.length === 0, typeBad.length, 0,
    `TYPE 必须等于 XLS 群英2 第 60 列「图形的类型」：差 ${clip(typeBad.join(','), 120)}`);
  const hist = {};
  for (const r of E.generals.rows) hist[r.type] = (hist[r.type] || 0) + 1;
  ok('general.type.hist', same(hist, E.generals.typeHistogram), hist, E.generals.typeHistogram,
    'TYPE 分布回归（1..15，id0=30）');
}
if (on('general.shape')) {
  const atlas = readText('game/src/view/generalAtlas.ts');
  const m = atlas.match(/SHAPE_OF_TYPE\s*=\s*\[([^\]]+)\]/);
  const got = m ? m[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')) : null;
  ok('general.shape.map', same(got, E.generals.shapeOfType), got, E.generals.shapeOfType,
    'game/src/view/generalAtlas.ts SHAPE_OF_TYPE（1..9,A..E,0）必须等于 TYPE→造型映射（project/48_武将小人装配.md:19,217-223）');
  const famBad = Object.entries(E.generals.shapeFamilies).filter(([, v]) => !(v.L > 0 && v.R > 0)).map(([k]) => k);
  ok('general.shape.files', famBad.length === 0, famBad, [],
    `MAJOR/BODY 每个造型符都要有 L/R 两套 SHP（extract/pak/SHAPE/MAJOR/BODY）：缺 ${clip(famBad.join(','), 120)}`);
}
if (on('general.xls')) {
  const bad = [];
  for (const [seq, war, int] of E.generals.xlsWarInt) {
    const g = D.generals[seq];
    if (!g || Number(g.STR) !== war || Number(g.INT) !== int) bad.push(`${seq}(${g?.STR},${g?.INT})≠(${war},${int})`);
  }
  ok('general.xls', bad.length === 0, bad.length, 0,
    `STR/INT 与 XLS 群英2 400 行逐条一致：${clip(bad.join(';'), 200)}`);
}
if (on('general.fields')) {
  const key = (g, k) => g?.[k] ?? g?.[k.toUpperCase()];
  const bad = [];
  for (const r of E.generals.rows.slice(1)) {
    const g = D.generals[r.id];
    const pairs = [
      ['Name', key(g, 'NAME'), r.name], ['Str', key(g, 'STR'), r.str], ['Int', key(g, 'INT'), r.int],
      ['BaseHP', key(g, 'BaseHP'), r.maxHp], ['BaseMP', key(g, 'BaseMP'), r.maxMp],
      ['BaseEXP', key(g, 'BaseEXP'), r.baseExp], ['Loyal', key(g, 'Loyal'), r.loyal],
      ['Spirit', key(g, 'Spirit'), r.spirit], ['CONSTANCY', key(g, 'CONSTANCY'), r.constancy],
      ['Weapon', key(g, 'Weapon'), r.weapon], ['Horse', key(g, 'Horse'), r.horse],
      ['BattleArray', key(g, 'BattleArray'), r.battleArray], ['UseBattleArray', key(g, 'UseBattleArray'), r.useBattleArray],
      ['Force', key(g, 'Force'), r.force], ['UseForce', key(g, 'UseForce'), r.useForce],
    ];
    for (const [k, got, want_] of pairs) {
      if (!same(String(got), String(want_))) bad.push(`${r.id}.${k}:${fmt(got)}≠${fmt(want_)}`);
    }
    const pos = key(g, 'POS');
    if (!same(pos, r.posByScenario[0])) bad.push(`${r.id}.POS:${fmt(pos)}≠${fmt(r.posByScenario[0])}`);
    const byTimes = key(g, 'pos_by_times');
    if (Array.isArray(byTimes) && byTimes.length === 5) {
      const got5 = byTimes.map((s) => String(s).split(/\s+/));
      if (!same(got5, r.posByScenario)) bad.push(`${r.id}.pos_by_times:${fmt(got5[0])}≠${fmt(r.posByScenario[0])}`);
    }
  }
  ok('general.fields', bad.length === 0, bad.length, 0,
    `TIMES 字段（STR/INT/HP/MP/EXP/相性/武器/马/阵形/兵种/五剧本坐标）逐条一致：${clip(bad.join(';'), 240)}`);
  ok('general.levelbase',
    E.generals.rows.slice(1).every((r) => r.baseExp === 200) && E.generals.rows[0].baseExp === 9999,
    { baseExp: [...new Set(E.generals.rows.slice(1).map((r) => r.baseExp))], template: E.generals.rows[0].baseExp },
    { baseExp: [200], template: 9999 }, 'TIMES BaseEXP：400 将全 200（→Lv2），盜賊 9999（→Lv12）');
}
if (on('general.skills')) {
  for (const table of ['SKILL', 'WISESKILL']) {
    const bad = [];
    let n = 0;
    for (const r of E.generals.rows.slice(1)) {
      const got = U.learnTableOf(D, r.name, table).map((x) => [Number(x.level), Number(x.seq)]);
      const want_ = table === 'SKILL' ? r.skills : r.wiseSkills;
      n += want_.length;
      if (!same(got, want_)) bad.push(`${r.id}:${fmt(got)}≠${fmt(want_)}`);
    }
    ok(`general.${table === 'SKILL' ? 'skills' : 'wiseSkills'}`, bad.length === 0, bad.length, 0,
      `learnTableOf(${table}) 必须还原 TIMES 的 ${n} 条学习行：${clip(bad.join(';'), 200)}`);
  }
  const learnRows = E.generals.rows.slice(1).flatMap((r) => r.skills);
  const badRange = learnRows.filter(([lv, seq]) => lv < 1 || lv > U.LEARN_MAX_LEVEL || seq < 1 || seq > D.magics.length);
  ok('general.skill.range', badRange.length === 0, badRange.length, 0,
    `武将技学习行等级 1..${U.LEARN_MAX_LEVEL}、技能号 1..110：越界 ${clip(JSON.stringify(badRange.slice(0, 3)), 120)}`);
}

// ── J. 剧本 5 × 60 城 × 116 路 ─────────────────────────────────────────────
for (const es of E.scenarios) {
  const Ds = D.scenarios[es.id - 1];
  if (!Ds) continue;
  const si = es.id;
  if (on('scen.')) {
    const cityBad = [];
    for (let i = 0; i < es.cities.length; i++) {
      const ec = es.cities[i];
      const dc = Ds.cities[i];
      if (!dc || dc.NAME !== ec.name || !same(dc.POS, [ec.x, ec.y])) cityBad.push(`${i + 1}:${dc?.NAME}/${fmt(dc?.POS)}≠${ec.name}/${ec.x},${ec.y}`);
      if (ec.x < 0 || ec.x > E.origin.mapW || ec.y < 0 || ec.y > E.origin.mapH) cityBad.push(`${ec.name}:坐标越界`);
    }
    ok(`scen.${si}.cities`, cityBad.length === 0 && Ds.cities.length === es.cityCount, cityBad.length, 0,
      `TIMES${si} CITY 60 条：名称/POS 一致且落在 ${E.origin.mapW}×${E.origin.mapH} 内：${clip(cityBad.join(';'), 200)}`);

    const pathBad = [];
    let sent = 0;
    for (let i = 0; i < es.paths.length; i++) {
      const ep = es.paths[i];
      const dp = Ds.paths[i];
      if (ep.sentinel) sent++;
      if (!dp || dp.Start !== ep.start || dp.End !== ep.end || Number(dp.Length) !== ep.length) {
        pathBad.push(`${i + 1}:${fmt(dp?.Start)}-${fmt(dp?.End)}/${dp?.Length}≠${ep.start}-${ep.end}/${ep.length}`);
      }
    }
    ok(`scen.${si}.paths`, pathBad.length === 0 && Ds.paths.length === es.pathCount, pathBad.length, 0,
      `TIMES${si} PATH 116 条：Start/End/Length 一致：${clip(pathBad.join(';'), 200)}`);

    const ptsBad = [];
    for (let i = 0; i < es.paths.length; i++) {
      const ep = es.paths[i];
      const dp = Ds.paths[i];
      const flat = (dp?.points || []).flatMap((p) => [Number(p[0]), Number(p[1])]);
      const hash = sha16(Buffer.from(JSON.stringify([flat]), 'utf8'));
      if (dp.points.length !== ep.npts || hash !== ep.pointsSha16) ptsBad.push(`${i + 1}:n=${dp.points.length}≠${ep.npts}`);
    }
    ok(`scen.${si}.points`, ptsBad.length === 0, ptsBad.length, 0,
      `路点坐标逐点一致（times 扁平数组 [x1,y1,…] ↔ data 点对数组）：${clip(ptsBad.join(';'), 160)}`);

    ok(`scen.${si}.sentinel`, sent === es.sentinelCount && es.sentinelCount === counts.sentinelPerScenario,
      sent, es.sentinelCount, 'Length=30000 哨兵条数（docs/00:32、docs/03b:874,881）');

    ok(`scen.${si}.kings`, Ds.kings.length === es.kings, Ds.kings.length, es.kings,
      `TIMES${si} KING 段条数（extract/json/times${si}.json kings`);

    ok(`scen.${si}.system`, Ds.system.TIME === es.name && Number(Ds.system.YEAR) === es.year,
      { TIME: Ds.system.TIME, YEAR: Ds.system.YEAR }, { TIME: es.name, YEAR: es.year },
      `TIMES${si} [SYSTEM] TIME/YEAR`);

    const lb = (D.levels_by_scenario?.scenarios || []).find((x) => Number(x.id) === si) ||
      (D.levels_by_scenario?.scenarios || [])[si - 1];
    const wantLv = { baseExpCommon: lb?.baseExpCommon, defaultLevel: lb?.defaultLevel };
    ok(`scen.${si}.levels`,
      es.levels.baseExpCommon === wantLv.baseExpCommon && es.levels.defaultLevel === wantLv.defaultLevel &&
      es.levels.defaultLevel === L.levelFromExp(es.levels.baseExpCommon),
      es.levels, wantLv,
      `TIMES${si} BaseEXP(${es.levels.baseExpCommon}) → levelFromExp 必须等于 levels_by_scenario 的 defaultLevel（0x409F73，docs/04b:217-223）`);
  }
}

if (on('scen.')) {
  for (const es of E.scenarios) {
    const real = es.paths.filter((p) => !p.sentinel);
    const adj = new Map();
    for (const p of real) {
      for (const [a, b] of [[p.start, p.end], [p.end, p.start]]) {
        if (!adj.has(a)) adj.set(a, new Set());
        adj.get(a).add(b);
      }
    }
    const seen = new Set([es.cities[0]?.name]);
    const queue = [es.cities[0]?.name];
    while (queue.length) {
      const cur = queue.shift();
      for (const nx of adj.get(cur) || []) if (!seen.has(nx)) { seen.add(nx); queue.push(nx); }
    }
    const isolated = es.cities.map((c) => c.name).filter((n) => !seen.has(n));
    ok(`scen.${es.id}.connected`, isolated.length === 0, isolated.length, 0,
      `77 条真路必须把 60 城连成 1 个连通分量（docs/03b:881）：孤岛 ${clip(isolated.join(','), 120)}`);
  }
}

// ── K. 关卡行军：哨兵 / 路长 / 位置 ────────────────────────────────────────
if (on('march.')) {
  ok('march.sentinel', M.SENTINEL_LENGTH === E.origin.sentinelLength, M.SENTINEL_LENGTH, E.origin.sentinelLength,
    'docs/00_项目总览与文档索引.md:32「Length=30000 是"画了线但不可走"的哨兵」');
  ok('march.permonth', Math.abs(M.MARCH_PER_MONTH - 1 / 3) < 1e-12, M.MARCH_PER_MONTH, 1 / 3,
    '[推测] 行军 1/3 月每格（march.ts MARCH_PER_MONTH）');

  const Ds = D.scenarios[0];
  const es = E.scenarios[0];
  const realIdx = Ds.paths.findIndex((p) => p.Length < E.origin.sentinelLength);
  const rp = Ds.paths[realIdx];
  const pairReal = M.pathBetween(Ds, rp.Start, rp.End);
  ok('march.pair.real', pairReal !== null && Number(Ds.paths[pairReal]?.Length) < E.origin.sentinelLength,
    pairReal, '非 null 且指向真路', 'pathBetween 只走 Length<30000 的一跳邻接');
  const sentIdx = Ds.paths.findIndex((p) => p.Length >= E.origin.sentinelLength);
  const sp = Ds.paths[sentIdx];
  const hasRealTwin = Ds.paths.some((p2, j) => j !== sentIdx && p2.Length < E.origin.sentinelLength &&
    ((p2.Start === sp.Start && p2.End === sp.End) || (p2.Start === sp.End && p2.End === sp.Start)));
  if (!hasRealTwin) {
    ok('march.pair.sentinel', M.pathBetween(Ds, sp.Start, sp.End) === null,
      M.pathBetween(Ds, sp.Start, sp.End), null, `哨兵路 ${sp.Start}→${sp.End}（Length=${sp.Length}）不可通行`);
  } else {
    skip('march.pair.sentinel', '哨兵路两端另有真路，pathBetween 返回真路属正常', 'march.ts pathBetween');
  }

  const t0 = M.posOf(Ds, { pathIndex: realIdx, progress: 0, from: rp.Start });
  const t1 = M.posOf(Ds, { pathIndex: realIdx, progress: 1, from: rp.Start });
  const first = rp.points[0];
  const last = rp.points[rp.points.length - 1];
  ok('march.pos.ends', same(t0, first) && same(t1, last), { t0, t1 }, { first, last },
    'posOf 在 progress 0/1 必须落在路径首末点（march.ts 沿 points 等距插值）');
}

// ── L. 等级 / 带兵数（VA 级证据）────────────────────────────────────────────
if (on('level.')) {
  const expDiffs = [];
  for (let k = 1; k <= 99; k++) {
    if (B.expToReach(k) !== E.origin.expTable[k - 1]) expDiffs.push(`${k}:${B.expToReach(k)}≠${E.origin.expTable[k - 1]}`);
  }
  ok('level.exp', expDiffs.length === 0, expDiffs.length, 0,
    `expToReach(k) = k>99?9999999:(((k-1)*137-34)*k)/2+17（0x409EE0，docs/04b:217-223,666）：${clip(expDiffs.join(';'), 200)}`);

  const rt = [];
  for (let k = 1; k <= 99; k++) if (L.levelFromExp(B.expToReach(k)) !== k) rt.push(k);
  ok('level.roundtrip', rt.length === 0, rt.length, 0,
    `levelFromExp(expToReach(k)) 必须回到 k（0x409F73）：断点 ${clip(rt.join(','), 120)}`);

  const capBad = [];
  for (let k = 1; k <= 99; k++) {
    const want_ = Math.max(1, Math.min(k * 5, 100));
    if (L.troopCapOf(k) !== want_) capBad.push(`${k}:${L.troopCapOf(k)}≠${want_}`);
  }
  ok('level.troopcap', capBad.length === 0, capBad.length, 0,
    `troopCapOf(lv)=max(1,min(lv*5,100))（0x409FB6，docs/00:166）：${clip(capBad.join(';'), 160)}`);

  const cavBad = [];
  for (let k = 1; k <= 99; k++) {
    const want_ = Math.max(0, Math.min((k - 20) * 5, 100));
    if (L.cavalryCapOf(k) !== want_) cavBad.push(`${k}:${L.cavalryCapOf(k)}≠${want_}`);
  }
  ok('level.cavcap', cavBad.length === 0, cavBad.length, 0,
    `cavalryCapOf(lv)=max(0,min((lv-20)*5,100))（0x409FD8）：${clip(cavBad.join(';'), 160)}`);

  const startBad = E.generals.rows.filter((r) => {
    const lv = L.startLevelOf({ BaseEXP: r.baseExp });
    return lv !== E.origin.levelTable[String(r.baseExp)];
  }).map((r) => r.id);
  ok('level.start', startBad.length === 0, startBad.length, 0,
    `startLevelOf(BaseEXP) 必须等于 levelFromExp(BaseEXP)（0x42D38B→0x409F73）：差 ${clip(startBad.join(','), 160)}`);
}

// ── M. 守城战配置（garrison.battleSetup）───────────────────────────────────
if (on('garrison.')) {
  const setupBad = [];
  let exeN = 0, emptyN = 0;
  const basisCount = {};
  for (let si = 0; si < D.scenarios.length; si++) {
    for (const city of D.scenarios[si].cities) {
      const g = G.garrisonOf(D, si, city.NAME);
      const hasOfficer = !!(g && g.officers.length);
      if (hasOfficer) exeN++; else emptyN++;
      let bs = null;
      try { bs = G.battleSetup(D, si, city.NAME, 100, { troopMode: 'exe' }); } catch (err) { setupBad.push(`${si}:${city.NAME}:throw ${err.message}`); continue; }
      basisCount[bs.enemyTroopsBasis] = (basisCount[bs.enemyTroopsBasis] || 0) + 1;
      if (!bs || !Number.isFinite(bs.enemyTroops) || bs.enemyTroops < 1 || bs.enemyTroops > 200) {
        setupBad.push(`${si}:${city.NAME}:troops=${bs?.enemyTroops}`);
      }
      if (hasOfficer && !bs.enemyGeneral?.name) setupBad.push(`${si}:${city.NAME}:无守将名`);
      if (hasOfficer && !String(bs.enemyTroopsBasis).startsWith('estimate:帶兵數')) {
        setupBad.push(`${si}:${city.NAME}:basis=${bs.enemyTroopsBasis}`);
      }
      if (hasOfficer && bs.enemyTroops !== Math.max(1, Math.min(200, Number(bs.enemyParams?.soldiers) || 0))) {
        setupBad.push(`${si}:${city.NAME}:troops≠clamp(soldiers)`);
      }
    }
  }
  const total = exeN + emptyN;
  ok('garrison.setup', setupBad.length === 0 && total === D.scenarios.length * counts.citiesPerScenario,
    { bad: setupBad.length, cities: total, basis: basisCount }, { bad: 0, cities: 300 },
    `300 城 battleSetup 不抛错、enemyTroops∈[1,200]、有守将时 basis=帶兵數：${clip(setupBad.join(';'), 240)}`);

  const reserveBad = [];
  for (const cityName of ['襄平', '洛陽', '成都']) {
    const g = G.garrisonOf(D, 0, cityName);
    if (!g) continue;
    const bs = G.battleSetup(D, 0, cityName, 100, { troopMode: 'reserve' });
    const want_ = Math.min(100, Math.max(60, Math.round((Number(g.garrison) || 0) / 6)));
    if (bs.enemyTroops !== want_ || bs.enemyTroopsBasis !== 'estimate:守軍/6') {
      reserveBad.push(`${cityName}:${bs.enemyTroops}≠${want_}/${bs.enemyTroopsBasis}`);
    }
  }
  ok('garrison.reserve', reserveBad.length === 0, reserveBad, [],
    `reserve 模式 = clamp(round(守军/6),60,100)，basis 'estimate:守軍/6'：${clip(reserveBad.join(';'), 160)}`);

  const defBad = [];
  for (let si = 0; si < 2; si++) {
    for (const city of D.scenarios[si].cities.slice(0, 6)) {
      const g = G.garrisonOf(D, si, city.NAME);
      const d = G.defendersOf(D, si, city.NAME);
      if ((g?.officers.length || 0) > 0 && d.length === 0) defBad.push(`${si}:${city.NAME}`);
      if (d.length > 3) defBad.push(`${si}:${city.NAME}:${d.length}>3`);
    }
  }
  ok('garrison.defenders', defBad.length === 0, defBad, [], `defendersOf 最多 3 名、有守将的城不能为空：${clip(defBad.join(';'), 160)}`);
}

// ── N. 音频总线 ────────────────────────────────────────────────────────────
if (on('audio.')) {
  const keys = Object.keys(A.MAGIC_SFX).sort();
  ok('audio.sfx.keys', keys.length === E.magics.length && keys.every((k) => /^\d{3}$/.test(k)),
    keys.length, E.magics.length, 'MAGIC_SFX 键 = 三位补零 SEQUENCE');
  const first = E.magics[0];
  ok('audio.sfxname', A.magicSfxName(1) === first.sfx.primary && A.magicSfxName('1') === first.sfx.primary,
    [A.magicSfxName(1), A.magicSfxName('1')], first.sfx.primary,
    `magicSfxName 同时接受数字与字符串 seq（seq 1 = ${first.sfx.primary}，docs/05c:66-67）`);
  A.resetAudioBus();
  A.emitMagic(first.fx.dir, 1, 'skill', 0);
  const ev = A.audioEvents();
  const last = ev[ev.length - 1];
  ok('audio.emit', !!last && last.kind === 'magic' && Number(last.seq) === first.seq,
    last, { kind: 'magic', seq: first.seq }, 'emitMagic(dir,volume,source,clock) 必须上线一条 magic 事件');
  ok('audio.systemso',
    A.SYSTEM_SO_IMPLEMENTED.length <= A.SYSTEM_SO_HOST_IMPLEMENTED.length &&
    A.SYSTEM_SO_HOST_IMPLEMENTED.length <= A.SYSTEM_SO_ALL_IMPLEMENTED.length &&
    A.SYSTEM_SO_IMPLEMENTED.every((n) => A.SYSTEM_SO_ALL_IMPLEMENTED.includes(n)),
    { impl: A.SYSTEM_SO_IMPLEMENTED.length, host: A.SYSTEM_SO_HOST_IMPLEMENTED.length, all: A.SYSTEM_SO_ALL_IMPLEMENTED.length },
    'impl ⊆ host ⊆ all', 'SYSTEM.SO 覆盖层级（audio_bus.ts），只做包含关系回归');
}

// ── O. 战斗内核运行期 ──────────────────────────────────────────────────────
if (on('battle.')) {
  ok('battle.grid', B.GRID_W === E.origin.gridW && B.GRID_H === E.origin.gridH,
    { w: B.GRID_W, h: B.GRID_H }, { w: E.origin.gridW, h: E.origin.gridH },
    '战场格 71×14（原作 72 列的 480 高网格，除主将位后 71）');

  const w = B.createWorld({ data: D });
  ok('battle.create',
    !!w.sides?.A?.general && !!w.sides?.B?.general && w.sides.A.general.qi === E.origin.qiStart &&
    Array.isArray(w.units) && w.units.length > 0,
    { qi: w.sides?.A?.general?.qi, units: w.units?.length }, { qi: E.origin.qiStart, units: '>0' },
    'createWorld：双方主将 + 小兵，气力初值 0xEA60=60000');

  // 治疗：把 HP 打到 1 再 cast 補血
  const wh = B.createWorld({ data: D });
  wh.sides.A.general.hp = 1;
  const healSeq = E.magics.find((m) => m.castKind === 'heal' && m.mp > 0).seq;
  const hpBefore = wh.sides.A.general.hp;
  const ch = B.cast(wh, 'A', healSeq);
  ok('battle.cast.heal', ch.ok === true && wh.sides.A.general.hp > hpBefore,
    { ok: ch.ok, hp: wh.sides.A.general.hp, healed: ch.healed }, 'hp > 1 且 healed>0',
    `cast(seq=${healSeq} ${E.magics[healSeq - 1].name}) 補血立即结算（skillKindOf=heal）`);

  // 气力/技力扣除
  const wm = B.createWorld({ data: D });
  const seqCost = E.magics.find((m) => m.castKind !== 'heal' && m.mp > 0).seq;
  const em = E.magics[seqCost - 1];
  const qi0 = wm.sides.A.general.qi;
  const mp0 = wm.sides.A.general.mp;
  const cm = B.cast(wm, 'A', seqCost, wm.units.find((u) => u.side === 'B')?.x, wm.units.find((u) => u.side === 'B')?.y);
  const wantQi = Math.round(B.qiCostOf(D, seqCost) * B.qiCostMul(wm, 'A'));
  ok('battle.cast.cost', qi0 - wm.sides.A.general.qi === wantQi && mp0 - wm.sides.A.general.mp === em.mp,
    { qi: qi0 - wm.sides.A.general.qi, mp: mp0 - wm.sides.A.general.mp }, { qi: wantQi, mp: em.mp },
    `cast 扣 qiCostOf(${seqCost})=${B.qiCostOf(D, seqCost)}×qiCostMul，MP=${em.mp}（MAGIC.INI MP）`);

  const wq = B.createWorld({ data: D });
  wq.sides.A.general.qi = 0;
  const rq = B.cast(wq, 'A', seqCost);
  ok('battle.cast.reject.qi', rq.ok === false && rq.reason === 'qi', rq.reason, 'qi', '气力不足必须拒绝（reason=qi）');

  const wmp = B.createWorld({ data: D });
  wmp.sides.A.general.mp = 0;
  const rmp = B.cast(wmp, 'A', E.magics.find((m) => m.mp > 0).seq);
  ok('battle.cast.reject.mp', rmp.ok === false && rmp.reason === 'mp', rmp.reason, 'mp', '技力不足必须拒绝（reason=mp）');

  const waim = B.createWorld({ data: D });
  const aim = B.cast(waim, 'A', E.magics.find((m) => m.attack > 0 && m.castKind !== 'heal').seq);
  ok('battle.cast.aim', aim.ok === true, aim.ok, true, 'tx/ty 缺省时应走 defaultAim 而不是 no-target');

  // 伤害：cast 当帧不一定减员，跑 240 tick 后看 B 方存活
  const strikeSeq = E.magics.find((m) => m.castKind === 'strike' && m.attack > 10 && m.mp <= 30).seq;
  const wd = B.createWorld({ data: D });
  const target = wd.units.find((u) => u.side === 'B' && u.alive);
  const beforeAlive = wd.units.filter((u) => u.side === 'B' && u.alive).length;
  const cs = B.cast(wd, 'A', strikeSeq, target.x, target.y);
  for (let i = 0; i < 240; i++) B.step(wd);
  const afterAlive = wd.units.filter((u) => u.side === 'B' && u.alive).length;
  ok('battle.cast.strike', cs.ok === true && afterAlive < beforeAlive,
    { ok: cs.ok, alive: afterAlive }, `<${beforeAlive}`,
    `单体伤害技 seq=${strikeSeq}（${E.magics[strikeSeq - 1].name}）cast 后 240 tick 内造成减员`);

  const aoeSeq = E.magics.find((m) => m.castKind === 'aoe').seq;
  const wa = B.createWorld({ data: D });
  const t2 = wa.units.find((u) => u.side === 'B' && u.alive);
  const beforeA = wa.units.filter((u) => u.side === 'B' && u.alive).length;
  const ca = B.cast(wa, 'A', aoeSeq, t2.x, t2.y);
  for (let i = 0; i < 240; i++) B.step(wa);
  const afterA = wa.units.filter((u) => u.side === 'B' && u.alive).length;
  ok('battle.cast.aoe', ca.ok === true && afterA < beforeA, { ok: ca.ok, alive: afterA }, `<${beforeA}`,
    `群体伤害技 seq=${aoeSeq}（${E.magics[aoeSeq - 1].name}，ATTACK=${E.magics[aoeSeq - 1].attack}≥40）`);

  const ws = B.createWorld({ data: D });
  let stepErr = null;
  try { for (let i = 0; i < 5; i++) B.step(ws); } catch (err) { stepErr = err.message; }
  ok('battle.step', !stepErr && ws.tick === 5, { tick: ws.tick, err: stepErr }, { tick: 5 }, 'step 推进 tick，5 次 = 5（TICK_HZ=30）');

  const st = B.settle(B.createWorld({ data: D }));
  ok('battle.settle',
    !!st && ['A', 'B', 'draw'].includes(st.winner) && Number.isFinite(st.kills) && Number.isFinite(st.expGain) && typeof st.modeName === 'string',
    { winner: st?.winner, kills: st?.kills, exp: st?.expGain }, 'winner∈{A,B,draw} 且 kills/expGain 数值',
    'settle 结算结构（docs/04b2_招降斩首与战后结算.md）');
}

// ── P. 军师技策略表 / 出阵选择 ──────────────────────────────────────────────
if (on('strategy.')) {
  const w = B.createWorld({ data: D });
  ok('strategy.plan.guard', S.planStrategy(w, 'A', null) === null, S.planStrategy(w, 'A', null), null,
    'planStrategy 对空单位返回 null（不崩）；createWorld 不建 army，无战术状态时也不该出招');
  const army = S.armyOf(w, 'A');
  ok('strategy.army.flag', !!army && typeof army === 'object' && 'seq' in army, Object.keys(army || {}).slice(0, 5), 'armyStatus 形状',
    'ARMY_FLAG/emptyArmyStatus：战术状态挂在 world.army[side]');

  const pickBad = [];
  for (const r of E.generals.rows.slice(1)) {
    const p = S.pickStrategySeq(D, r.name, 99);
    const own = new Set(r.wiseSkills.map(([, seq]) => seq));
    if (!own.has(Number(p))) pickBad.push(`${r.id}:${fmt(p)}`);
  }
  ok('strategy.pickseq', pickBad.length === 0, pickBad.length, 0,
    `pickStrategySeq(武将,99) 返回 seq，且必须取自该武将自己的 WISESKILL（401 将）：${clip(pickBad.join(';'), 200)}`);
}

// ── Q. 竖屏必然差异（SKIP，不是缺口）──────────────────────────────────────
for (const v of E.vertical) {
  skip(v.id, v.what, (v.evidence || []).join('；'));
}

// ── 汇总输出 ────────────────────────────────────────────────────────────────
const byGroup = {};
for (const r of rows) {
  const g = r.id.split('.')[0];
  byGroup[g] = byGroup[g] || { pass: 0, fail: 0, skip: 0, warn: 0 };
  if (r.skip) byGroup[g].skip++;
  else if (r.ok) byGroup[g].pass++;
  else if (r.warn) byGroup[g].warn++;
  else byGroup[g].fail++;
}

const failed = rows.filter((r) => !r.ok && !r.skip && !r.warn);
const warned = rows.filter((r) => r.warn && !r.ok);
const skipped = rows.filter((r) => r.skip);

if (JSON_OUT) {
  console.log(JSON.stringify({
    mode: MODE,
    generatedAt: E.generatedAt,
    results: rows,
    summary: {
      pass: rows.filter((r) => r.ok && !r.skip).length,
      fail: failed.length,
      skip: skipped.length,
      warn: warned.length,
      groups: byGroup,
    },
  }, null, 2));
} else {
  for (const r of rows) {
    if (r.skip) {
      console.log(`SKIP  ${r.id}  ${r.want}`);
      continue;
    }
    if (r.ok) {
      console.log(VERBOSE ? `PASS  ${r.id}  got=${fmt(r.got)}` : `PASS  ${r.id}`);
      continue;
    }
    if (r.warn) {
      console.log(`WARN  ${r.id}  got=${fmt(r.got)} want=${fmt(r.want)}`);
      console.log(`      ↳ ${r.evidence}`);
      continue;
    }
    console.log(`FAIL  ${r.id}  got=${fmt(r.got)} want=${fmt(r.want)}`);
    console.log(`      ↳ ${r.evidence}`);
  }
  console.log('');
  console.log('— 分组 —');
  for (const [g, c] of Object.entries(byGroup)) {
    console.log(`  ${g.padEnd(10)} PASS ${c.pass}  FAIL ${c.fail}  WARN ${c.warn}  SKIP ${c.skip}`);
  }
  console.log('');
  console.log(`PASS ${rows.filter((r) => r.ok && !r.skip).length} / FAIL ${failed.length} / SKIP ${skipped.length} / WARN ${warned.length}   (mode=${MODE}${ONLY ? `, --only=${ONLY}` : ''})`);
  if (failed.length) {
    console.log('');
    console.log('FAIL 清单：');
    for (const r of failed) console.log(`  ✗ ${r.id}  got=${fmt(r.got)} want=${fmt(r.want)}`);
  }
}

process.exit(failed.length ? 1 : 0);
