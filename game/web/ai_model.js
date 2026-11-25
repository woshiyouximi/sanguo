/**
 * ai_model.js — 大地图 AI（R73/R74/R75/R76）与势力归属/灭亡（R78+R4）的**纯逻辑**。
 *
 * 约束：无 DOM、无 fetch、无 localStorage、无顶层副作用。浏览器里 campaign.html
 * `import * as AI from './ai_model.js'`；Node 里 `import '../web/ai_model.js'`
 * （`game/package.json` 是 `"type": "module"`）。所有随机都走**显式注入的 rng**，
 * 同一个种子必定复现同一份候选表，测试不需要 mock 任何东西。
 *
 * 世界（world）是一个**纯数据对象**，字段一一对应原作的结构体字段，见 §0。
 * 这样测试可以手搓三座城跑一遍 `runMonth`，而 campaign.html 只做「存档 → world」
 * 与「world → 存档」两次搬运。
 *
 * ── 原作依据（docs/04d §1、docs/04c §2.2）────────────────────────────────
 *   0x40D751  AI 总入口：每势力每月一遍
 *   0x40BE20  清空候选表（[0x4C39A0]=0）
 *   0x40CBB6  沿 king+0x338 城链逐城调四个规划器
 *   0x40BFCE  PlanDomestic     （内政）
 *   0x40C1E4  PlanRecruit      （征兵）
 *   0x40CAF1  PlanAttack       （攻城 / 联合）
 *   0x40C34D  PlanMoveGeneral  （调将）
 *   0x40CC10  选 Rate 最大（哨兵 0x320=800）
 *   0x40D52F  执行选中的候选
 *   0x487248  ACT 名称表（9 项，cp950）
 *   0x40C635  出兵数 + 评分（R75 + R76）
 *   0x40C8EC  联合（ACT=7）
 *   0x41B1BF  月度漂移（R65）：疲劳 −1 / 士气 / 忠诚
 *
 * ── 已知的「原文冲突」全部就地标注，不静默选一个 ────────────────────────
 *   ① 占空城 Rate：04d 1.4 节反汇编写 `idiv (srcCity->[0x38]+1)`，伪代码写
 *      `80/(dst->[0x38]+1)`；`+0x38` 在 04c §2.2 是「到目标的距离（PATH Length）」。
 *      但 PATH Length 实测 37..260（data/scenarios.json），80/(260+1)=0，即每座空城
 *      都是 0 分，与「佔領空城」作为一种可行行动矛盾。本文件取 **跳数**（相邻=1）作距离，
 *      相邻空城 Rate=40、两跳 26、三跳 20，见 RATE_BAND 的阶梯。想改回 PATH Length
 *      只需给 world 传 `distanceOf(a,b)`。等级：[推测]。
 *   ② 出兵数 `n = min(n, 5)`：原作 +0x30 的量纲若为「百人」，5 单位 = 500 人；本作城兵
 *      以「人」计（上限 600），故候选表里保持原作 1..5 的原始值，出兵落地时乘
 *      TROOP_UNIT=20（5 单位 = 100 人 ≈ 玩家一次出征的 100 兵）。等级：[新设计]。
 *   ③ 内政/征兵/调将三个规划器的评分表未定位（04d §6 明确列出），本文件的 Rate 是
 *      按「不得盖过打仗」的约束反推的，见 RATE_BAND。等级：[推测]。
 */

import { num, intOr } from './saves.js';

// ---------------------------------------------------------------------------
// §0 world 形状（纯数据，字段名对齐原作结构体）
// ---------------------------------------------------------------------------
/**
 * @typedef {Object} AiCity
 * @property {string} owner      city+0x10 所属势力 id；'' = 空城/无主
 * @property {number} troops     city+0x30 城内总兵数
 * @property {number} money      city+0x92 城内金钱
 * @property {number} pop        city+0x8A 人口
 * @property {number} flags      city+0x9E FLAGS（1 = 关卡，不可通行）
 * @property {number} [rate]     city+0x6C 城规模 1..5（游戏中不变）
 * @property {string} [major]    city+0x14 太守名（空城没有）
 * @property {Array}  [officers] city+0x24 城内武将链
 *
 * @typedef {Object} AiWorld
 * @property {string} playerId                 玩家势力 id（原作 [0x4A64F0]）
 * @property {Object<string,AiCity>} cities    城名 → 城
 * @property {Object|Map} [adj]                邻接（0x4054B9 的等价物）
 * @property {Array} [paths]                   剧本 PATH 表（含 Start/End/Length）
 * @property {Object<string,{cities:string[]}>} [forces] 势力 → 城链（king+0x338）
 * @property {Function} [rng]                  () => [0,1)
 * @property {Function} [distanceOf]           (a,b) => 距离；给了就不再用跳数
 * @property {Function} [limitOf]              (name) => 可投入兵力上限（0x40C511）
 * @property {Function} [capOf]                (name) => 城内兵上限
 * @property {Function} [neighborsOf]          (name) => 邻城数组
 * @property {Object} [rules]                  { cheat?:boolean }
 */

// ---------------------------------------------------------------------------
// §1 地址 / 常量 / ACT 表
// ---------------------------------------------------------------------------

/** 反汇编地址索引（报告与代码注释共用同一份，避免抄错） */
export const ADDR = Object.freeze({
  AI_ENTRY: 0x40d751,
  BUDGET_RESET: 0x40be20,
  SCAN_CITIES: 0x40cbb6,
  PLAN_DOMESTIC: 0x40bfce,
  PLAN_RECRUIT: 0x40c1e4,
  PLAN_ATTACK: 0x40caf1,
  PLAN_MOVE: 0x40c34d,
  DISPATCH: 0x40c635,
  OFFICER_ACT: 0x40c47c,
  JOIN: 0x40c8ec,
  ARGMAX: 0x40cc10,
  EXEC: 0x40d52f,
  ACT_TABLE: 0x487248,
  DEBUG_PRINT: 0x40becb,
  DRIFT: 0x41b1bf,
  RECORD: 0x4084c9,
  NEIGHBORS: 0x4054b9,
  LIMIT: 0x40c511,
  PLAYER_ID: 0x4a64f0,
  CAND_COUNT: 0x4c39a0,
  CAND_BASE: 0x4c32a0,
  CAND_STRIDE: 0x1c,
  KING_CITY_HEAD: 0x338,
});

/** 行动类型 ACT（0x487248 表，索引 = ACT 值） */
export const ACT = Object.freeze({
  NONE: 0,          // 不明
  GOLD: 1,          // 補金
  FLEE: 2,          // 逃跑
  MOVE_GENERAL: 3,  // 移動武將
  ATTACK_PLAYER: 4, // 攻擊player
  ATTACK_AI: 5,     // 攻擊ai
  CHEAT: 6,         // cheat
  JOIN: 7,          // 聯合
  OCCUPY: 8,        // 佔領空城
});

/** 0x487248 的 9 个字符串（cp950 原文，顺序不能改） */
export const ACT_NAMES = Object.freeze([
  '不明', '補金', '逃跑', '移動武將', '攻擊player', '攻擊ai', 'cheat', '聯合', '佔領空城',
]);

/** 9 项全表（顺序即 ACT 值），测试用它断言「一项不缺」 */
export const ALL_ACTS = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8]);

/**
 * Rate 权重表（R76）。
 *   攻击player 200 —— 0x40C7BB `push 0xc8`
 *   攻击ai     100 —— 0x40C813 `push 0x64`
 *   占空城      80/(d+1) —— 0x40C7EE `mov eax,0x50 / idiv (d+1)`
 *   联合打玩家  200 —— 0x40CA88 `push 0xc8`
 *   联合打AI    50  —— 0x40C8C2 / 0x40CAAD `push 0x32`
 *   哨兵        800 —— 0x40CC10 把 rate[n] 写成 0x320，保证「没有候选」时 argmax 返回 n
 */
export const RATE = Object.freeze({
  ATTACK_PLAYER: 200,
  ATTACK_AI: 100,
  OCCUPY: 80,
  JOIN_PLAYER: 200,
  JOIN_AI: 50,
  SENTINEL: 800,
});

/**
 * 内政类 Rate 阶梯（[推测]，原作三个规划器的评分表未定位）。
 *
 * 硬约束：必须 < 100（否则 AI 永远不打仗），且大体低于「相邻空城 40」——否则 AI 会
 * 只顾内政、地图上永远没人占空城。于是：
 *   佔領空城(相邻) 40 > 徵兵 33..35 > 補金 22..30 > 移動武將 24..28 > 逃跑 35 > cheat 15
 * 徵兵是**即时**执行（ACT 表没有「徵兵」项，见 §6 说明），不占候选名额。
 */
export const RATE_BAND = Object.freeze({
  GOLD_MIN: 22, GOLD_MAX: 30,
  RECRUIT_MIN: 33, RECRUIT_MAX: 35,
  MOVE_MIN: 24, MOVE_MAX: 28,
  FLEE: 35,
  CHEAT: 15,
});

/** 候选表上限：0x4C39A0 一次最多 0x40=64 条，stride 0x1C */
export const MAX_CANDIDATES = 0x40;

/** 0x40C635 的硬夹：`n = min(n, 5)` */
export const DISPATCH_MAX = 5;

/** 出兵量纲换算（[新设计]，见文件头 ②） */
export const TROOP_UNIT = 20;

/** 内政价目：与玩家内政同价（campaign.html 的 徵兵 金500→兵+40、開發 金400→民+3000） */
export const COST = Object.freeze({
  RECRUIT_GOLD: 500,
  RECRUIT_TROOPS: 40,
  SALARY_PER_OFFICER: 3,
  DEVELOP_GOLD: 400,
  DEVELOP_POP: 3000,
});

/** 月度漂移阈值（0x41B1BF，04b5 §2.4；初值 0x42D468/71/7A） */
export const DRIFT = Object.freeze({
  TIRE_HIGH: 0x3c,   // 疲劳 ≥ 60 → 士气 −1（0x41B34E cmp 0x3c）
  SPIRIT_LOW: 0x46,  // 否则 士气 < 70 → +1（0x41B3BD cmp 0x46）
  SPIRIT_CRIT: 0x28, // 士气 < 40 → 忠诚 −1（0x41B42B cmp 0x28）
  LOYAL_HIGH: 0x5a,  // 否则 忠诚 < 90 → +1（0x41B49D cmp 0x5a）
  TIRE_STEP: -1,
  SPIRIT_MAX: 100,
  LOYAL_MAX: 99,
});

/** 武将三项初值：士气 80 / 疲劳 0 / 忠诚 90（0x42D468/71/7A） */
export const GENERAL_INIT = Object.freeze({ spirit: 0x50, tire: 0, loyal: 0x5a });

// ---------------------------------------------------------------------------
// §2 小工具（一律不抛）
// ---------------------------------------------------------------------------

const str = (v) => (typeof v === 'string' ? v : '');
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, num(v) || 0));
/** rng 取整：等同 C 的 `rand(k)`，返回 0..k-1 */
function roll(rng, k) {
  const r = typeof rng === 'function' ? Number(rng()) : 0;
  const f = Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
  return Math.floor(f * k);
}

function cityOf(world, name) {
  const c = world && world.cities ? world.cities[name] : null;
  return c && typeof c === 'object' ? c : null;
}

/** city+0x10 所属势力；'' = 空城 */
export function forceOf(world, name) {
  if (typeof world?.forceOf === 'function') return str(world.forceOf(name));
  return str(cityOf(world, name)?.owner);
}

/** city+0x30 城内总兵数 */
export function troopsOf(world, name) {
  if (typeof world?.troopsOf === 'function') return Math.max(0, Math.trunc(num(world.troopsOf(name))));
  return Math.max(0, Math.trunc(num(cityOf(world, name)?.troops)));
}

/** city+0x14 太守；空城没有 → '' */
export function governorOf(world, name) {
  if (typeof world?.governorOf === 'function') return str(world.governorOf(name));
  const c = cityOf(world, name);
  if (!c) return '';
  const m = str(c.major);
  if (m) return m;
  const list = Array.isArray(c.officers) ? c.officers : [];
  return list.length ? str(list[0]?.name) : '';
}

/** city+0x3C 可出兵标志 = 有守将且有兵（0x40CAF1 开头 `if (city->[0x3C]==0) return 0`） */
export function canDispatch(world, name) {
  if (typeof world?.canDispatch === 'function') return Boolean(world.canDispatch(name));
  return Boolean(governorOf(world, name)) && troopsOf(world, name) > 0;
}

/** city+0x24 城内武将链（原样返回数组，未给就是空数组） */
export function officersOf(world, name) {
  if (typeof world?.officersOf === 'function') {
    const l = world.officersOf(name);
    return Array.isArray(l) ? l : [];
  }
  const c = cityOf(world, name);
  return Array.isArray(c?.officers) ? c.officers : [];
}

/**
 * 0x4054B9：取城的可通行邻城。跳过 `FLAGS==1` 的关卡。
 * 三个来源依次尝试：world.neighborsOf → world.adj（Map 或普通对象）→ world.paths 反推。
 */
export function neighborsOf(world, name) {
  const w = world || {};
  let out = [];
  if (typeof w.neighborsOf === 'function') {
    out = Array.isArray(w.neighborsOf(name)) ? w.neighborsOf(name) : [];
  } else if (w.adj) {
    if (typeof w.adj.get === 'function') out = Array.from(w.adj.get(name) || []);
    else if (Array.isArray(w.adj[name])) out = w.adj[name];
    else if (w.adj[name] instanceof Set) out = Array.from(w.adj[name]);
  }
  if (!out.length && Array.isArray(w.paths)) out = neighborsFromPaths(w.paths, name);
  const seen = new Set();
  return out
    .filter((n) => {
      if (typeof n !== 'string' || !n || n === name || seen.has(n)) return false;
      seen.add(n);
      return num(cityOf(w, n)?.flags) !== 1;   // 關卡不可通行
    });
}

/** 从 PATH 表反推邻城；Length>=30000 是「画了线但不可走」的哨兵 */
export function neighborsFromPaths(paths, name) {
  const out = [];
  for (const p of Array.isArray(paths) ? paths : []) {
    if (!p) continue;
    if (num(p.Length) >= 30000) continue;
    if (p.Start === name && typeof p.End === 'string') out.push(p.End);
    else if (p.End === name && typeof p.Start === 'string') out.push(p.Start);
  }
  return out;
}

/** 两城之间的 PATH Length；没有直接路 → NaN（调用方自行回落） */
export function pathLength(world, a, b) {
  for (const p of Array.isArray(world?.paths) ? world.paths : []) {
    if (!p || num(p.Length) >= 30000) continue;
    if ((p.Start === a && p.End === b) || (p.Start === b && p.End === a)) return num(p.Length);
  }
  return NaN;
}

/**
 * 占空城的「距离代价」d（RATE.OCCUPY/(d+1) 里的 d）。
 * 优先 world.distanceOf；否则按邻接表算跳数（相邻=1）。见文件头 ① 的冲突说明。
 */
export function distanceOf(world, a, b) {
  const w = world || {};
  if (typeof w.distanceOf === 'function') return Math.max(0, num(w.distanceOf(a, b)));
  if (a === b) return 0;
  const seen = new Set([a]);
  let frontier = [a];
  for (let d = 1; d <= 9; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const nb of neighborsOf(w, cur)) {
        if (nb === b) return d;
        if (seen.has(nb)) continue;
        seen.add(nb);
        next.push(nb);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return 9;
}

/** 0x40C511 可投入兵力上限；未定位 → 默认不设限（Infinity），只在 5 处生效 */
export function limitOf(world, name) {
  if (typeof world?.limitOf === 'function') return Math.max(0, num(world.limitOf(name)));
  return Infinity;
}

/** 城内兵上限：min(人口/2500+110, 600)，与 saves.cityTroops 同口径 */
export function capOf(world, name) {
  if (typeof world?.capOf === 'function') return Math.max(0, Math.trunc(num(world.capOf(name))));
  const c = cityOf(world, name);
  return Math.min(Math.floor(num(c?.pop) / 2500) + 110, 600);
}

/**
 * 势力名下所有城（king+0x338 城链）。
 * 原作里归属的**权威**是城上的 city+0x10（04c §2.1），城链只是派生索引；所以这里先扫
 * world.cities 的 owner，扫不到才退回 world.forces[id].cities。
 * 反过来（先信城链）会在「玩家占了别人的城」之后让旧势力拿着过期的城链去规划/出兵，
 * 实战表现为 AI 用自己的城打我方的城。
 */
export function citiesOf(world, forceId) {
  const id = str(forceId);
  if (!id) return [];
  const cities = world?.cities;
  if (cities && typeof cities === 'object' && Object.keys(cities).length) {
    const out = [];
    for (const name of Object.keys(cities)) if (str(cities[name]?.owner) === id) out.push(name);
    return out;
  }
  const f = world?.forces ? world.forces[id] : null;
  if (f && Array.isArray(f.cities)) return f.cities.slice();
  return [];
}

/** 全体势力 id：城上出现过的 owner（按 cities 键顺序）+ forces 里登记的（已灭亡的也留着） */
export function forcesOf(world) {
  const out = [];
  const seen = new Set();
  const push = (id) => {
    const k = str(id);
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(k);
  };
  const cities = world?.cities;
  if (cities && typeof cities === 'object') {
    for (const name of Object.keys(cities)) push(cities[name]?.owner);
  }
  if (world?.forces && typeof world.forces === 'object') {
    for (const id of Object.keys(world.forces)) if (world.forces[id]?.alive !== false) push(id);
  }
  return out;
}

/** 势力顺序（原作按 king 索引循环；这里按城出现顺序，保证可复现） */
export function forceOrder(world) {
  return forcesOf(world);
}

// ---------------------------------------------------------------------------
// §3 候选表 + ArgMaxRate（R73 的骨架）
// ---------------------------------------------------------------------------

/** 空候选表：{ limit, rows } */
export function createTable(limit = MAX_CANDIDATES) {
  return { limit: Math.max(0, Math.trunc(num(limit)) || MAX_CANDIDATES), rows: [] };
}

/**
 * 写入一条候选（0x40BE2F 的等价物）。表满（≥64）返回 false，与原作 [0x4C39A0] 上限一致。
 * 候选字段 ↔ 原作布局：act(+0x00) from(+0x04) to(+0x08) a(+0x0C) b(+0x10) c(+0x14) rate(+0x18)
 */
export function addCandidate(table, cand) {
  if (!table || !Array.isArray(table.rows)) return false;
  if (table.rows.length >= (num(table.limit) || MAX_CANDIDATES)) return false;
  const act = intOr(cand?.act, 0, 0, 8);
  table.rows.push({
    act,
    actName: ACT_NAMES[act],
    from: str(cand?.from),
    to: str(cand?.to),
    a: num(cand?.a),
    b: num(cand?.b),
    c: num(cand?.c),
    rate: num(cand?.rate),
    // 以下非原作字段，只给执行/日志用
    joinCity: str(cand?.joinCity),
    note: str(cand?.note),
  });
  return true;
}

export function tableSize(table) {
  return Array.isArray(table?.rows) ? table.rows.length : 0;
}

/**
 * 0x40CC10：在 rate[0..n] 上取最大值的下标，其中 rate[n] = 0x320（哨兵 800）。
 * 返回 n 表示「没有可执行行动」（调用方 `cmp ecx,[0x4C39A0] / je 结束`）。
 *
 * 并列取**后出现**的那条（`>=`，[推测]）。理由：原作给「聯合打玩家」和「單城攻玩家」
 * 同一个 Rate=200，如果并列取先出现，聯合候选（0x40C8EC 在 0x40C635 之后才 push）
 * 永远轮不到，等于那张 ACT=7 的行是死代码；反过来取后出现，联合就能压过单城进攻，
 * 而且联合部队兵力更大（两城各出一半），比单城更该被选中。
 */
export function argMaxRate(table) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  if (!rows.length) return 0;          // 空表：下标 0 == 哨兵位置 == 无行动
  let best = -1;
  let bestRate = -Infinity;
  for (let i = 0; i < rows.length; i++) {
    const r = num(rows[i]?.rate);
    if (r >= bestRate) { bestRate = r; best = i; }
  }
  if (bestRate >= RATE.SENTINEL) return rows.length;   // 撞到哨兵 → 无行动
  return best;
}

/** 取被选中的候选；没有就 null */
export function pickCandidate(table) {
  const i = argMaxRate(table);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  return i >= rows.length ? null : rows[i];
}

// ---------------------------------------------------------------------------
// §4 R75 出兵数 + R76 评分（0x40C635）
// ---------------------------------------------------------------------------
/**
 * 0x40C635 出兵数（R75）。原作伪代码：
 *   limit = 0x40C511(dst)
 *   if (dst->[+0x14] != 0) n = dst->[0x30] + rand(3) + 1;   // 有太守（非空城）
 *   else                    n = rand(2) + 1;                 // 空城只派 1..2
 *   n = min(n, limit); n = min(n, 5); n = min(n, src->[0x30] - 1)
 *   if (n == 0) return 0
 * 返回值是**原作量纲**的 1..5（落地换算见 TROOP_UNIT）。
 *
 * 边界：城里 0 兵 → `src-1 = -1` → 原式 `if (n==0)` 只挡 0，本实作把负值一并当 0
 * （[推测]；实际不会发生：可出兵的城必有将且兵 ≥1，见 canDispatch）。
 */
export function dispatchTroops(world, src, dst, rng = Math.random) {
  const w = world || {};
  const dstTroops = troopsOf(w, dst);
  const hasGovernor = Boolean(governorOf(w, dst));
  let n = hasGovernor ? dstTroops + roll(rng, 3) + 1 : roll(rng, 2) + 1;
  const limit = limitOf(w, dst);
  if (Number.isFinite(limit)) n = Math.min(n, limit);
  n = Math.min(n, DISPATCH_MAX);
  n = Math.min(n, troopsOf(w, src) - 1);
  if (n <= 0) return 0;
  return Math.trunc(n);
}

/** 0x40C635 的评分段（R76）：目标是谁决定 ACT 与 Rate */
export function scoreTarget(world, src, dst) {
  const w = world || {};
  const owner = forceOf(w, dst);
  const playerId = str(w.playerId);
  if (owner && playerId && owner === playerId) {
    return { act: ACT.ATTACK_PLAYER, rate: RATE.ATTACK_PLAYER };
  }
  if (!owner) {
    const d = distanceOf(w, src, dst);
    return { act: ACT.OCCUPY, rate: Math.floor(RATE.OCCUPY / (d + 1)) };
  }
  return { act: ACT.ATTACK_AI, rate: RATE.ATTACK_AI };
}

/** 打下一座城「需要」多少兵：城内兵 + 1（[推测]，0x40C8EC 的 needed 未定位） */
export function neededTroops(world, dst) {
  return troopsOf(world, dst) + 1;
}

/**
 * 0x40C47C 武将个人行动值（合计进候选 a）。
 * 内部未定位：这里退化成「在职武将的 STR+INT」，只用于日志/候选参数，**不参与评分**。
 * 等级：[推测]。
 */
export function officerPower(officer) {
  const o = officer || {};
  if (!isEmployed(o)) return 0;
  return Math.trunc(num(o.str ?? o.STR) + num(o.int ?? o.INT));
}

/** 在职判定：`g->[+0x91] & 1`（garrison.json 的 status："登"=在职，"野"=在野） */
export function isEmployed(officer) {
  const o = officer || {};
  const st = o.status ?? o.STATUS;
  if (typeof st === 'number') return (st & 1) === 1;
  const s = str(st);
  if (s === '登' || s === '在' || s === '1') return true;
  if (s === '' || s === '野' || s === '俘') return false;
  return false;
}

// ---------------------------------------------------------------------------
// §5 R73 四个规划器
// ---------------------------------------------------------------------------

/**
 * PlanDomestic（0x40BFCE，[推测]）：補金 / 逃跑 / cheat 三类候选。
 *   · 補金 ACT=1：城内金 < 太守俸祿（3×武將數）或 < 徵兵成本 → 從自家最富的城撥款。
 *     Rate = 22 + 缺口/200，夹在 22..30。
 *   · 逃跑 ACT=2：城内 0 兵且相邻有敌城 ≥30 兵 → 把城內金搬到後方自家城。
 *   · cheat ACT=6：仅 world.rules.cheat 开启时（原作触发条件未定位）。
 */
export function planDomestic(world, forceId, table, opts = {}) {
  const w = world || {};
  const added = [];
  const rules = opts.rules || w.rules || {};
  const cities = citiesOf(w, forceId);
  const push = (cand) => {
    if (addCandidate(table, cand)) added.push(table.rows[table.rows.length - 1]);
  };

  for (const city of cities) {
    const c = cityOf(w, city);
    if (!c) continue;
    const officers = officersOf(w, city).filter(isEmployed);
    const salary = officers.length * COST.SALARY_PER_OFFICER;
    const need = Math.max(salary, COST.RECRUIT_GOLD);
    const money = num(c.money);
    if (money < need) {
      const donor = cities
        .filter((n) => n !== city && num(cityOf(w, n)?.money) > need)
        .sort((a, b) => (num(cityOf(w, b)?.money) - num(cityOf(w, a)?.money)) || a.localeCompare(b))[0];
      if (donor) {
        const amount = Math.min(num(cityOf(w, donor)?.money) - need, need - money);
        if (amount > 0) {
          const rate = clamp(RATE_BAND.GOLD_MIN + Math.floor(amount / 200), RATE_BAND.GOLD_MIN, RATE_BAND.GOLD_MAX);
          push({ act: ACT.GOLD, from: donor, to: city, a: amount, b: 0, c: 0, rate, note: 'fund' });
        }
      }
    }
    // 逃跑：無兵且被敵城貼著
    if (troopsOf(w, city) === 0) {
      const threat = neighborsOf(w, city).filter((n) => {
        const own = forceOf(w, n);
        return own && own !== str(forceId) && troopsOf(w, n) >= 30;
      });
      const refuge = cities
        .filter((n) => n !== city)
        .sort((a, b) => (troopsOf(w, b) - troopsOf(w, a)) || a.localeCompare(b))[0];
      if (threat.length && refuge) {
        push({
          act: ACT.FLEE, from: city, to: refuge,
          a: num(c.money), b: 0, c: 0, rate: RATE_BAND.FLEE, note: 'flee',
        });
      }
    }
    // cheat：僅在規則開啟時
    if (rules.cheat) {
      const gold = cities.reduce((s, n) => s + num(cityOf(w, n)?.money), 0);
      if (gold < COST.RECRUIT_GOLD || (cities.length === 1 && troopsOf(w, city) < 20)) {
        push({
          act: ACT.CHEAT, from: city, to: city,
          a: COST.RECRUIT_GOLD, b: COST.RECRUIT_TROOPS, c: 0, rate: RATE_BAND.CHEAT, note: 'cheat',
        });
      }
    }
  }
  return added;
}

/**
 * PlanRecruit（0x40C1E4）：**即时徵兵**，不产生候选。
 *
 * 依据：0x487248 的 ACT 表里没有「徵兵」这一项（9 项已全列出），而 0x40C1E4 是在
 * 0x40CBB6 的逐城循环里、ArgMax 之前被调用的——所以徵兵只能是扫描期的就地操作，
 * 不是「本月的那个动作」。等级：[推测]（函数体未定位，本条是从 ACT 表反推的）。
 *
 * 规则：城内金 ≥ 500 且兵 < 上限 → 金 −500、兵 +40（与玩家内政同价）。
 * 返回 [{ city, gold, troops, before, after }]。
 */
export function planRecruit(world, forceId) {
  const w = world || {};
  const out = [];
  for (const city of citiesOf(w, forceId)) {
    const c = cityOf(w, city);
    if (!c) continue;
    if (num(c.money) < COST.RECRUIT_GOLD) continue;
    const cur = troopsOf(w, city);
    const cap = capOf(w, city);
    if (cur >= cap) continue;
    const add = Math.min(COST.RECRUIT_TROOPS, cap - cur);
    if (add <= 0) continue;
    c.money = num(c.money) - COST.RECRUIT_GOLD;
    c.troops = cur + add;
    out.push({ city, gold: COST.RECRUIT_GOLD, troops: add, before: cur, after: c.troops });
  }
  return out;
}

/**
 * PlanAttack（0x40CAF1 + 0x40C635 + 0x40C8EC）：攻城、占空城、联合三类候选。
 *   ① `if (city->[0x3C]==0) return 0` → 无守将/无兵的城不产生候选
 *   ② 城内在职武将的 0x40C47C 合计 → 候选参数 a
 *   ③ 沿邻城槽（最多 9 个）：跳过同势力城 → 0x40C635 算出兵数 + 评分
 *   ④ 联合：目标城另有一座本势力城相邻，且两城可投入上限之和 ≥ 本次出兵数
 */
export function planAttack(world, forceId, table, opts = {}) {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const added = [];
  const push = (cand) => {
    if (addCandidate(table, cand)) added.push(table.rows[table.rows.length - 1]);
  };

  for (const src of citiesOf(w, forceId)) {
    if (!canDispatch(w, src)) continue;
    let total = 0;
    for (const g of officersOf(w, src)) total += officerPower(g);
    const nbs = neighborsOf(w, src).slice(0, 9);   // city+0x46..0x66 九个槽
    for (const dst of nbs) {
      if (forceOf(w, dst) === forceOf(w, src)) continue;   // 自家城跳过
      const n = dispatchTroops(w, src, dst, rng);
      if (n <= 0) continue;                                // 出兵数 0 → 这条不打
      const sc = scoreTarget(w, src, dst);
      push({ act: sc.act, from: src, to: dst, a: total, b: n, c: 0, rate: sc.rate });
      // 联合（0x40C8EC）
      for (const row of planJoin(w, forceId, src, dst, n)) push(row);
    }
  }
  return added;
}

/**
 * 0x40C8EC 联合：目标城 dst 的邻城里有本势力的另一座城 nb（≠ src），
 * 且 limit(src) + limit(nb) >= 本次出兵数 → 两城对半分兵，记 ACT=7 候选。
 * Rate：打玩家 200、打其它 50。等级：[推测]（`needed` 的口径与 half 的取整未定位）。
 */
export function planJoin(world, forceId, src, dst, needed) {
  const w = world || {};
  const out = [];
  const owner = forceOf(w, dst);
  if (!owner) return out;   // 空城不需要联合（出兵只要 1..2）——[推测]
  const need = Math.max(1, Math.trunc(num(needed)));
  const isPlayer = owner === str(w.playerId);
  const rate = isPlayer ? RATE.JOIN_PLAYER : RATE.JOIN_AI;
  const srcLimit = limitOf(w, src);
  for (const nb of neighborsOf(w, dst).slice(0, 9)) {
    if (nb === src) continue;
    if (forceOf(w, nb) !== str(forceId)) continue;
    if (srcLimit + limitOf(w, nb) < need) continue;
    const half = Math.floor(need / 2);
    const a = Math.min(half, DISPATCH_MAX, Math.max(0, troopsOf(w, src) - 1));
    const b = Math.min(need - half, DISPATCH_MAX, Math.max(0, troopsOf(w, nb) - 1));
    if (a <= 0 || b <= 0) continue;
    out.push({ act: ACT.JOIN, from: src, to: dst, a, b, c: 0, rate, joinCity: nb });
  }
  return out;
}

/**
 * PlanMoveGeneral（0x40C34D，[推测]）：本势力有城武将 ≥2、且有城一个武将都没有 → 调 1 人过去。
 * Rate = 24 + (目标城兵缺/上限)*4，夹在 24..28。
 */
export function planMoveGeneral(world, forceId, table) {
  const w = world || {};
  const added = [];
  const cities = citiesOf(w, forceId);
  const push = (cand) => {
    if (addCandidate(table, cand)) added.push(table.rows[table.rows.length - 1]);
  };
  const empty = cities.filter((n) => officersOf(w, n).filter(isEmployed).length === 0);
  if (!empty.length) return added;
  for (const to of empty) {
    const from = cities
      .filter((n) => n !== to && officersOf(w, n).filter(isEmployed).length >= 2)
      .sort((a, b) => (troopsOf(w, b) - troopsOf(w, a)) || a.localeCompare(b))[0];
    if (!from) continue;
    const cap = capOf(w, to) || 1;
    const rate = clamp(RATE_BAND.MOVE_MIN + Math.floor(((cap - troopsOf(w, to)) / cap) * 4),
      RATE_BAND.MOVE_MIN, RATE_BAND.MOVE_MAX);
    push({ act: ACT.MOVE_GENERAL, from, to, a: 1, b: 0, c: 0, rate, note: 'move' });
  }
  return added;
}

/**
 * 一个势力一个月的完整规划（0x40D751 的 0x40BE20 → 0x40CBB6 → 0x40CC10 三段）。
 * 四个规划器**按原作顺序**跑：内政 → 征兵（即时）→ 攻城 → 调将。
 * 返回 { force, table, stages, immediate, chosen }。
 */
export function planForceMonth(world, forceId, opts = {}) {
  const w = world || {};
  const table = createTable();
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const rules = opts.rules || w.rules || {};
  planDomestic(w, forceId, table, { rules });
  const immediate = planRecruit(w, forceId);
  planAttack(w, forceId, table, { rng });
  planMoveGeneral(w, forceId, table);
  const count = (act) => table.rows.filter((r) => r.act === act).length;
  const stage = {
    domestic: count(ACT.GOLD) + count(ACT.FLEE) + count(ACT.CHEAT),
    recruit: immediate.length,
    attack: count(ACT.ATTACK_PLAYER) + count(ACT.ATTACK_AI) + count(ACT.OCCUPY) + count(ACT.JOIN),
    join: count(ACT.JOIN),
    move: count(ACT.MOVE_GENERAL),
  };
  return { force: str(forceId), table, stages: stage, immediate, chosen: pickCandidate(table) };
}

/**
 * 全体势力跑一个月（AI 总入口 0x40D751）：玩家势力跳过，每个 AI 势力各挑一个动作执行。
 * 返回 { reports, executed }。
 */
export function runMonth(world, opts = {}) {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const playerId = str(opts.playerId !== undefined ? opts.playerId : w.playerId);
  const reports = [];
  const executed = [];
  for (const forceId of forceOrder(w)) {
    if (forceId === playerId) continue;
    if (!citiesOf(w, forceId).length) continue;
    const r = planForceMonth(w, forceId, { rng, rules: opts.rules });
    let result = null;
    if (r.chosen) {
      result = executeCandidate(w, r.chosen, { rng });
      executed.push({ force: forceId, cand: r.chosen, result });
    }
    reports.push({ ...r, result });
  }
  return { reports, executed };
}

// ---------------------------------------------------------------------------
// §6 执行（0x40D52F）+ AI 对 AI 的结算
// ---------------------------------------------------------------------------

/** 候选 → 原作调试串（0x40BECB：`ACT=%s, 從%s%d人 -> %s%d人, 出兵%d人，Rate=%d`） */
export function describeCandidate(world, cand) {
  const w = world || {};
  const act = intOr(cand?.act, 0, 0, 8);
  const from = str(cand?.from);
  const to = str(cand?.to);
  // ACT 表之外的类别（徵兵/開墾/搜索）走 §11 的文案；act 1..8 的原文案一字不动
  if (act === ACT.NONE && str(cand?.kind)) return describeKindCandidate(w, cand);
  let s = `ACT=${ACT_NAMES[act]}, 從${from}${troopsOf(w, from)}人 -> ${to}${troopsOf(w, to)}人, 出兵${num(cand?.b)}人，Rate=${num(cand?.rate)}`;
  if (act === ACT.JOIN) {
    const j = str(cand?.joinCity);
    s += `\n聯合${j}${troopsOf(w, j)}人,出兵${num(cand?.b)}人`;
  }
  return s;
}

/** 候选 → 中文战报一行（给 #logbox 用） */
export function describeAction(world, cand) {
  const w = world || {};
  const act = intOr(cand?.act, 0, 0, 8);
  const from = str(cand?.from);
  const to = str(cand?.to);
  const owner = forceOf(w, from);
  if (act === ACT.NONE && str(cand?.kind)) return describeKindAction(w, cand);
  switch (act) {
    case ACT.GOLD:
      return `${owner} 補 金：${from} → ${to} ${num(cand?.a)} 金`;
    case ACT.FLEE:
      return `${owner} 逃 跑：${from} 撤往 ${to}（帶走 ${num(cand?.a)} 金）`;
    case ACT.MOVE_GENERAL:
      return `${owner} 調 將：${from} → ${to}`;
    case ACT.ATTACK_PLAYER:
      return `${owner} 攻 擊 player：${from} → ${to}（出兵 ${num(cand?.b) * TROOP_UNIT}）`;
    case ACT.ATTACK_AI:
      return `${owner} 攻 擊 ai：${from} → ${to}（出兵 ${num(cand?.b) * TROOP_UNIT}）`;
    case ACT.CHEAT:
      return `${owner} cheat：${from} 金 +${num(cand?.a)} 兵 +${num(cand?.b)}`;
    case ACT.JOIN:
      return `${owner} 聯 合：${from} + ${str(cand?.joinCity)} → ${to}（出兵 ${(num(cand?.a) + num(cand?.b)) * TROOP_UNIT}）`;
    case ACT.OCCUPY:
      return `${owner} 佔 領 空 城：${from} → ${to}（出兵 ${num(cand?.b) * TROOP_UNIT}）`;
    default:
      return `${owner} 不明：${from} → ${to}`;
  }
}

/**
 * 执行一条候选（0x40D52F）。
 *   1/2/3/6 类：就地改 world.cities，返回 { kind:'domestic' }
 *   4/5/7/8 类：从出发城扣兵，返回 { kind:'battle', troops, joinCity }；由调用方决定
 *   是跳守城战（打玩家）还是调 resolveBattle（打 AI / 占空城）。
 * 永远不抛；不合法（城不存在、兵不够）返回 { ok:false, reason }。
 */
export function executeCandidate(world, cand, opts = {}) {
  const w = world || {};
  if (!cand || typeof cand !== 'object') {
    return { ok: false, reason: 'no-candidate', act: ACT.NONE, debug: '', text: '' };
  }
  const act = intOr(cand?.act, 0, 0, 8);
  const from = str(cand?.from);
  const to = str(cand?.to);
  const src = cityOf(w, from);
  const dst = cityOf(w, to);
  const debug = describeCandidate(w, cand);
  const text = describeAction(w, cand);
  const fail = (reason) => ({ ok: false, reason, act, debug, text });

  switch (act) {
    case ACT.GOLD: {
      if (!src || !dst) return fail('city-missing');
      const amount = Math.max(0, Math.min(num(cand?.a), num(src.money)));
      if (amount <= 0) return fail('no-gold');
      src.money = num(src.money) - amount;
      dst.money = num(dst.money) + amount;
      return { ok: true, kind: 'domestic', act, amount, debug, text };
    }
    case ACT.FLEE: {
      if (!src || !dst) return fail('city-missing');
      const amount = Math.max(0, num(src.money));
      src.money = 0;
      dst.money = num(dst.money) + amount;
      return { ok: true, kind: 'domestic', act, amount, debug, text };
    }
    case ACT.MOVE_GENERAL: {
      if (!src || !dst) return fail('city-missing');
      const list = Array.isArray(src.officers) ? src.officers : [];
      const idx = list.findIndex((o) => isEmployed(o) && str(o?.name) && str(o.name) !== str(src.major));
      if (idx < 0) return fail('no-officer');
      const [g] = list.splice(idx, 1);
      if (!Array.isArray(dst.officers)) dst.officers = [];
      dst.officers.push(g);
      if (!str(dst.major)) dst.major = str(g?.name);
      return { ok: true, kind: 'domestic', act, officer: str(g?.name), debug, text };
    }
    case ACT.CHEAT: {
      if (!src) return fail('city-missing');
      src.money = num(src.money) + num(cand?.a);
      src.troops = troopsOf(w, from) + num(cand?.b);
      return { ok: true, kind: 'domestic', act, debug, text };
    }
    case ACT.ATTACK_PLAYER:
    case ACT.ATTACK_AI:
    case ACT.OCCUPY:
    case ACT.JOIN: {
      if (!src || !dst) return fail('city-missing');
      const n = Math.max(0, Math.trunc(num(cand?.b)));
      const n2 = act === ACT.JOIN ? Math.max(0, Math.trunc(num(cand?.a))) : 0;
      const joinCity = str(cand?.joinCity);
      const joinSrc = joinCity ? cityOf(w, joinCity) : null;
      if (n <= 0) return fail('no-troops');
      if (troopsOf(w, from) < n) return fail('not-enough-troops');
      if (act === ACT.JOIN && (!joinSrc || troopsOf(w, joinCity) < n2)) return fail('join-not-enough');
      src.troops = troopsOf(w, from) - n;
      if (joinSrc) joinSrc.troops = troopsOf(w, joinCity) - n2;
      const troops = (n + n2) * TROOP_UNIT;
      return {
        ok: true, kind: 'battle', act, from, to, joinCity,
        dispatch: n + n2, troops,
        // 记下下命令这一刻的攻守双方（同一月的结算可能晚于别人抢城，见 resolveBattle）
        attacker: forceOf(w, from), defender: forceOf(w, to),
        debug, text: act === ACT.JOIN
          ? `${text.slice(0, text.length - 1)}）＋${joinCity} 出兵 ${n2 * TROOP_UNIT}`
          : text,
      };
    }
    default:
      return fail('act-unknown');
  }
}

/**
 * AI 对 AI / 空城的就地结算（打玩家不会走这里——那是守城战）。
 * 空城：直接易主；有主：按出兵比掷骰，赢家占城。
 * `info` 来自 executeCandidate 的返回值（含 troops 与 joinCity）。
 */
export function resolveBattle(world, info, rng = Math.random) {
  const w = world || {};
  const to = str(info?.to);
  const from = str(info?.from);
  const dst = cityOf(w, to);
  const src = cityOf(w, from);
  if (!dst || !src) return { ok: false, reason: 'city-missing' };
  // attacker 用「下命令时」记下的势力（executeCandidate 写入），因为同一月的结算可能在别的
  // 势力已经抢走源城之后才跑到这里；defender 用「结算这一刻」的城主，不然君主会判错人。
  const attacker = str(info?.attacker) || forceOf(w, from);
  const defOwner = forceOf(w, to);
  const oldMajor = str(dst.major);
  let atk = Math.max(1, Math.trunc(num(info?.troops)));
  let def = troopsOf(w, to);
  // 计划时这座城还是别人的，结算时已经归自己了（同月被别人打下的城又被打回来）→ 不重复开战
  if (defOwner && defOwner === attacker) {
    return { ok: true, captured: false, skipped: true, reason: 'already-own', attacker, defender: defOwner, atk, def: 0, left: def, oldMajor };
  }
  if (!defOwner) {
    dst.owner = attacker;
    dst.troops = atk;
    if (!str(dst.major)) dst.major = str(src.major);
    return { ok: true, captured: true, empty: true, attacker, defender: '', atk, def: 0, oldMajor };
  }
  const total = atk + def;
  const p = total > 0 ? atk / total : 0.5;
  const win = Number(rng()) < p;
  if (win) {
    const left = Math.max(1, Math.round(atk * (1 - p)));
    dst.owner = attacker;
    dst.troops = left;
    dst.major = str(src.major);          // 破城後太守 = 攻方主將
    if (Array.isArray(dst.officers)) dst.officers = [];
    return { ok: true, captured: true, empty: false, attacker, defender: defOwner, atk, def, left, oldMajor };
  }
  const left = Math.max(1, Math.round(def * (1 - p)));
  dst.troops = left;
  return { ok: true, captured: false, empty: false, attacker, defender: defOwner, atk, def, left, oldMajor };
}

// ---------------------------------------------------------------------------
// §7 R78 + R4 势力归属 / 君主灭亡 / 继承
// ---------------------------------------------------------------------------
/**
 * 存档里的势力模型（与 campaign.html 的 save 对齐，但这里只碰纯数据）：
 *   save.king           玩家势力 id（= 君主名，原作 [0x4A64F0]）
 *   save.forces[ id ]   { id, king, flag, alive, cities:[], ts }
 *   save.cities[n].owner  city+0x10 所属势力 id；'' = 空城
 *   save.owned          玩家城列表（main.js 的战斗写回只认这个，故与 owner 双向同步）
 */

/** 从「城 → 势力」映射建 forces 表；已存在的条目保留其 flag/ts，只刷新 cities/alive */
export function buildForces(save, ownerMap = {}) {
  const s = save && typeof save === 'object' ? save : {};
  const cities = s.cities && typeof s.cities === 'object' ? s.cities : {};
  if (!s.forces || typeof s.forces !== 'object' || Array.isArray(s.forces)) s.forces = {};
  const byForce = new Map();
  for (const name of Object.keys(cities)) {
    const st = cities[name];
    if (!st || typeof st !== 'object') continue;
    if (!('owner' in st) || typeof st.owner !== 'string') {
      const fallback = typeof ownerMap[name] === 'string' ? ownerMap[name] : '';
      st.owner = fallback;
    }
    const id = str(st.owner);
    if (!id) continue;
    if (!byForce.has(id)) byForce.set(id, []);
    byForce.get(id).push(name);
  }
  for (const [id, list] of byForce) {
    const cur = s.forces[id];
    if (!cur || typeof cur !== 'object') {
      s.forces[id] = { id, king: id, flag: 0, alive: true, cities: list, ts: 0 };
    } else {
      cur.id = id;
      if (typeof cur.king !== 'string' || !cur.king) cur.king = id;
      cur.cities = list;
      if (cur.alive !== false || list.length) cur.alive = list.length > 0;
    }
  }
  // 已灭亡的势力：保留条目（供日志/UI 查），cities 清空
  for (const id of Object.keys(s.forces)) {
    const f = s.forces[id];
    if (!f || typeof f !== 'object') continue;
    if (!byForce.has(id)) {
      f.cities = [];
      if (f.alive !== false) f.alive = false;
    }
  }
  return s.forces;
}

/** 玩家 owned ↔ cities.owner 双向同步（main.js 只写 owned，所以读档/换月都要对齐一次） */
export function syncOwned(save) {
  const s = save && typeof save === 'object' ? save : {};
  const king = str(s.king);
  const cities = s.cities && typeof s.cities === 'object' ? s.cities : {};
  const owned = Array.isArray(s.owned) ? s.owned.filter((n) => typeof n === 'string' && cities[n]) : [];
  const keep = [];
  for (const n of owned) {
    if (king) cities[n].owner = king;
    if (!keep.includes(n)) keep.push(n);
  }
  if (king) {
    for (const name of Object.keys(cities)) {
      const st = cities[name];
      if (!st || typeof st !== 'object') continue;
      if (str(st.owner) === king && !keep.includes(name)) st.owner = '';
    }
  }
  s.owned = keep;
  return s.owned;
}

/** 势力摘要（给 UI / 测试）：[{ id, king, cities, troops, money, generals, alive }] */
export function forceSummary(world) {
  const w = world || {};
  return forcesOf(w).map((id) => {
    const cities = citiesOf(w, id);
    let troops = 0;
    let money = 0;
    let generals = 0;
    for (const n of cities) {
      troops += troopsOf(w, n);
      money += num(cityOf(w, n)?.money);
      generals += officersOf(w, n).filter(isEmployed).length;
    }
    return { id, king: str(w.forces?.[id]?.king) || id, cities: cities.length, troops, money, generals, alive: cities.length > 0 };
  });
}

/**
 * 继任君主：同势力城内在职武将里 STR+INT 最高、且不是现任君主的那位。
 * 原作「继承」规则未定位（04c §2.1 只给了君主编号的存放位置），本实作按「最强者继位」，
 * 等级：[推测]。没有可继任者 → ''。
 */
export function successorOf(world, forceId) {
  const w = world || {};
  const king = str(forceId);
  let best = null;
  let bestPower = -Infinity;
  for (const city of citiesOf(w, king)) {
    for (const o of officersOf(w, city)) {
      if (!isEmployed(o)) continue;
      const name = str(o?.name);
      if (!name || name === king) continue;
      const power = num(o.str ?? o.STR) + num(o.int ?? o.INT);
      if (power > bestPower) { bestPower = power; best = name; }
    }
  }
  return best ? str(best) : '';
}

/**
 * 势力灭亡（R78）：城按「最近的其它势力」改嫁；找不到就把城变空城。
 * 默认**不繼承**：君主死了势力就是灭了（任务书 R78 的要求）。
 * `opts.inherit === true` 才走另一条路——同势力 STR+INT 最高的在职武將继位，只换 id。
 * 那条是 [推测]（原作没有君主繼承的证据），正式流程不开，只留给测试/剧本。
 *
 * @returns {{ok:boolean, extinguished:boolean, succeeded:boolean, newKing:string,
 *            inherited:Array<{city:string,to:string}>, reason:string}}
 */
export function extinguishForce(world, forceId, opts = {}) {
  const w = world || {};
  const id = str(forceId);
  const empty = { ok: false, extinguished: false, succeeded: false, newKing: '', inherited: [], reason: 'no-force' };
  if (!id) return empty;
  const cities = citiesOf(w, id);
  if (!cities.length) return { ...empty, ok: true, extinguished: true, reason: 'no-cities' };
  if (opts.inherit === true) {
    const heir = successorOf(w, id);
    if (heir) {
      for (const name of cities) {
        const st = cityOf(w, name);
        if (st) st.owner = heir;
      }
      if (w.forces && w.forces[id]) {
        w.forces[id].alive = false;
        w.forces[id].cities = [];
      }
      if (!w.forces || !w.forces[heir]) {
        if (!w.forces) w.forces = {};
        w.forces[heir] = { id: heir, king: heir, flag: num(w.forces?.[id]?.flag), alive: true, cities: cities.slice(), ts: 0 };
      } else {
        w.forces[heir].alive = true;
        w.forces[heir].cities = [...new Set([...(w.forces[heir].cities || []), ...cities])];
      }
      if (w.playerId === id) w.playerId = heir;
      return { ok: true, extinguished: false, succeeded: true, newKing: heir, inherited: cities.map((c) => ({ city: c, to: heir })), reason: 'inherit' };
    }
  }
  // 无继任 → 灭亡：城归最近的其它势力，找不到就变空城
  const inherited = [];
  for (const name of cities) {
    const st = cityOf(w, name);
    if (!st) continue;
    const near = nearestForce(w, name, id);
    st.owner = near;
    inherited.push({ city: name, to: near });
  }
  if (w.forces && w.forces[id]) {
    w.forces[id].alive = false;
    w.forces[id].cities = [];
  }
  // 玩家自己的势力灭了：playerId 不能继续指着一个已灭亡的 id（'' = 已无势力，顶栏显示「未選」）
  if (w.playerId === id) w.playerId = '';
  return { ok: true, extinguished: true, succeeded: false, newKing: '', inherited, reason: 'extinct' };
}

/** 离 name 最近的「非 exclude 势力」的城所属势力；没有 → ''（变空城） */
export function nearestForce(world, name, exclude) {
  const w = world || {};
  const bad = str(exclude);
  const seen = new Set([name]);
  let frontier = [name];
  for (let d = 0; d < 9; d++) {
    const next = [];
    for (const cur of frontier) {
      for (const nb of neighborsOf(w, cur)) {
        const owner = forceOf(w, nb);
        if (owner && owner !== bad) return owner;
        if (seen.has(nb)) continue;
        seen.add(nb);
        next.push(nb);
      }
    }
    if (!next.length) break;
    frontier = next;
  }
  return '';
}

/**
 * 君主阵亡/被俘的入口：`kings` 是「已死/被俘的君主名」集合。
 * 每命中一个势力就按 extinguishForce 处理（有继任则改嫁，无则灭亡）。
 */
export function applyKingDeaths(world, kings) {
  const w = world || {};
  const list = Array.isArray(kings) ? kings : (kings ? [kings] : []);
  const out = [];
  for (const name of list) {
    const id = str(name);
    if (!id || !w.forces || !w.forces[id]) continue;
    if (w.forces[id].alive === false) continue;
    out.push({ force: id, ...extinguishForce(w, id) });
  }
  return out;
}

/**
 * 君主阵亡/被俘的触发点（R78）：攻陷一座城时调用。
 *
 * 条件 = 破城的太守（city+0x14）正是原势力的君主本人（势力 id == 君主名）。此时君主
 * 随城陷落 → 势力灭亡：名下城池按「最近的势力」改嫁（找不到就变空城），并记事件。
 * 原作这个判定点未定位（04c §2.1 只给了君主编号的存放位置），条件是 [推测]；
 * 「君主死 = 势力灭」是任务书 R78 明确要求的走向。
 *
 * `opts.inherit === true` 时改走「有繼承者就換 id 續命」（[推测]，原作没有证据支持，
 * 只作为可选规则给测试/未来剧本用，正式流程不开）。
 *
 * @param {object} world   已改好 owner 的 world（调用方应在破城后再调）
 * @param {string} cityName
 * @param {object} [opts]  {major?: 破城前的太守, owner?: 破城前该城的势力 id}
 * @returns {{killed:boolean, force:string, heir:string, extinguished:boolean}}
 */
export function captureKingIn(world, cityName, opts = {}) {
  const w = world || {};
  const name = str(cityName);
  const none = { killed: false, force: '', heir: '', extinguished: false };
  if (!name || !w.forces) return none;
  // 破城后的太守会被改写成「攻方主将」，所以必须用调用方记下的「破城前太守」，
  // 不能回头问 governorOf（那已经是打赢的人了 → 会把自己判死，占空城时尤其致命）。
  const major = str(opts.major);
  if (!major) return none;
  // 太守得同时是「这座城原来的主人」：空城（''）没人可死，别家挂名守城的也不算。
  // garrison.json 里太守与 owner 不是一一对应，不查这一条会把别家的君主判死。
  if (opts.owner === undefined) return none;
  const ownerForce = str(opts.owner);
  if (!ownerForce || ownerForce !== major) return none;
  const f = w.forces[major];
  if (!f || f.alive === false) return none;
  // 太守 == 君主，且該勢力還有別的城（沒城了就是「丟光城池」，走 checkForceDeaths）
  if (citiesOf(w, major).length === 0) return none;
  const res = extinguishForce(w, major, { inherit: opts.inherit === true });
  return { killed: true, force: major, heir: res.newKing, extinguished: res.extinguished };
}

/**
 * 每月末的势力体检：城数为 0 的势力 → 灭亡（无城可继承，只标 alive=false）。
 * 返回被灭亡的势力 id 列表。
 */
export function checkForceDeaths(world) {
  const w = world || {};
  const out = [];
  if (!w.forces || typeof w.forces !== 'object') return out;
  for (const id of Object.keys(w.forces)) {
    const f = w.forces[id];
    if (!f || typeof f !== 'object') continue;
    if (f.alive === false) continue;
    if (citiesOf(w, id).length === 0) {
      f.alive = false;
      f.cities = [];
      out.push(id);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// §8 R65 月度漂移（0x41B1BF，04b5 §2.4 逐条指令）
// ---------------------------------------------------------------------------
/**
 * 每月：疲劳 −1（下限 0，不过 0）；
 *   · 疲劳 ≥ 60 → 士气 −1（0x41B34E `cmp ecx,0x3c / jl`）
 *   · 否则 士气 < 70 → 士气 +1（0x41B3BD `cmp eax,0x46 / jge`）
 *   · 士气 < 40 → 忠诚 −1（0x41B42B `cmp edx,0x28 / jge`）
 *   · 否则 忠诚 < 90 → 忠诚 +1（0x41B49D `cmp ecx,0x5a / jge`）
 *
 * `save` 用 `save.tire` / `save.morale` / `save.loyal` 三个 `{武將名: 数值}` 映射；
 * 缺省值走 GENERAL_INIT（士气 80 / 忠诚 90，0x42D468/71/7A）。
 * `officersByCity` = `{城: [武將名或 {name}]}`，只对其中出现的武將漂移（在职者）。
 */
export function monthlyDrift(save, officersByCity, opts = {}) {
  const s = save && typeof save === 'object' ? save : {};
  const parts = String(opts.parts || 'tire,spirit,loyal');
  const on = (k) => parts.includes(k);
  const spiritMax = num(opts.spiritMax ?? DRIFT.SPIRIT_MAX) || DRIFT.SPIRIT_MAX;
  const loyalMax = num(opts.loyalMax ?? DRIFT.LOYAL_MAX) || DRIFT.LOYAL_MAX;
  const rowOf = typeof opts.rowOf === 'function' ? opts.rowOf : () => null;
  const tire = normalizeMap(s.tire);
  const morale = normalizeMap(s.morale);
  const loyal = normalizeMap(s.loyal);
  const names = officerNames(officersByCity);
  const out = {
    tire: { down: 0 },
    spirit: { down: 0, up: 0, skipped: 0 },
    loyal: { down: 0, up: 0, skipped: 0 },
    names: names.length,
  };
  for (const name of names) {
    // 疲劳：每月 −1（0x41B302 sub dx,1，且只在 >0 时减）
    const curTire = Math.max(0, Math.trunc(num(tire[name] ?? GENERAL_INIT.tire)));
    const nextTire = on('tire') ? Math.max(0, curTire + DRIFT.TIRE_STEP) : curTire;
    if (nextTire !== curTire) { tire[name] = nextTire; out.tire.down += 1; }
    // 士气
    let spirit = clamp(morale[name] ?? GENERAL_INIT.spirit, 0, spiritMax);
    if (on('spirit')) {
      if (nextTire >= DRIFT.TIRE_HIGH) {
        if (spirit > 0) { spirit -= 1; out.spirit.down += 1; } else out.spirit.skipped += 1;
      } else if (spirit < DRIFT.SPIRIT_LOW) {
        if (spirit < spiritMax) { spirit += 1; out.spirit.up += 1; } else out.spirit.skipped += 1;
      } else {
        out.spirit.skipped += 1;
      }
      morale[name] = spirit;
    }
    // 忠诚（阈值看士气，不看忠诚本身是否 <40）
    if (on('loyal')) {
      let loy = clamp(loyal[name] ?? loyalOf(s, name, rowOf(name)), 0, loyalMax);
      if (spirit < DRIFT.SPIRIT_CRIT) {
        if (loy > 0) { loy -= 1; out.loyal.down += 1; } else out.loyal.skipped += 1;
      } else if (loy < DRIFT.LOYAL_HIGH) {
        if (loy < loyalMax) { loy += 1; out.loyal.up += 1; } else out.loyal.skipped += 1;
      } else {
        out.loyal.skipped += 1;
      }
      loyal[name] = loy;
    }
  }
  s.tire = tire;
  s.morale = morale;
  s.loyal = loyal;
  return out;
}

/** 士气取值：存档里的值优先，缺省 80（原作 0x42D468） */
export function spiritOf(save, name) {
  const v = normalizeMap(save?.morale)[name];
  return clamp(v ?? GENERAL_INIT.spirit, 0, DRIFT.SPIRIT_MAX);
}

/** 忠诚取值：存档值优先，其次 generals.json 的 LOYAL，最后 90（原作 0x42D47A） */
export function loyalOf(save, name, row) {
  const v = normalizeMap(save?.loyal)[name];
  if (Number.isFinite(Number(v))) return clamp(v, 0, DRIFT.LOYAL_MAX);
  const l = Number(row?.LOYAL ?? row?.loyal);
  if (Number.isFinite(l) && l > 0) return clamp(l, 0, DRIFT.LOYAL_MAX);
  return GENERAL_INIT.loyal;
}

function normalizeMap(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw)) {
    const n = Number(raw[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function officerNames(officersByCity) {
  const out = [];
  const seen = new Set();
  const lists = officersByCity && typeof officersByCity === 'object' ? officersByCity : {};
  for (const key of Object.keys(lists)) {
    const list = Array.isArray(lists[key]) ? lists[key] : [];
    for (const o of list) {
      const name = typeof o === 'string' ? o : str(o?.name);
      if (!name || seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// §9 月报（0x40BECB 的整段输出）
// ---------------------------------------------------------------------------
/** 一个月的 AI 报告 → 文本（`君主:%s` + 每个动作一行 + 四段计数） */
export function describeReports(reports, opts = {}) {
  const list = Array.isArray(reports) ? reports : [];
  const lines = [];
  for (const r of list) {
    if (!r || !r.force) continue;
    lines.push(`君主:${r.force}`);
    const st = r.stages || {};
    lines.push(`  規劃 內政${num(st.domestic)} 徵兵${num(st.recruit)} 攻城${num(st.attack)} 調將${num(st.move)} → 候選${tableSize(r.table)}`);
    if (r.chosen) lines.push(`  ${describeCandidate(opts.world || {}, r.chosen)}`);
    else lines.push('  （無可執行行動，ArgMax 撞哨兵 800）');
    if (r.immediate && r.immediate.length) {
      lines.push(`  徵兵 ${r.immediate.map((x) => `${x.city}+${x.troops}`).join(' ')}`);
    }
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// §11 R73 多路 AI：planMonth（每月多类决策）+ R74 ACT 九项
// ---------------------------------------------------------------------------
/**
 * 这一节是「给 c1 的稳定接口」：`planMonth(save, cities, ctx) → Action[]`。
 * §5 的 planForceMonth / runMonth 继续保留（campaign.html 的 ?forceatk=1 与老测试在用），
 * 新接口把「规划」与「执行」拆成两步，规划**不碰** save/cities：
 *
 *   const acts = AI.planMonth(save, scenario.cities, { seed: save.month, adj, paths, forces });
 *   const res  = AI.executeMonth(world, acts, { rng: Math.random });
 *
 * 与 §5 的关系：本节的 actXxx 是 §5 四个规划器的**逐 ACT 提纯版**，额外产出
 *   · `kind`（attack/reinforce/... 见 KIND）——原作 ACT 表之外的中文分类，给战报用；
 *   · `reason`——决策依据（守军/城防/距离/兵力比/势力强弱），给 #logbox 与调试用；
 *   · `score`——同一 Rate 内的次级排序依据（[新设计]，不改 Rate 语义）。
 * Rate 硬常量一律沿用原值（攻玩家 200 / 攻 AI 100 / 占空城 80/(d+1) / 聯合 打玩家 200、打 AI 50）。
 */

/** 动作类别（Action.kind）。前 7 项是任务书要求的，cheat/none 是 ACT 表剩下的两项。 */
export const KIND = Object.freeze({
  ATTACK: 'attack',
  REINFORCE: 'reinforce',
  RECRUIT: 'recruit',
  DEVELOP: 'develop',
  SEARCH: 'search',
  DEFEND: 'defend',
  SUPPLY: 'supply',
  CHEAT: 'cheat',
  NONE: 'none',
});

export const ALL_KINDS = Object.freeze([
  KIND.ATTACK, KIND.REINFORCE, KIND.RECRUIT, KIND.DEVELOP, KIND.SEARCH,
  KIND.DEFEND, KIND.SUPPLY, KIND.CHEAT, KIND.NONE,
]);

export const KIND_NAMES = Object.freeze({
  attack: '攻擊',
  reinforce: '增援',
  recruit: '徵兵',
  develop: '開墾',
  search: '搜索',
  defend: '回防',
  supply: '補金',
  cheat: 'cheat',
  none: '不明',
});

/** ACT → kind。ACT 表 9 项里 4/5/7/8 全是「打出去」，3 是调将/增援，1/2 是钱，0/6 是空/调试。 */
export const ACT_KIND = Object.freeze({
  0: KIND.NONE,
  1: KIND.SUPPLY,
  2: KIND.DEFEND,
  3: KIND.REINFORCE,
  4: KIND.ATTACK,
  5: KIND.ATTACK,
  6: KIND.CHEAT,
  7: KIND.ATTACK,
  8: KIND.ATTACK,
});

/**
 * 每势力每月动作数默认值 = 1。
 * 硬依据：0x40D751 一个势力走一遍 → 0x40CC10 只返回一个下标 → 0x40D52F 执行一条。
 * （候选表里可以有很多条，但一个月只落一条。）ctx.maxPerForce 可覆盖（[新设计]）。
 */
export const MONTH_ACTION_MAX = 1;

/** 内政三命令的花费/增量：与玩家内政同价（web/city_model.js INCR，页面既有数值，非原作二进制）。 */
export const ACTION_COST = Object.freeze({
  DEVELOP_GOLD: COST.DEVELOP_GOLD,       // 400
  DEVELOP_POP: COST.DEVELOP_POP,         // 3000
  DEVELOP_DEF: 6,                        // city_model.js INCR.devDef
  DEVELOP_POP_CAP: 400000,               // city_model.js INCR.devPopCap
  DEVELOP_DEF_CAP: 999,                  // city_model.js INCR.devDefCap
  SEARCH_GOLD: 200,                      // city_model.js INCR.searchGold
  SEARCH_MAX_OFFICERS: 5,                // 城内 ≥5 将就不再搜索 [推测]（槽位未定位，取与 DISPATCH_MAX 同量级）
  RECRUIT_GOLD: COST.RECRUIT_GOLD,       // 500
  RECRUIT_TROOPS: COST.RECRUIT_TROOPS,   // 40
});

/** 本节新增的三个评分阶梯；都以「不得盖过打仗（攻 AI=100）」为约束反推。等级：[推测]。 */
export const KIND_RATE = Object.freeze({
  DEVELOP_MIN: 26,
  DEVELOP_MAX: 32,
  SEARCH_MIN: 18,
  SEARCH_MAX: 24,
  REINFORCE_MIN: RATE_BAND.MOVE_MIN,     // 24
  REINFORCE_MAX: RATE_BAND.MOVE_MAX,     // 28
});

/**
 * 显式种子 → () => [0,1)。
 * mulberry32：32 位状态，纯函数、无全局状态；同一 seed 必定同一序列（测试靠这个）。
 */
export function seedRng(seed) {
  let s = Math.trunc(num(seed)) >>> 0;
  return function next() {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 统一的 rng 取值：state.rand > world.rng > 常数 0（绝不退回 Math.random，保证纯） */
function randOf(state) {
  const s = state || {};
  if (typeof s.rand === 'function') return s.rand;
  const w = s.world || {};
  return typeof w.rng === 'function' ? w.rng : () => 0;
}

/** 城防 DEFENSE：只存在于剧本城市行（world.cities 里没有），没有就是 0 */
export function defenseOf(world, name) {
  const c = cityOf(world, name);
  if (!c) return 0;
  return Math.max(0, Math.trunc(num(c.DEFENSE ?? c.defense)));
}

function officerCount(world, name) {
  return officersOf(world, name).filter(isEmployed).length;
}

function officerTotal(world, name) {
  let t = 0;
  for (const g of officersOf(world, name)) t += officerPower(g);
  return t;
}

/** 城内选一个可调走的武将：优先非太守，其次第一个在职者 */
function pickOfficer(world, name) {
  const list = officersOf(world, name).filter(isEmployed);
  if (!list.length) return '';
  const major = str(cityOf(world, name)?.major);
  const hit = list.find((o) => str(o?.name) && str(o.name) !== major) || list[0];
  return str(hit?.name);
}

/** 贴着几座敌城（0 = 大后方） */
function threatCount(world, force, name) {
  const f = str(force);
  let n = 0;
  for (const nb of neighborsOf(world, name)) {
    const own = forceOf(world, nb);
    if (own && own !== f) n++;
  }
  return n;
}

/** 势力强弱一行字：城/兵/金（决策依据「势力强弱」的落地口径） */
function strengthText(world, force) {
  const list = citiesOf(world, force);
  let troops = 0;
  let gold = 0;
  for (const n of list) {
    troops += troopsOf(world, n);
    gold += num(cityOf(world, n)?.money);
  }
  return `${list.length} 城／${troops} 兵／${gold} 金`;
}

/**
 * 同一 Rate 内的次级排序依据（[新设计]）：出兵 ÷ 守方等效兵力，越高越值得打。
 * 等效兵力 = 守军 + 城防/4（城防换算成兵的量纲，纯经验系数）。
 */
function targetScore(world, src, dst, troops) {
  const wall = Math.trunc(defenseOf(world, dst) / 4);
  const defense = troopsOf(world, dst) + wall;
  return Math.trunc((Math.max(1, Math.trunc(num(troops))) * 100) / Math.max(1, defense + 1));
}

/** 统一构造 Action（见文件头 §11 的字段说明） */
function mkAction(p) {
  const cand0 = p || {};
  const act = intOr(cand0.act, 0, 0, 8);
  const cand = {
    act,
    actName: ACT_NAMES[act],
    from: str(cand0.from),
    to: str(cand0.to),
    a: num(cand0.a),
    b: num(cand0.b),
    c: num(cand0.c),
    rate: num(cand0.rate),
    joinCity: str(cand0.joinCity),
    note: str(cand0.note),
    kind: str(cand0.kind),
    reason: str(cand0.reason),
  };
  const action = {
    force: str(cand0.force),
    act,
    actName: ACT_NAMES[act],
    kind: str(cand0.kind) || ACT_KIND[act] || KIND.NONE,
    from: cand.from,
    to: cand.to,
    rate: cand.rate,
    score: Math.trunc(num(cand0.score)),
    reason: cand.reason,
    generals: Array.isArray(cand0.generals) ? cand0.generals.map(str).filter(Boolean) : [],
    cand,
  };
  if (str(cand0.sub)) action.sub = str(cand0.sub);
  if (cand.joinCity) action.joinCity = cand.joinCity;
  if (Math.trunc(num(cand0.troops)) > 0) action.troops = Math.trunc(num(cand0.troops));
  if (Math.trunc(num(cand0.gold)) > 0) action.gold = Math.trunc(num(cand0.gold));
  return action;
}

/**
 * 从「存档 + 城市元数据」搭一个 world（不写回）。
 *
 * save   : Saves 存档（用 save.cities[name].{owner,troops,money,pop,major,officers} + save.king）
 * cities : 剧本城市行数组（scenarios.json 的 cities，带 DEFENSE/POPULATION/FLAGS/RATE）、
 *          或 { 城名: 行 } 对象、或直接传 campaign.html 的 world.cities（此时缺 DEFENSE，靠 ctx.defenseOf）
 * ctx    : { playerId?, seed?, rand?, adj?, paths?, forces?, capOf?, limitOf?, distanceOf?,
 *            neighborsOf?, rules?, talentPool?, defenseOf? }
 *
 * 纯函数：不修改 save / cities，返回全新对象（officers 数组是浅拷贝）。
 */
export function prepareMonth(save, cities, ctx = {}) {
  const s = save && typeof save === 'object' ? save : {};
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const meta = new Map();
  if (Array.isArray(cities)) {
    for (const row of cities) if (row && typeof row.NAME === 'string') meta.set(row.NAME, row);
  } else if (cities && typeof cities === 'object') {
    for (const name of Object.keys(cities)) {
      const row = cities[name];
      if (row && typeof row === 'object') meta.set(name, row);
    }
  }
  const state = s.cities && typeof s.cities === 'object' ? s.cities : {};
  const owned = Array.isArray(s.owned) ? s.owned.map(str) : [];
  const playerId = str(c.playerId) || str(s.king);
  const names = [];
  const seen = new Set();
  for (const n of Object.keys(state)) if (!seen.has(n)) { seen.add(n); names.push(n); }
  for (const n of meta.keys()) if (!seen.has(n)) { seen.add(n); names.push(n); }

  const out = {};
  for (const name of names) {
    const m = meta.get(name) || {};
    const st = state[name] && typeof state[name] === 'object' ? state[name] : {};
    const owner = str(typeof c.ownerOf === 'function' ? c.ownerOf(name) : '')
      || str(st.owner) || str(m.owner) || str(m.KING)
      || (owned.includes(name) ? str(s.king) : '');
    const troops = st.troops !== undefined ? num(st.troops) : num(m.troops);
    const money = st.money !== undefined ? num(st.money) : num(m.money);
    const pop = st.pop !== undefined ? num(st.pop) : num(m.POPULATION ?? m.pop);
    out[name] = {
      owner,
      troops: Math.max(0, Math.trunc(troops)),
      money: Math.max(0, Math.trunc(money)),
      pop: Math.max(0, Math.trunc(pop)),
      flags: Math.max(0, Math.trunc(num(m.FLAGS ?? m.flags))),
      rate: Math.max(0, Math.trunc(num(m.RATE ?? m.rate))),
      major: str(st.major) || str(m.MAJOR) || str(m.major),
      officers: Array.isArray(st.officers) ? st.officers.slice()
        : (Array.isArray(m.officers) ? m.officers.slice() : []),
      DEFENSE: Math.max(0, Math.trunc(num(
        m.DEFENSE ?? m.defense ?? (typeof c.defenseOf === 'function' ? c.defenseOf(name) : 0),
      ))),
    };
  }

  const world = {
    playerId,
    cities: out,
    adj: c.adj ?? null,
    paths: Array.isArray(c.paths) ? c.paths : (Array.isArray(s.paths) ? s.paths : []),
    forces: c.forces ?? s.forces ?? {},
    rng: typeof c.rand === 'function' ? c.rand
      : (typeof c.rng === 'function' ? c.rng : seedRng(c.seed ?? s.seed ?? 0)),
    rules: c.rules || {},
    month: Math.max(0, Math.trunc(num(s.month))),
  };
  if (typeof c.capOf === 'function') world.capOf = c.capOf;
  if (typeof c.limitOf === 'function') world.limitOf = c.limitOf;
  if (typeof c.distanceOf === 'function') world.distanceOf = c.distanceOf;
  if (typeof c.neighborsOf === 'function') world.neighborsOf = c.neighborsOf;
  if (Array.isArray(c.talentPool)) world.talentPool = c.talentPool;
  return world;
}

// ── R74：ACT 九项，一 ACT 一函数 ──────────────────────────────────────────
// 每个函数签名统一为 `actXxx(state) => Action[]`，state = { world, force, rand?, rules? }；
// 返回的 Action 里 act = 该 ACT 的编号（R74 的落地），kind/reason 见 §11 开头。

/** ACT=0 不明：原作里这张表项没有生成点，永远返回空（保留函数是为了九项齐全可枚举） */
export function actNop() {
  return [];
}

/** ACT=1 補金：城内金 < max(3×武将数, 500) 时从本势力最富的城拨款（Rate 22..30，[推测]） */
export function actSupplyGold(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const cities = citiesOf(w, force);
  const push = (a) => out.push(a);

  for (const city of cities) {
    const c = cityOf(w, city);
    if (!c) continue;
    const count = officerCount(w, city);
    const need = Math.max(count * COST.SALARY_PER_OFFICER, COST.RECRUIT_GOLD);
    const money = num(c.money);
    if (money >= need) continue;
    const donor = cities
      .filter((n) => n !== city && num(cityOf(w, n)?.money) > need)
      .sort((a, b) => (num(cityOf(w, b)?.money) - num(cityOf(w, a)?.money)) || a.localeCompare(b))[0];
    if (!donor) continue;
    const amount = Math.min(num(cityOf(w, donor)?.money) - need, need - money);
    if (amount <= 0) continue;
    const rate = clamp(RATE_BAND.GOLD_MIN + Math.floor(amount / 200), RATE_BAND.GOLD_MIN, RATE_BAND.GOLD_MAX);
    push(mkAction({
      force, act: ACT.GOLD, kind: KIND.SUPPLY, from: donor, to: city,
      a: amount, b: 0, c: 0, rate, gold: amount, score: amount,
      reason: `補金：${city} 金 ${money} < 需要 ${need}（${count} 將 × ${COST.SALARY_PER_OFFICER} 俸祿，徵兵 ${COST.RECRUIT_GOLD}）`
        + `，從最富的 ${donor}（金 ${num(cityOf(w, donor)?.money)}）撥 ${amount} 金`
        + `；本勢力 ${strengthText(w, force)}；Rate ${rate}（22 + 缺口/200 夹 22..30，[推测]）`,
    }));
  }
  return out;
}

/** ACT=2 逃跑/回防：0 兵且邻敌 ≥30 兵 → 把城内金搬到最安全（邻敌少、兵多）的自家城 */
export function actFlee(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const cities = citiesOf(w, force);

  for (const city of cities) {
    if (troopsOf(w, city) !== 0) continue;
    const threat = neighborsOf(w, city).filter((n) => {
      const own = forceOf(w, n);
      return own && own !== force && troopsOf(w, n) >= 30;
    });
    if (!threat.length) continue;
    const gold = num(cityOf(w, city)?.money);
    if (gold <= 0) continue;                      // 没钱可搬 → 逃跑没有意义
    const refuge = cities
      .filter((n) => n !== city)
      .sort((a, b) => (threatCount(w, force, a) - threatCount(w, force, b))
        || (troopsOf(w, b) - troopsOf(w, a))
        || a.localeCompare(b))[0];
    if (!refuge) continue;
    out.push(mkAction({
      force, act: ACT.FLEE, kind: KIND.DEFEND, from: city, to: refuge,
      a: gold, b: 0, c: 0, rate: RATE_BAND.FLEE, gold, score: gold,
      reason: `回防／逃跑：${city} 0 兵、邻敵 ${threat.map((n) => `${n}(${forceOf(w, n)} ${troopsOf(w, n)} 兵)`).join('、')}`
        + ` ≥30，把 ${gold} 金撤往 ${refuge}（${troopsOf(w, refuge)} 兵、邻敵 ${threatCount(w, force, refuge)} 座）`
        + `；本勢力 ${strengthText(w, force)}；Rate ${RATE_BAND.FLEE}（逃跑 35，[推测]）`,
    }));
  }
  return out;
}

/** ACT=3 移動武將：①0 将城从 ≥2 将的城调 1 人；②前线缺兵时从大后方调 1 将 + 带兵增援 */
export function actMoveGeneral(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const cities = citiesOf(w, force);
  const donorOf = (to) => cities
    .filter((n) => n !== to && officerCount(w, n) >= 2)
    .sort((a, b) => (troopsOf(w, b) - troopsOf(w, a)) || a.localeCompare(b))[0];

  // ① 0 将城（0x40C34D 的最小语义：[推测]）
  for (const to of cities) {
    if (officerCount(w, to) !== 0) continue;
    const from = donorOf(to);
    if (!from) continue;
    const officer = pickOfficer(w, from);
    if (!officer) continue;
    const cap = capOf(w, to) || 1;
    const rate = clamp(
      RATE_BAND.MOVE_MIN + Math.floor(((cap - troopsOf(w, to)) / cap) * 4),
      RATE_BAND.MOVE_MIN, RATE_BAND.MOVE_MAX,
    );
    out.push(mkAction({
      force, act: ACT.MOVE_GENERAL, kind: KIND.REINFORCE, sub: 'officer', from, to,
      a: 1, b: 0, c: 0, rate, generals: [officer], score: 0,
      reason: `移動武將：${to} 0 將（兵 ${troopsOf(w, to)}/${cap}、邻敵 ${threatCount(w, force, to)} 座）`
        + `，從 ${from}（${officerCount(w, from)} 將、${troopsOf(w, from)} 兵）調 ${officer}`
        + `；Rate ${rate}（24 + 缺兵比×4 夹 24..28，[推测]）`,
    }));
  }

  // ② 前线缺兵：调将 + 带 1..5 单位兵（[新设计]，原作 ACT=3 只写「移動武將」）
  for (const to of cities) {
    if (officerCount(w, to) === 0) continue;
    if (threatCount(w, force, to) === 0) continue;
    const cap = capOf(w, to) || 1;
    const cur = troopsOf(w, to);
    if (cur >= Math.floor(cap * 0.6)) continue;
    const from = cities
      .filter((n) => n !== to && officerCount(w, n) >= 2 && threatCount(w, force, n) === 0
        && troopsOf(w, n) - 1 >= TROOP_UNIT)
      .sort((a, b) => (troopsOf(w, b) - troopsOf(w, a)) || a.localeCompare(b))[0];
    if (!from) continue;
    const deficit = cap - cur;
    const units = Math.min(
      DISPATCH_MAX,
      Math.max(1, Math.ceil(deficit / TROOP_UNIT)),
      Math.floor((troopsOf(w, from) - 1) / TROOP_UNIT),
    );
    if (units <= 0) continue;
    const officer = pickOfficer(w, from);
    if (!officer) continue;
    const troops = units * TROOP_UNIT;
    const rate = clamp(
      RATE_BAND.MOVE_MIN + Math.floor((deficit / cap) * 4),
      RATE_BAND.MOVE_MIN, RATE_BAND.MOVE_MAX,
    );
    out.push(mkAction({
      force, act: ACT.MOVE_GENERAL, kind: KIND.REINFORCE, sub: 'troops', from, to,
      a: 1, b: 0, c: 0, rate, troops, generals: [officer], score: troops,
      reason: `增援：前線 ${to} 兵 ${cur}/${cap}（缺口 ${deficit}、邻敵 ${threatCount(w, force, to)} 座）`
        + `，從後方 ${from}（${troopsOf(w, from)} 兵、${officerCount(w, from)} 將）調 ${officer} 帶 ${troops} 兵`
        + `；本勢力 ${strengthText(w, force)}；Rate ${rate}（[推测]）`,
    }));
  }
  return out;
}

/** ACT=4 攻擊player：Rate 硬常量 200（0xC8），出兵数走 0x40C635 */
export function actAttackPlayer(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out = [];
  if (!force || !playerId || force === playerId) return out;
  const rng = randOf(st);
  const power = strengthText(w, force);

  for (const src of citiesOf(w, force)) {
    if (!canDispatch(w, src)) continue;              // city+0x3C == 0 → 0x40CAF1 直接返回
    for (const dst of neighborsOf(w, src).slice(0, 9)) {
      if (forceOf(w, dst) !== playerId) continue;
      const n = dispatchTroops(w, src, dst, rng);
      if (n <= 0) continue;
      const troops = n * TROOP_UNIT;
      const wall = Math.trunc(defenseOf(w, dst) / 4);
      out.push(mkAction({
        force, act: ACT.ATTACK_PLAYER, kind: KIND.ATTACK, sub: 'player', from: src, to: dst,
        a: officerTotal(w, src), b: n, c: 0, rate: RATE.ATTACK_PLAYER,
        score: targetScore(w, src, dst, troops), troops, generals: [governorOf(w, src)],
        reason: `攻擊player：${src}（${troopsOf(w, src)} 兵／${officerCount(w, src)} 將）→ ${dst}`
          + `（守 ${troopsOf(w, dst)} 兵／城防 ${defenseOf(w, dst)}），兵力比 ${troops}:${troopsOf(w, dst) + wall}`
          + `；本勢力 ${power}；Rate ${RATE.ATTACK_PLAYER}（攻玩家硬常量 0xC8=200）`,
      }));
    }
  }
  return out;
}

/** ACT=5 攻擊ai：Rate 硬常量 100（0x64） */
export function actAttackAI(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out = [];
  if (!force) return out;
  const rng = randOf(st);
  const power = strengthText(w, force);

  for (const src of citiesOf(w, force)) {
    if (!canDispatch(w, src)) continue;
    for (const dst of neighborsOf(w, src).slice(0, 9)) {
      const owner = forceOf(w, dst);
      if (!owner || owner === force || owner === playerId) continue;
      const n = dispatchTroops(w, src, dst, rng);
      if (n <= 0) continue;
      const troops = n * TROOP_UNIT;
      const wall = Math.trunc(defenseOf(w, dst) / 4);
      out.push(mkAction({
        force, act: ACT.ATTACK_AI, kind: KIND.ATTACK, sub: 'ai', from: src, to: dst,
        a: officerTotal(w, src), b: n, c: 0, rate: RATE.ATTACK_AI,
        score: targetScore(w, src, dst, troops), troops, generals: [governorOf(w, src)],
        reason: `攻擊ai：${src}（${troopsOf(w, src)} 兵／${officerCount(w, src)} 將）→ ${dst}（${owner}，守 ${troopsOf(w, dst)} 兵／城防 ${defenseOf(w, dst)}）`
          + `，兵力比 ${troops}:${troopsOf(w, dst) + wall}；本勢力 ${power}`
          + `；Rate ${RATE.ATTACK_AI}（攻 AI 硬常量 0x64=100）`,
      }));
    }
  }
  return out;
}

/**
 * ACT=7 聯合：目标城另有本势力一座邻城 nb（≠src），两城可投入上限之和 ≥ 本次出兵数
 * → 两城对半分兵（0x40C8EC）。Rate：打玩家 200、打 AI 50。
 * 每个 (src,dst) 只取第一座可联合的 nb（[推测]：原作会为每个 nb 各 push 一条，落地等价）。
 */
export function actJoin(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out = [];
  if (!force) return out;
  const rng = randOf(st);
  const power = strengthText(w, force);

  for (const src of citiesOf(w, force)) {
    if (!canDispatch(w, src)) continue;
    for (const dst of neighborsOf(w, src).slice(0, 9)) {
      const owner = forceOf(w, dst);
      if (!owner || owner === force) continue;
      const need = dispatchTroops(w, src, dst, rng);
      if (need <= 0) continue;
      const half = Math.floor(need / 2);
      let picked = null;
      for (const nb of neighborsOf(w, dst).slice(0, 9)) {
        if (nb === src) continue;
        if (forceOf(w, nb) !== force) continue;
        if (limitOf(w, src) + limitOf(w, nb) < need) continue;
        // 口径与 executeCandidate 一致：cand.b 从 from(src) 扣，cand.a 从 joinCity(nb) 扣
        const fromUnits = Math.min(half, DISPATCH_MAX, Math.max(0, troopsOf(w, src) - 1));
        const joinUnits = Math.min(need - half, DISPATCH_MAX, Math.max(0, troopsOf(w, nb) - 1));
        if (fromUnits <= 0 || joinUnits <= 0) continue;
        picked = { nb, fromUnits, joinUnits };
        break;
      }
      if (!picked) continue;
      const troops = (picked.fromUnits + picked.joinUnits) * TROOP_UNIT;
      const rate = owner === playerId ? RATE.JOIN_PLAYER : RATE.JOIN_AI;
      out.push(mkAction({
        force, act: ACT.JOIN, kind: KIND.ATTACK, sub: 'join', from: src, to: dst,
        a: picked.joinUnits, b: picked.fromUnits, c: 0, rate, joinCity: picked.nb,
        score: targetScore(w, src, dst, troops), troops,
        generals: [governorOf(w, src), governorOf(w, picked.nb)],
        reason: `聯合：${src}（${troopsOf(w, src)} 兵）＋ ${picked.nb}（${troopsOf(w, picked.nb)} 兵）→ ${dst}`
          + `（${owner}，守 ${troopsOf(w, dst)} 兵／城防 ${defenseOf(w, dst)}），各出 ${picked.fromUnits * TROOP_UNIT}／${picked.joinUnits * TROOP_UNIT} 兵`
          + `；本勢力 ${power}；Rate ${rate}（${owner === playerId ? '聯合打玩家 0xC8=200' : '聯合打 AI 0x32=50'}）`,
      }));
    }
  }
  return out;
}

/** ACT=8 佔領空城：Rate = 80/(距离+1)，相邻空城 40（距离口径见 §0 ①，[推测]） */
export function actOccupyEmpty(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const rng = randOf(st);
  const power = strengthText(w, force);

  for (const src of citiesOf(w, force)) {
    if (!canDispatch(w, src)) continue;
    for (const dst of neighborsOf(w, src).slice(0, 9)) {
      if (forceOf(w, dst)) continue;
      const n = dispatchTroops(w, src, dst, rng);
      if (n <= 0) continue;
      const d = Math.max(1, Math.trunc(distanceOf(w, src, dst)));
      const rate = Math.floor(RATE.OCCUPY / (d + 1));
      const troops = n * TROOP_UNIT;
      out.push(mkAction({
        force, act: ACT.OCCUPY, kind: KIND.ATTACK, sub: 'occupy', from: src, to: dst,
        a: officerTotal(w, src), b: n, c: 0, rate,
        score: 100 - d, troops, generals: [governorOf(w, src)],
        reason: `佔領空城：${src}（${troopsOf(w, src)} 兵／${officerCount(w, src)} 將）→ ${dst}（空城、距离 ${d} 跳、城防 ${defenseOf(w, dst)}），出兵 ${troops}`
          + `；本勢力 ${power}；Rate ${rate}（80/(${d}+1)，0x50=80）`,
      }));
    }
  }
  return out;
}

/** 徵兵（ACT 表里没有，[推测]）：金 ≥500 且兵 < 上限 → 金 −500 兵 +40，Rate 33..35 */
export function actRecruit(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const gold = ACTION_COST.RECRUIT_GOLD;

  for (const city of citiesOf(w, force)) {
    const c = cityOf(w, city);
    if (!c) continue;
    const money = num(c.money);
    if (money < gold) continue;
    const cur = troopsOf(w, city);
    const cap = capOf(w, city);
    if (cur >= cap) continue;
    const add = Math.min(ACTION_COST.RECRUIT_TROOPS, cap - cur);
    if (add <= 0) continue;
    const rate = clamp(
      RATE_BAND.RECRUIT_MIN + Math.floor(((cap - cur) / Math.max(1, cap)) * 2),
      RATE_BAND.RECRUIT_MIN, RATE_BAND.RECRUIT_MAX,
    );
    out.push(mkAction({
      force, act: ACT.NONE, kind: KIND.RECRUIT, from: city, to: city,
      a: gold, b: add, c: 0, rate, gold, troops: add, score: add,
      reason: `徵兵：${city} 兵 ${cur}/${cap}（缺口 ${cap - cur}）、金 ${money} ≥ ${gold} → 金 −${gold} 兵 +${add}`
        + `；本勢力 ${strengthText(w, force)}；Rate ${rate}（33 + 缺兵比×2 夹 33..35，[推测]）`,
    }));
  }
  return out;
}

/** 開墾（ACT 表里没有，[推测]）：不挨敌的城、金 ≥400 → 金 −400 人口 +3000 防禦 +6，Rate 26..32 */
export function actDevelop(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const gold = ACTION_COST.DEVELOP_GOLD;

  for (const city of citiesOf(w, force)) {
    const c = cityOf(w, city);
    if (!c) continue;
    if (threatCount(w, force, city) > 0) continue;          // 前线不打理内政 [推测]
    const money = num(c.money);
    if (money < gold) continue;
    const pop = num(c.pop);
    const wall = defenseOf(w, city);
    if (pop >= ACTION_COST.DEVELOP_POP_CAP && wall >= ACTION_COST.DEVELOP_DEF_CAP) continue;
    const rate = clamp(
      KIND_RATE.DEVELOP_MIN + Math.floor((money - gold) / 1000),
      KIND_RATE.DEVELOP_MIN, KIND_RATE.DEVELOP_MAX,
    );
    out.push(mkAction({
      force, act: ACT.NONE, kind: KIND.DEVELOP, from: city, to: city,
      a: gold, b: ACTION_COST.DEVELOP_POP, c: 0, rate, gold, score: 0,
      reason: `開墾：${city} 邻敵 0 座、金 ${money} ≥ ${gold}、人口 ${pop}、城防 ${wall}`
        + ` → 金 −${gold} 人口 +${ACTION_COST.DEVELOP_POP} 防禦 +${ACTION_COST.DEVELOP_DEF}`
        + `（與玩家內政同價）；本勢力 ${strengthText(w, force)}；Rate ${rate}（[推测]）`,
    }));
  }
  return out;
}

/** 搜索（ACT 表里没有，[推测]）：不挨敌、金 ≥200、城内 <5 将 → 金 −200 找人才/宝物，Rate 18..24 */
export function actSearch(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out = [];
  if (!force) return out;
  const gold = ACTION_COST.SEARCH_GOLD;

  for (const city of citiesOf(w, force)) {
    const c = cityOf(w, city);
    if (!c) continue;
    if (threatCount(w, force, city) > 0) continue;
    const money = num(c.money);
    if (money < gold) continue;
    const count = officerCount(w, city);
    if (count >= ACTION_COST.SEARCH_MAX_OFFICERS) continue;
    const rate = clamp(
      KIND_RATE.SEARCH_MAX - count * 2,
      KIND_RATE.SEARCH_MIN, KIND_RATE.SEARCH_MAX,
    );
    out.push(mkAction({
      force, act: ACT.NONE, kind: KIND.SEARCH, from: city, to: city,
      a: gold, b: 0, c: 0, rate, gold, score: 0,
      reason: `搜索：${city} 邻敵 0 座、金 ${money} ≥ ${gold}、城內 ${count} 將 < ${ACTION_COST.SEARCH_MAX_OFFICERS}`
        + ` → 金 −${gold} 找人才／寶物；本勢力 ${strengthText(w, force)}；Rate ${rate}（18..24，[推测]）`,
    }));
  }
  return out;
}

/** ACT=6 cheat：只在 rules.cheat（调試）开着时产生，Rate 15（[推测]） */
export function actCheat(state) {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const rules = st.rules || w.rules || {};
  const out = [];
  if (!force || !rules.cheat) return out;
  const cities = citiesOf(w, force);
  if (!cities.length) return out;
  const gold = cities.reduce((sum, n) => sum + num(cityOf(w, n)?.money), 0);
  for (const city of cities) {
    if (!(gold < COST.RECRUIT_GOLD || (cities.length === 1 && troopsOf(w, city) < 20))) continue;
    out.push(mkAction({
      force, act: ACT.CHEAT, kind: KIND.CHEAT, from: city, to: city,
      a: COST.RECRUIT_GOLD, b: COST.RECRUIT_TROOPS, c: 0, rate: RATE_BAND.CHEAT,
      gold: COST.RECRUIT_GOLD, troops: COST.RECRUIT_TROOPS, score: 0,
      reason: `cheat（僅 rules.cheat＝true 的調試模式）：本勢力金 ${gold} < ${COST.RECRUIT_GOLD}`
        + ` → 金 +${COST.RECRUIT_GOLD} 兵 +${COST.RECRUIT_TROOPS}；Rate ${RATE_BAND.CHEAT}（0x40BFCE 内，分支未定位，[推测]）`,
    }));
  }
  return out;
}

/** ACT 值 → 生成函数（九项齐全，测试靠它做枚举断言） */
export const ACT_IMPL = Object.freeze({
  [ACT.NONE]: actNop,
  [ACT.GOLD]: actSupplyGold,
  [ACT.FLEE]: actFlee,
  [ACT.MOVE_GENERAL]: actMoveGeneral,
  [ACT.ATTACK_PLAYER]: actAttackPlayer,
  [ACT.ATTACK_AI]: actAttackAI,
  [ACT.CHEAT]: actCheat,
  [ACT.JOIN]: actJoin,
  [ACT.OCCUPY]: actOccupyEmpty,
});

/**
 * 一个势力的全部候选（十二个生成函数依次跑）。
 * 顺序不影响结果：`planMonth` 用 compareAction 做全序排序（Rate → act → score → 城名）。
 */
export function planForceActions(world, forceId, ctx = {}) {
  const w = world || {};
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const state = {
    world: w,
    force: str(forceId),
    rules: c.rules || w.rules || {},
    rand: typeof c.rand === 'function' ? c.rand : (typeof w.rng === 'function' ? w.rng : () => 0),
  };
  const acts = [];
  const take = (fn) => {
    const list = typeof fn === 'function' ? fn(state) : [];
    for (const a of Array.isArray(list) ? list : []) if (a && num(a.rate) > 0) acts.push(a);
  };
  take(actAttackPlayer);
  take(actAttackAI);
  take(actJoin);
  take(actOccupyEmpty);
  take(actFlee);
  take(actSupplyGold);
  take(actMoveGeneral);
  take(actRecruit);
  take(actDevelop);
  take(actSearch);
  take(actCheat);
  take(actNop);
  return acts;
}

/**
 * Action 全序比较：Rate 降序 → act 降序（并列取后出现，见 argMaxRate 的 [推测]）→ score 降序 → 城名升序。
 * 返回 -1/0/1（给 Array#sort 用）；对同一份输入是稳定的，不依赖 sort 的稳定性。
 */
export function compareAction(a, b) {
  const A = a || {};
  const B = b || {};
  const dr = num(B.rate) - num(A.rate);
  if (dr) return dr;
  const da = intOr(B.act, 0, 0, 8) - intOr(A.act, 0, 0, 8);
  if (da) return da;
  const ds = num(B.score) - num(A.score);
  if (ds) return ds;
  const ka = [str(A.from), str(A.to), str(A.joinCity), str(A.kind), str(A.generals?.[0])].join('\u0000');
  const kb = [str(B.from), str(B.to), str(B.joinCity), str(B.kind), str(B.generals?.[0])].join('\u0000');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

/**
 * R73 主入口：`planMonth(save, cities, ctx) => Action[]`。
 *
 * 决策树（每个 AI 势力各跑一遍，玩家势力跳过）：
 *   ① 12 个生成函数各出候选（ACT 1..8 + 徵兵/開墾/搜索），每条带 rate/score/reason
 *   ② compareAction 全序排序（Rate 大的胜；同 Rate 时 ACT 编号大的胜＝聯合压过单城进攻）
 *   ③ 只取前 maxPerForce 条（默认 1 —— 0x40D751 → 0x40CC10 → 0x40D52F 一个月一条）
 *
 * 纯：不修改 save / cities；随机只走 ctx.rand / world.rng（缺省是 seedRng(ctx.seed)）。
 * 同一 (save, cities, seed) → 逐字段相同的 Action[]。
 */
export function planMonth(save, cities, ctx = {}) {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const world = prepareMonth(save, cities, c);
  const maxPer = Math.max(1, Math.trunc(num(c.maxPerForce ?? c.maxActions) || MONTH_ACTION_MAX));
  const only = Array.isArray(c.forces) ? c.forces.map(str) : null;
  const onlyKind = Array.isArray(c.kinds) ? c.kinds.map(str) : null;
  const out = [];
  for (const forceId of forceOrder(world)) {
    if (forceId === world.playerId) continue;         // 玩家势力不跑 AI
    if (only && !only.includes(forceId)) continue;
    if (!citiesOf(world, forceId).length) continue;   // 已灭亡的势力
    let acts = planForceActions(world, forceId, c);
    // [新设计] ctx.kinds 白名单：默认不过滤（忠实原作 Rate 高者胜）；给调用方一个
    // 「内政月」「只搜人」之类的口子。真实剧本上攻AI=100 永远压过内政 18..35，
    // 没有这个口子 R73 的多路决策在实数据里一条都看不见（见 60 报告 §3.4）。
    if (onlyKind) acts = acts.filter((a) => onlyKind.includes(str(a.kind)));
    acts.sort(compareAction);
    for (let i = 0; i < acts.length && i < maxPer; i++) {
      acts[i].rank = i + 1;
      out.push(acts[i]);
    }
  }
  return out;
}

// ── 执行（0x40D52F）：planMonth 的 Action → 实际改动 world ────────────────
/** Action → 一行中文（不依赖 world；给 #logbox 与月报用） */
export function describePlan(action) {
  const a = action || {};
  const kind = str(a.kind);
  const force = str(a.force);
  const from = str(a.from);
  const to = str(a.to);
  const gold = num(a.gold);
  const troops = num(a.troops);
  const officer = str(a.officer) || str(Array.isArray(a.generals) ? a.generals[0] : '');
  const sub = str(a.sub);
  switch (kind) {
    case KIND.ATTACK:
      if (sub === 'player') return `${force} 攻 擊 player：${from} → ${to}（出兵 ${troops}）`;
      if (sub === 'ai') return `${force} 攻 擊 ai：${from} → ${to}（出兵 ${troops}）`;
      if (sub === 'join') return `${force} 聯 合：${from} + ${str(a.joinCity)} → ${to}（出兵 ${troops}）`;
      if (sub === 'occupy') return `${force} 佔 領 空 城：${from} → ${to}（出兵 ${troops}）`;
      return `${force} 攻擊：${from} → ${to}（出兵 ${troops}）`;
    case KIND.SUPPLY:
      return `${force} 補 金：${from} → ${to} ${gold} 金`;
    case KIND.DEFEND:
      return `${force} 逃 跑：${from} 撤往 ${to}（帶走 ${gold} 金）`;
    case KIND.REINFORCE:
      return `${force} 增 援：${from} → ${to}${officer ? `（${officer}）` : ''}${troops ? ` 兵 +${troops}` : ''}`;
    case KIND.RECRUIT:
      return `${force} 徵 兵：${from} 金 −${gold} 兵 +${troops}`;
    case KIND.DEVELOP:
      return `${force} 開 墾：${from} 金 −${gold} 人口 +${ACTION_COST.DEVELOP_POP}`;
    case KIND.SEARCH:
      return `${force} 搜 索：${from} 金 −${gold}`;
    case KIND.CHEAT:
      return `${force} cheat：${from} 金 +${gold} 兵 +${troops}`;
    default:
      return `${force} 不明：${from} → ${to}`;
  }
}

/** §6 的 describeCandidate 在「act=0 但有 kind」时改走这里（act 4/5/7/8 的旧文案一字不动） */
function describeKindCandidate(world, cand) {
  const v = {
    force: forceOf(world, str(cand?.from)) || str(cand?.force),
    kind: str(cand?.kind),
    from: str(cand?.from),
    to: str(cand?.to),
    gold: num(cand?.gold) || num(cand?.a),
    troops: num(cand?.troops) || num(cand?.b),
    joinCity: str(cand?.joinCity),
    officer: str(cand?.officer),
  };
  return `${v.force} ${KIND_NAMES[v.kind] || '不明'}：從${v.from}${troopsOf(world, v.from)}人 -> ${v.to}${troopsOf(world, v.to)}人`
    + `，金${v.gold} 兵${v.troops}，Rate=${num(cand?.rate)}`;
}

function describeKindAction(world, cand) {
  const v = {
    force: forceOf(world, str(cand?.from)) || str(cand?.force),
    kind: str(cand?.kind),
    from: str(cand?.from),
    to: str(cand?.to),
    gold: num(cand?.gold) || num(cand?.a),
    troops: num(cand?.troops) || num(cand?.b),
    joinCity: str(cand?.joinCity),
    officer: str(cand?.officer),
  };
  return describePlan(v);
}

/** ACT=3 的执行：先搬将，再搬兵（[新设计]：原作 ACT=3 只写「移動武將」） */
function executeReinforce(w, action, text, debug) {
  const from = str(action.from);
  const to = str(action.to);
  const src = cityOf(w, from);
  const dst = cityOf(w, to);
  const act = ACT.MOVE_GENERAL;
  if (!src || !dst) return { ok: false, reason: 'city-missing', kind: KIND.REINFORCE, act, text, debug };

  let officer = '';
  const want = str(Array.isArray(action.generals) ? action.generals[0] : '');
  if (want) {
    const list = Array.isArray(src.officers) ? src.officers : [];
    const idx = list.findIndex((o) => isEmployed(o) && str(o?.name) === want);
    if (idx >= 0) {
      const [g] = list.splice(idx, 1);
      if (!Array.isArray(dst.officers)) dst.officers = [];
      dst.officers.push(g);
      if (!str(dst.major)) dst.major = want;
      officer = want;
    }
  }
  const before = troopsOf(w, from);
  const move = Math.min(Math.max(0, Math.trunc(num(action.troops))), Math.max(0, before - 1));
  if (move > 0) {
    src.troops = before - move;
    dst.troops = troopsOf(w, to) + move;
  }
  if (!officer && move <= 0) return { ok: false, reason: 'nothing-moved', kind: KIND.REINFORCE, act, text, debug };
  return { ok: true, kind: 'domestic', type: KIND.REINFORCE, act, officer, troops: move, text, debug };
}

/**
 * 执行一条 Action（0x40D52F）。按 kind 分流：
 *   recruit/develop/search → 就地改 world.cities（金/兵/人口/武将）
 *   reinforce              → 搬将 + 搬兵
 *   其余（attack/supply/defend/cheat）→ 交给 §6 的 executeCandidate（ACT 语义完全一致）
 * 永远不抛；失败返回 { ok:false, reason }。
 */
export function executeAction(world, action, opts = {}) {
  const w = world || {};
  const a = action && typeof action === 'object' ? action : {};
  const cand = a.cand && typeof a.cand === 'object' ? a.cand : a;
  const kind = str(a.kind);
  const act = intOr(cand.act, 0, 0, 8);
  const text = describePlan(a);
  const debug = describeCandidate(w, cand);
  const fail = (reason) => ({ ok: false, reason, kind, act, text, debug });

  if (kind === KIND.RECRUIT) {
    const from = str(a.from);
    const c = cityOf(w, from);
    if (!c) return fail('city-missing');
    const gold = Math.max(0, Math.trunc(num(a.gold) || ACTION_COST.RECRUIT_GOLD));
    if (num(c.money) < gold) return fail('no-gold');
    const before = troopsOf(w, from);
    const cap = capOf(w, from);
    const add = Math.min(
      Math.max(0, Math.trunc(num(a.troops) || ACTION_COST.RECRUIT_TROOPS)),
      Math.max(0, cap - before),
    );
    if (add <= 0) return fail('troops-full');
    c.money = num(c.money) - gold;
    c.troops = before + add;
    return { ok: true, kind: 'domestic', type: kind, act, gold, troops: add, before, after: c.troops, text, debug };
  }

  if (kind === KIND.DEVELOP) {
    const from = str(a.from);
    const c = cityOf(w, from);
    if (!c) return fail('city-missing');
    const gold = Math.max(0, Math.trunc(num(a.gold) || ACTION_COST.DEVELOP_GOLD));
    if (num(c.money) < gold) return fail('no-gold');
    const popBefore = num(c.pop);
    if (popBefore >= ACTION_COST.DEVELOP_POP_CAP) return fail('pop-full');
    const addPop = Math.min(ACTION_COST.DEVELOP_POP, ACTION_COST.DEVELOP_POP_CAP - popBefore);
    c.money = num(c.money) - gold;
    c.pop = popBefore + addPop;
    let addDef = 0;
    // 城防字段只有剧本行有；world 里的城若带了就一并加，没带就只靠调用方回写
    if (c.DEFENSE !== undefined || c.defense !== undefined) {
      const key = c.DEFENSE !== undefined ? 'DEFENSE' : 'defense';
      const before = num(c[key]);
      addDef = Math.min(ACTION_COST.DEVELOP_DEF, Math.max(0, ACTION_COST.DEVELOP_DEF_CAP - before));
      c[key] = before + addDef;
    }
    return { ok: true, kind: 'domestic', type: kind, act, gold, pop: addPop, defense: addDef, text, debug };
  }

  if (kind === KIND.SEARCH) {
    const from = str(a.from);
    const c = cityOf(w, from);
    if (!c) return fail('city-missing');
    const gold = Math.max(0, Math.trunc(num(a.gold) || ACTION_COST.SEARCH_GOLD));
    if (num(c.money) < gold) return fail('no-gold');
    c.money = num(c.money) - gold;
    let found = '';
    const pool = Array.isArray(w.talentPool) ? w.talentPool : [];
    if (pool.length && officerCount(w, from) < ACTION_COST.SEARCH_MAX_OFFICERS) {
      const item = pool.shift();
      found = str(item?.name) || str(item);
      if (found) {
        if (!Array.isArray(c.officers)) c.officers = [];
        c.officers.push(item && typeof item === 'object'
          ? { ...item, name: found, status: str(item.status) || '登' }
          : { name: found, str: 0, int: 0, status: '登' });
        if (!str(c.major)) c.major = found;
      }
    }
    return { ok: true, kind: 'domestic', type: kind, act, gold, found, text, debug };
  }

  if (kind === KIND.REINFORCE) return executeReinforce(w, a, text, debug);

  return executeCandidate(w, cand, opts);
}

/** 把手搓的 Action 补成 executeCandidate 认得的候选形状 */
function actionToCandidate(a) {
  const act = intOr(a?.act, 0, 0, 8);
  return {
    act,
    actName: ACT_NAMES[act],
    from: str(a?.from),
    to: str(a?.to),
    a: num(a?.a),
    b: num(a?.b),
    c: num(a?.c),
    rate: num(a?.rate),
    joinCity: str(a?.joinCity),
    kind: str(a?.kind),
    reason: str(a?.reason),
  };
}

/**
 * 执行 planMonth 的整张动作清单，返回与 §5 `runMonth` **同形**的 { reports, executed }：
 *   executed[i] = { force, cand, action, result }   ← campaign.html 只读 cand/result
 *   reports[i]  = { force, table, stages, immediate, chosen, action, result }
 * `immediate` 用本月的徵兵结果填充，老月报（「徵 兵 …」那行）不需要改。
 * 势力在同一个月里被灭掉 → 跳过它的后续动作（与 runMonth 的 `citiesOf().length` 判定一致）。
 */
export function executeMonth(world, actions, opts = {}) {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng
    : (typeof w.rng === 'function' ? w.rng : () => 0);
  const list = Array.isArray(actions) ? actions : [];
  const executed = [];
  const byForce = new Map();

  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const force = str(a.force);
    if (!force) continue;
    if (!citiesOf(w, force).length) continue;
    const cand = a.cand && typeof a.cand === 'object' ? a.cand : actionToCandidate(a);
    const result = executeAction(w, a, { rng });
    executed.push({ force, cand, action: a, result });
    if (!byForce.has(force)) byForce.set(force, { force, table: null, stages: { domestic: 0, recruit: 0, attack: 0, join: 0, move: 0 }, immediate: [], actions: [], results: [] });
    const rec = byForce.get(force);
    rec.actions.push(a);
    rec.results.push(result);
    if (str(a.kind) === KIND.RECRUIT && result.ok) {
      rec.immediate.push({ city: str(a.from), gold: num(a.gold), troops: num(result.troops), before: num(result.before), after: num(result.after) });
    }
  }

  const reports = [];
  for (const rec of byForce.values()) {
    const countKind = (k) => rec.actions.filter((x) => str(x.kind) === k).length;
    const stages = {
      domestic: countKind(KIND.SUPPLY) + countKind(KIND.DEFEND) + countKind(KIND.CHEAT) + countKind(KIND.DEVELOP) + countKind(KIND.SEARCH),
      recruit: countKind(KIND.RECRUIT),
      attack: countKind(KIND.ATTACK),
      join: rec.actions.filter((x) => str(x.sub) === 'join').length,
      move: countKind(KIND.REINFORCE),
    };
    const last = rec.actions[rec.actions.length - 1] || null;
    reports.push({
      force: rec.force,
      table: rec.table,
      stages,
      immediate: rec.immediate,
      chosen: last && last.cand ? last.cand : null,
      action: last,
      result: rec.results[rec.results.length - 1] || null,
    });
  }
  return { reports, executed };
}
