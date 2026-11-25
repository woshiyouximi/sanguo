// work/cocos_ai84/runner-smoke.mjs — AiRunner（一月编排）的独立冒烟测试
//
// 目的：AiModel 的等价性由 parity.mjs 对拍；这里验证**编排层**（runMonth）在没有 Cocos 运行时
// 的情况下也能把世界推起来：势力同步 → 行动 → 战果 → 灭亡 → 回写 → 漂移，并且同 seed 可复现。
//
// 用法：node work/cocos_ai84/build.mjs && node work/cocos_ai84/runner-smoke.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as RUN from './build/AiRunner.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const dataDir = path.join(repo, 'game', 'data');

const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f), 'utf8'));
const scenarios = readJson('scenarios.json');
const garrisons = readJson('garrison.json');
const generals = readJson('generals.json');

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const cityCap = (row) => Math.min(Math.floor(num(row?.POPULATION) / 2500) + 110, 600);

let fails = 0;
const ok = (cond, msg, extra) => {
  if (cond) return true;
  fails++;
  console.log(`  ✗ ${msg}${extra === undefined ? '' : `  ${JSON.stringify(extra)}`}`);
  return false;
};

/** 城主（garrison.owner 优先，其次剧本 KING）；'' = 空城 */
const ownerOfRow = (row, gh) => (gh?.cities?.[row.NAME]?.owner || '') || (typeof row.KING === 'string' ? row.KING : '');

/** 按「城主」把城分组，返回按城数从多到少排的势力 id 列表 */
function forceRank(cities, gh) {
  const by = new Map();
  for (const row of cities) {
    const owner = ownerOfRow(row, gh);
    if (!owner) continue;
    by.set(owner, (by.get(owner) || 0) + 1);
  }
  return [...by.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** 复刻 GameState.initCampaign 的存档形状（owned + cities{troops,pop,money}） */
function mkSave(sc, gh, playerId) {
  const cities = {};
  const owned = [];
  for (const row of sc.cities) {
    const name = row.NAME;
    cities[name] = {
      troops: cityCap(row),
      pop: num(row.POPULATION),
      money: num(row.MONEY),
    };
    if (ownerOfRow(row, gh) === playerId) owned.push(name);
  }
  return {
    king: playerId,
    owned,
    wins: 0, losses: 0, streak: 0, bestStreak: 0, month: 0, gold: 0, seeded: true,
    cities, armies: [], armySeq: 0,
  };
}

const snapshot = (save) => JSON.stringify(save);
const ownerTally = (save) => {
  const tally = new Map();
  for (const name of Object.keys(save.cities)) {
    const o = save.cities[name].owner || '';
    tally.set(o, (tally.get(o) || 0) + 1);
  }
  return tally;
};

function runScenario(idx, months) {
  const sc = scenarios[idx];
  const gh = garrisons.find((g) => num(g.scenario) === num(sc.id)) || garrisons[idx];
  const rank = forceRank(sc.cities, gh);
  const playerId = rank[rank.length - 1]; // 最弱势力当玩家：四周都是强敌，AI 一定会动
  const init = mkSave(sc, gh, playerId);
  const rowByName = new Map(sc.cities.map((r) => [r.NAME, r]));

  const ctx = () => ({
    paths: sc.paths,
    playerId,
    garrisonOf: (name) => gh?.cities?.[name] || null,
    capOf: (name) => cityCap(rowByName.get(name)),
  });

  const save = JSON.parse(JSON.stringify(init));
  const before = ownerTally(save);
  let incoming = 0;
  let battles = 0;
  let captured = 0;
  let gone = 0;
  let logLines = 0;
  let driftUp = 0;
  let driftDown = 0;
  const samples = [];
  const monthsOut = [];

  for (let m = 1; m <= months; m++) {
    save.month = m;
    const out = RUN.runMonth(save, sc.cities, generals, ctx());
    ok(out.month === m, `剧本${sc.id} 第${m}月：runMonth 不该自己改月份`, { got: out.month });
    ok(Array.isArray(out.log) && out.log.length > 0, `剧本${sc.id} 第${m}月：日志为空`);
    ok(out.log.some((l) => l.indexOf('AI 月 報') >= 0), `剧本${sc.id} 第${m}月：缺少「AI 月報」汇总行`, out.log.slice(0, 3));
    incoming += out.incoming.length;
    battles += out.battles.length;
    captured += out.battles.filter((b) => b.captured).length;
    gone += out.gone.length;
    logLines += out.log.length;
    if (out.drift) {
      driftUp += out.drift.spirit.up + out.drift.loyal.up;
      driftDown += out.drift.spirit.down + out.drift.loyal.down;
    }
    for (const l of out.log) if (samples.length < 6 && /攻|聯合|徵 兵|滅 亡|漂 移/.test(l)) samples.push(`剧本${sc.id} 第${m}月 ${l}`);
    monthsOut.push({ m, actions: out.actions.length, executed: out.executed.length, incoming: out.incoming.length, battles: out.battles.length, gone: out.gone.length });
  }

  // 同 seed 复现：整段重跑一次
  const save2 = JSON.parse(JSON.stringify(init));
  for (let m = 1; m <= months; m++) {
    save2.month = m;
    RUN.runMonth(save2, sc.cities, generals, ctx());
  }
  ok(snapshot(save) === snapshot(save2), `剧本${sc.id}：同 seed 两次结果不一致（编排层不确定）`);

  const after = ownerTally(save);
  let ownerMoved = 0;
  for (const name of Object.keys(save.cities)) {
    const a = save.cities[name].owner || '';
    const b = init.cities[name].owner || '';
    if (a !== b) ownerMoved++;
  }
  const aiOwners = [...after.keys()].filter((o) => o && o !== RUN.PLAYER_FORCE);
  const noOwner = after.get('') || 0;

  ok(ownerMoved > 0, `剧本${sc.id}：${months} 个月里没有一座城易主（AI 完全没动）`);
  ok(battles + incoming > 0, `剧本${sc.id}：${months} 个月里没有任何出兵`);
  ok(num(save.cities[sc.cities[0].NAME].troops) >= 0, `剧本${sc.id}：兵力出现负数`);
  ok(aiOwners.length >= 2, `剧本${sc.id}：AI 势力数 < 2`, aiOwners);
  ok(Object.keys(save.morale || {}).length > 0, `剧本${sc.id}：漂移没有写入 morale`);
  ok(Object.keys(save.loyal || {}).length > 0, `剧本${sc.id}：漂移没有写入 loyal`);
  ok(driftUp + driftDown > 0, `剧本${sc.id}：${months} 个月里士气/忠诚没有任何漂移`);
  ok(num(save.month) === months, `剧本${sc.id}：month 被改坏`, save.month);

  return {
    id: sc.id,
    player: playerId,
    months,
    ownerMoved,
    incoming,
    battles,
    captured,
    gone,
    logLines,
    driftUp,
    driftDown,
    aiOwners: aiOwners.length,
    emptyCities: noOwner,
    forcesBefore: before.size,
    forcesAfter: after.size,
    samples,
    monthsOut,
    save,
  };
}

console.log('== Cocos AiRunner 冒烟（一月编排）==');
const months = Math.max(1, Math.trunc(num(process.env.SMOKE_MONTHS) || 12));
const limit = Math.max(1, Math.trunc(num(process.env.SMOKE_SCENARIOS) || 5));
const rows = [];
for (let i = 0; i < Math.min(limit, scenarios.length); i++) rows.push(runScenario(i, months));

console.log(`剧本 ${rows.length} / 月 ${months} / 城 ${scenarios[0].cities.length} / 路径 ${scenarios[0].paths.length}`);
for (const r of rows) {
  console.log(
    `  剧本${r.id} 玩家=${r.player} 易主 ${r.ownerMoved} 城 / 出兵 ${r.battles + r.incoming}`
    + `（野战 ${r.battles} 待守 ${r.incoming} 得手 ${r.captured}）/ 灭亡 ${r.gone}`
    + ` / 日志 ${r.logLines} 行 / AI 势力 ${r.aiOwners} / 空城 ${r.emptyCities}`,
  );
}
console.log(`合计：易主 ${rows.reduce((s, r) => s + r.ownerMoved, 0)} 城、出兵 ${rows.reduce((s, r) => s + r.battles + r.incoming, 0)} 次、日志 ${rows.reduce((s, r) => s + r.logLines, 0)} 行`);

console.log('\n-- 样例日志 --');
for (const r of rows) for (const s of r.samples.slice(0, 2)) console.log('  ' + s);

if (fails) {
  console.log(`\nSMOKE FAIL：${fails} 条断言不成立`);
  process.exit(1);
}
console.log('\nSMOKE OK：编排层可复现，世界确实在动');
