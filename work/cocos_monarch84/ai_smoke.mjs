#!/usr/bin/env node
/**
 * `CampaignRoot.runMapAi()` 的 node 级冒烟（project/106 §6「AI 接線」的证据）。
 *
 * 为什么不是「重写一遍 runMapAi 再跑」：那样只能证明我的重写没写错。
 * 这里**从 `CampaignRoot.ts` 里按大括号配对把 `private runMapAi()` 的方法体整段切出来**，
 * 只做一处文本替换（`this.` → `host.`），再补上 import 头，交给 `ts.transpileModule` 去类型，
 * 然后真的调用它。所以跑的是宿主里那段代码本身，不是副本。
 *
 * 依赖全部用真货（都在 node 里可跑，零 `cc`）：
 *   · `AiModel.ts` / `AiRunner.ts`  —— 另一个 agent 的交付（runMonth / PLAYER_FORCE）
 *   · `core/garrison.ts`            —— 真的 `garrisonOf(data, scenario, cityName)`
 *   · `core/march.ts`               —— 真的 `pathBetween(scenario, from, to)`
 * 只桩掉 `GameState` 的 4 个函数（它 import 'cc'，node 里载不动）：
 *   `nextArmyId / addArmy / persistSave / garrisonOf`，语义照 `GameState.ts:290/501/507/245` 抄。
 *
 * 三个 case：
 *   A. 2 城最小局面（襄平=玩家空城 / 北平=公孫瓚）：runMapAi 不炸、返回形状正确；
 *   B. 真剧本 1（60 城）连跑 3 个月：打印 AI 月報、来犯队列、转成的 B 方在途部队、易主城；
 *   C. 确定性：同一份存档 + 同一 seed 跑两遍，log / incoming / 部队必须逐字节一致。
 *
 * 产物：`work/cocos_monarch84/_ai_*.mjs`（内联编译产物，不進 Cocos 工程）
 * 用法：`node work/cocos_monarch84/ai_smoke.mjs`   0 = 全部通过
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const GAME = path.join(ROOT, 'game');
const SCRIPTS = path.join(GAME, 'cocos', 'assets', 'scripts');
const DATA = path.join(GAME, 'cocos', 'assets', 'bundles', 'res', 'data');
const require = createRequire(import.meta.url);

const fail = [];
function check(ok, label, detail) {
  if (ok) {
    console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  } else {
    fail.push(`${label}${detail ? ` — ${detail}` : ''}`);
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/* ==========================================================================
 * §1 内联编译（TS → ESM，只去类型，不做类型检查 —— 类型由 tsc -p tsconfig.check 负责）
 * ======================================================================== */

const ts = require(path.join(GAME, 'node_modules', 'typescript', 'lib', 'typescript.js'));

function compile(source, outName, rewrites = []) {
  let text = source;
  for (const [from, to] of rewrites) text = text.split(from).join(to);
  const out = ts.transpileModule(text, {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: false,
      inlineSourceMap: false,
    },
    fileName: outName.replace(/\.mjs$/, '.ts'),
  });
  const file = path.join(HERE, outName);
  writeFileSync(file, out.outputText, 'utf8');
  return file;
}

const fAiModel = compile(readFileSync(path.join(SCRIPTS, 'AiModel.ts'), 'utf8'), '_ai_AiModel.mjs');
const fAiRunner = compile(readFileSync(path.join(SCRIPTS, 'AiRunner.ts'), 'utf8'), '_ai_AiRunner.mjs', [
  ["from './AiModel'", "from './_ai_AiModel.mjs'"],
]);
const fGarrison = compile(readFileSync(path.join(SCRIPTS, 'core', 'garrison.ts'), 'utf8'), '_ai_garrison.mjs');
const fMarch = compile(readFileSync(path.join(SCRIPTS, 'core', 'march.ts'), 'utf8'), '_ai_march.mjs');

/* --- 把 runMapAi 的方法体切出来 ------------------------------------------------ */

const rootSrc = readFileSync(path.join(SCRIPTS, 'CampaignRoot.ts'), 'utf8');
const MARK = 'private runMapAi(): AiMonthOutcome | null {';
const head = rootSrc.indexOf(MARK);
if (head < 0) {
  console.error('✗ CampaignRoot.ts 里找不到 `private runMapAi()`，冒烟无法进行（锚点文本变了？）');
  process.exit(1);
}
let i = rootSrc.indexOf('{', head) + 1;
let depth = 1;
for (; i < rootSrc.length && depth > 0; i += 1) {
  const ch = rootSrc[i];
  if (ch === '{') depth += 1;
  else if (ch === '}') depth -= 1;
}
const bodyRaw = rootSrc.slice(rootSrc.indexOf('{', head) + 1, i - 1);
const body = bodyRaw.replace(/\bthis\./g, 'host.');
const wrapper = [
  "import { PLAYER_FORCE, runMonth as runAiMonth } from './_ai_AiRunner.mjs';",
  "import { garrisonOf } from './_ai_garrison.mjs';",
  "import { pathBetween } from './_ai_march.mjs';",
  // 每次取屬性都回讀 globalThis.__GS__：樁是每個 case 現換的（import 時還不知道是哪一份）
  'const GameState: any = new Proxy({}, { get: (_t, k) => (globalThis as any).__GS__[k] });',
  'export function runMapAi(host: any): any {',
  body,
  '}',
].join('\n');
const fRunMapAi = compile(wrapper, '_ai_runmapai.mjs');
const bodyLines = body.split('\n').length;

/* ==========================================================================
 * §2 数据与桩
 * ======================================================================== */

const scenarios = JSON.parse(readFileSync(path.join(DATA, 'scenarios.json'), 'utf8'));
const garrisonTable = JSON.parse(readFileSync(path.join(DATA, 'garrison.json'), 'utf8'));
const generals = JSON.parse(readFileSync(path.join(DATA, 'generals.json'), 'utf8'));
const data = { scenarios, garrison: garrisonTable, generals };

/** 忠实复刻 `GameState.ts:290` 的守军公式 */
function gsGarrisonOf(city) {
  return Math.min(Math.floor((city?.POPULATION ?? 0) / 2500) + 110, 600);
}

/** GameState 的 4 个函数（node 里载不动 'cc'，按 GameState.ts:245/290/501/507 复刻） */
function makeGameState(store) {
  return {
    nextArmyId(side) {
      store.armySeq += 1;
      return `m${store.month}-${side}${store.armySeq}`;
    },
    addArmy(army) {
      if (!army.id || store.armies.some((existing) => existing.id === army.id)) return;
      store.armies.push(army);
    },
    persistSave() {
      store.__persists = (store.__persists ?? 0) + 1;
    },
    garrisonOf: gsGarrisonOf,
  };
}

function cityRow(si, name) {
  return (scenarios[si].cities ?? []).find((c) => c && c.NAME === name) ?? null;
}
function populationOf(si, name) {
  const row = cityRow(si, name);
  return row && typeof row.POPULATION === 'number' ? row.POPULATION : 30000;
}
function defenseOf(si, name) {
  const row = cityRow(si, name);
  return row && typeof row.DEFENSE === 'number' ? row.DEFENSE : 100;
}

/** 造一份宿主（CampaignRoot 的字段子集）+ 存档，形状对齐 `saves.newCampaign` / `GameState.CampaignSave` */
function makeHost(si, owned, opts = {}) {
  const scenario = scenarios[si];
  const cities = scenario.cities;
  const store = {
    owned: owned.slice(),
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    month: opts.month ?? 1,
    gold: 1200,
    seeded: true,
    cities: {},
    armies: [],
    armySeq: 0,
  };
  const list = opts.only ? cities.filter((c) => opts.only.includes(c.NAME)) : cities;
  for (const city of list) {
    const troops = opts.troops?.[city.NAME] ?? 120;
    store.cities[city.NAME] = {
      troops,
      pop: city.POPULATION ?? 30000,
      money: city.MONEY ?? 0,
    };
  }
  const host = {
    save: store,
    data,
    cities: list,
    generals,
    paths: scenario.paths ?? [],
    cityByName: (name) => list.find((c) => c && c.NAME === name) ?? null,
    scenarioLike: () => ({ cities: list, paths: scenario.paths ?? [] }),
  };
  return { host, store };
}

/* ==========================================================================
 * §3 跑
 * ======================================================================== */

globalThis.__GS__ = null; // 由每个 case 现换
const RIP = await import(pathToFileURL(fRunMapAi).href);

let caseCount = 0;
let totalIncoming = 0;
let totalArmies = 0;
let totalActions = 0;
let totalBattles = 0;

function run(host, store) {
  globalThis.__GS__ = makeGameState(store);
  const before = new Set(Object.keys(store.cities).filter((n) => store.cities[n].owner));
  const out = RIP.runMapAi(host);
  const added = store.armies.slice();
  return { out, added, before };
}

function owners(store) {
  const out = {};
  for (const [name, runtime] of Object.entries(store.cities)) {
    if (typeof runtime.owner === 'string' && runtime.owner) out[name] = runtime.owner;
  }
  return out;
}

console.log('== A. 2 城最小局面（襄平=玩家空城 / 北平=公孫瓚）==');
{
  const { host, store } = makeHost(0, ['襄平'], { only: ['襄平', '北平'], troops: { 襄平: 260, 北平: 420 } });
  const { out, added } = run(host, store);
  caseCount += 1;
  check(!!out && typeof out === 'object', 'runMapAi 返回对象');
  check(Array.isArray(out.log) && out.log.length > 0, 'log 非空', out.log[0]);
  check(Array.isArray(out.incoming), 'incoming 是数组');
  check(out.log[0].startsWith('AI 月 報：'), 'log[0] 是月報抬头', out.log[0]);
  check(added.length === out.incoming.length, '来犯队列全部转成 B 方部队', `${added.length}/${out.incoming.length}`);
  check(
    added.every((a) => a.side === 'B' && a.progress === 0 && a.troops >= 1 && a.pathIndex >= 0),
    '部队字段合法（side/progress/troops/pathIndex）',
  );
  check(out.seed === (store.month + 1) * 7919, 'seed = (month+1)*7919', String(out.seed));
  for (const a of added) console.log(`    · ${a.id} ${a.from} → ${a.to}（${a.troops} 兵，${a.general}，path#${a.pathIndex}）`);
  console.log(`    log：${out.log.join(' / ')}`);
  totalIncoming += out.incoming.length;
  totalArmies += added.length;
  totalActions += out.actions.length;
}

console.log('== B. 真剧本 1（60 城）连跑 3 个月 ==');
{
  const { host, store } = makeHost(0, ['襄平', '北平', '代縣'], {});
  let changedMonths = 0;
  let holderChanges = 0;
  for (let m = 1; m <= 3; m += 1) {
    store.month = m;
    const beforeOwners = owners(store);
    const { out, added } = run(host, store);
    caseCount += 1;
    totalActions += out.actions.length;
    totalBattles += out.battles.length;
    totalIncoming += out.incoming.length;
    totalArmies += added.length;
    if (out.changed) changedMonths += 1;
    const afterOwners = owners(store);
    const flipped = Object.keys(afterOwners).filter((n) => beforeOwners[n] !== afterOwners[n]);
    holderChanges += flipped.length;
    console.log(`  第 ${m} 月：行動 ${out.actions.length}、易主 ${flipped.length}、就地結算 ${out.battles.length}、來犯 ${out.incoming.length}`);
    console.log(`    ${out.log[0]}`);
    for (const line of out.log.slice(1, 4)) console.log(`    ${line}`);
    if (flipped.length > 0) console.log(`    易主：${flipped.map((n) => `${n}→${afterOwners[n]}`).join('、')}`);
    check(out.seed === (m + 1) * 7919, `第 ${m} 月 seed 与月同步`, String(out.seed));
    check(added.every((a) => a.progress === 0 && a.side === 'B'), `第 ${m} 月新出部队 progress=0`);
  }
  check(changedMonths >= 1, '至少一个月 AI 改动了世界（changed=true）', `${changedMonths}/3`);
  console.log(`    三个月共易主 ${holderChanges} 座城（0 也正常：兵力太低时 AI 先内政）`);
}

console.log('== C. 确定性（同存档同 seed 跑两遍）==');
{
  const a = makeHost(0, ['襄平'], { only: ['襄平', '北平'], troops: { 襄平: 260, 北平: 420 } });
  const b = makeHost(0, ['襄平'], { only: ['襄平', '北平'], troops: { 襄平: 260, 北平: 420 } });
  const r1 = run(a.host, a.store);
  const r2 = run(b.host, b.store);
  caseCount += 1;
  const same =
    JSON.stringify(r1.out.log) === JSON.stringify(r2.out.log) &&
    JSON.stringify(r1.out.incoming) === JSON.stringify(r2.out.incoming) &&
    JSON.stringify(r1.added) === JSON.stringify(r2.added) &&
    JSON.stringify(owners(a.store)) === JSON.stringify(owners(b.store));
  check(same, '两遍的 log / incoming / 部队 / 势力归属完全一致');
}

console.log('== D. 宿主接线点（静态检查 CampaignRoot.ts）==');
{
  caseCount += 1;
  const src = readFileSync(path.join(SCRIPTS, 'CampaignRoot.ts'), 'utf8');
  check(
    src.includes("import { PLAYER_FORCE, runMonth as runAiMonth } from './AiRunner';"),
    'import 语句在（PLAYER_FORCE + runMonth as runAiMonth）',
  );
  const iAdvance = src.indexOf('const moved = GameState.marchArmies(3);');
  const iAi = src.indexOf('const ai = this.runMapAi();');
  const iSpawn = src.indexOf('const spawned = ai ? null : this.spawnRaid();');
  check(iAdvance > 0 && iAi > iAdvance && iSpawn > iAi, '调用顺序 marchArmies(3) → runMapAi() → spawnRaid 兜底');
  check(src.includes('if (ai && ai.log.length > 0) notes.push(ai.log[0] ?? \'\');'), '提示条拼 AI 月報第一行');
  check(src.includes('AI 出兵 ${ai.incoming.length} 路'), '提示条拼来犯城名');
}

console.log('');
console.log(`assert 组 ${caseCount}；AI 行動合计 ${totalActions}；就地結算 ${totalBattles}；來犯 ${totalIncoming}；转成部队 ${totalArmies}`);
console.log(`runMapAi 方法体：${bodyLines} 行（从 CampaignRoot.ts:${rootSrc.slice(0, head).split('\n').length} 整段切出，this.→host. 后执行）`);
if (fail.length > 0) {
  console.error(`✗ ${fail.length} 项未通过：`);
  for (const line of fail) console.error(`  - ${line}`);
  process.exit(1);
}
console.log('✓ runMapAi 冒烟全部通过');
if (!existsSync(path.join(HERE, '_ai_runmapai.mjs'))) process.exit(1);
