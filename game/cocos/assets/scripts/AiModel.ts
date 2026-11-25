/**
 * AiModel.ts — 大地图 AI 的**纯逻辑**（Cocos/微信版，逐函数移植自 `game/web/ai_model.js`）。
 *
 * 移植原则（与 `work/cocos_ai84/parity.mjs` 的对拍口径一致）：
 *   · **同名导出**：web 侧 `export function/const` 的名字一个不改，签名只加类型；
 *   · **同算法**：函数体逐行对应，连 `|| 0`、`Math.trunc`、`Math.round`、`>=` 的并列取后者
 *     这类细节都不动；随机只走**显式注入的 rng**，同 seed 必定同结果；
 *   · **零宿主依赖**：不 import `cc`、不碰 DOM/window/localStorage/Date.now/Math.random
 *     （唯一例外是几个函数的默认参数 `= Math.random`，与 web 版一致，调用方一律显式传 rng）。
 *
 * 世界（world）是纯数据对象，字段一一对应原作结构体，见 §0。
 * 原作依据与「原文冲突」的标注沿用 web 版（`[推测]`/`[新设计]`），未在本文件重新判断。
 *
 * ── 移植时保留的关键语义（改任何一条都会破坏对拍）─────────────────────────
 *   ① `argMaxRate` 并列取**后出现**（`>=`），哨兵 800 → 下标 = rows.length（无行动）；
 *   ② `compareAction` 的全序：Rate↓ → act↓ → score↓ → (from,to,joinCity,kind,generals[0])↑；
 *   ③ `planForceActions` 的 take 顺序：攻玩家/攻AI/聯合/佔空城/逃跑/補金/調將/徵兵/開墾/搜索/cheat/不明，
 *      且只收 `rate > 0` 的候选（顺序不影响排序结果，但影响同分时的稳定输出）；
 *   ④ `executeMonth` 按传入顺序执行，同势力只留最后一条进 reports；
 *   ⑤ `resolveBattle` 的 `Number(rng()) < p`、`Math.max(1, Math.round(x * (1-p)))`；
 *   ⑥ `monthlyDrift` 的忠诚阈值看**漂移后**的士气；
 *   ⑦ `prepareMonth` 的字段优先级：save 运行态 > 剧本行，owner 还要多一层 owned→king 兜底。
 */

// ---------------------------------------------------------------------------
// §0 类型：world / save / 候选 / 动作 / 执行结果
// ---------------------------------------------------------------------------

/** 随机源：返回 [0,1)。一律显式注入。 */
export type AiRng = () => number;

/** 城内武将（garrison.json 的 Officer / campaign.html buildWorld 的 officers 行） */
export interface AiOfficer {
  name?: string;
  str?: number;
  int?: number;
  status?: string | number;
  loyal?: number;
  /** 原作字段别名（部分表用大写） */
  STR?: number;
  INT?: number;
  STATUS?: string | number;
  LOYAL?: number | string;
  NAME?: string;
}

/** 一座城的运行态（world.cities[name]） */
export interface AiCity {
  /** city+0x10 所属势力 id；'' = 空城/无主 */
  owner?: string;
  /** city+0x30 城内总兵数 */
  troops?: number;
  /** city+0x92 城内金钱 */
  money?: number;
  /** city+0x8A 人口 */
  pop?: number;
  /** city+0x9E FLAGS（1 = 关卡，不可通行） */
  flags?: number;
  /** city+0x6C 城规模 1..5 */
  rate?: number;
  /** city+0x14 太守名 */
  major?: string;
  /** city+0x24 城内武将链 */
  officers?: AiOfficer[];
  /** 城防（只有剧本城市行有） */
  DEFENSE?: number;
  defense?: number;
}

/** 剧本 PATH 表的一行 */
export interface AiPath {
  Start?: string;
  End?: string;
  Length?: number;
}

/** 势力表的一行 */
export interface AiForce {
  id?: string;
  king?: string;
  flag?: number;
  alive?: boolean;
  cities?: string[];
  ts?: number;
  [key: string]: unknown;
}

/** AI 规则开关 */
export interface AiRules {
  cheat?: boolean;
  [key: string]: unknown;
}

/** 世界（纯数据；可选回调由宿主注入，缺省走内置口径） */
export interface AiWorld {
  /** 玩家势力 id（原作 [0x4A64F0]） */
  playerId?: string;
  cities?: Record<string, AiCity>;
  adj?: unknown;
  paths?: AiPath[];
  forces?: Record<string, AiForce>;
  rng?: AiRng;
  rules?: AiRules;
  month?: number;
  talentPool?: unknown[];
  forceOf?: (name: string) => unknown;
  troopsOf?: (name: string) => unknown;
  governorOf?: (name: string) => unknown;
  canDispatch?: (name: string) => unknown;
  officersOf?: (name: string) => unknown;
  neighborsOf?: (name: string) => unknown;
  distanceOf?: (a: string, b: string) => unknown;
  limitOf?: (name: string) => unknown;
  capOf?: (name: string) => unknown;
  [key: string]: unknown;
}

/** 存档（campaign.html / GameState.CampaignSave 的超集，字段全可选） */
export interface AiSave {
  king?: string;
  month?: number;
  seed?: number;
  owned?: string[];
  cities?: Record<string, AiCity>;
  forces?: Record<string, AiForce>;
  paths?: AiPath[];
  talentPool?: unknown[];
  tire?: Record<string, unknown>;
  morale?: Record<string, unknown>;
  loyal?: Record<string, unknown>;
}

/** 剧本城市行（scenarios.json 的 cities） */
export interface AiCityMeta {
  NAME?: string;
  KING?: string;
  MAJOR?: string;
  POPULATION?: number;
  DEFENSE?: number;
  MONEY?: number;
  RATE?: number;
  FLAGS?: number;
  troops?: number;
  money?: number;
  pop?: number;
  owner?: string;
  officers?: AiOfficer[];
  [key: string]: unknown;
}

/** planMonth 的 ctx（prepareMonth 也收同一份） */
export interface AiMonthCtx {
  playerId?: string;
  seed?: number;
  rand?: AiRng;
  rng?: AiRng;
  adj?: unknown;
  paths?: AiPath[];
  forces?: Record<string, AiForce> | string[];
  capOf?: (name: string) => unknown;
  limitOf?: (name: string) => unknown;
  distanceOf?: (a: string, b: string) => unknown;
  neighborsOf?: (name: string) => unknown;
  ownerOf?: (name: string) => unknown;
  defenseOf?: (name: string) => unknown;
  rules?: AiRules;
  talentPool?: unknown[];
  /** [新设计] 每势力每月动作数（默认 1） */
  maxPerForce?: number;
  maxActions?: number;
  /** [新设计] kind 白名单 */
  kinds?: string[];
  [key: string]: unknown;
}

/** 候选（0x4C32A0，stride 0x1C） */
export interface AiCandidate {
  act: number;
  actName: string;
  from: string;
  to: string;
  a?: number;
  b?: number;
  c?: number;
  rate?: number;
  joinCity?: string;
  note?: string;
  kind?: string;
  reason?: string;
  force?: string;
  gold?: number;
  troops?: number;
  officer?: string;
  score?: number;
  sub?: string;
  generals?: string[];
  rank?: number;
  [key: string]: unknown;
}

/** 候选表 */
export interface AiTable {
  limit: number;
  rows: AiCandidate[];
}

/** R74 的一路动作（planMonth 的产出单元） */
export interface AiAction extends AiCandidate {
  force: string;
  kind: string;
  score: number;
  reason: string;
  generals: string[];
  cand: AiCandidate;
}

/** actXxx(state) 的入参 */
export interface AiActState {
  world?: AiWorld;
  force?: string;
  rules?: AiRules;
  rand?: AiRng;
}

/** 执行结果（executeCandidate / executeAction / resolveBattle 共用） */
export interface AiExecResult {
  ok: boolean;
  reason?: string;
  act?: number;
  kind?: string;
  type?: string;
  debug?: string;
  text?: string;
  amount?: number;
  officer?: string;
  from?: string;
  to?: string;
  joinCity?: string;
  dispatch?: number;
  troops?: number;
  gold?: number;
  before?: number;
  after?: number;
  pop?: number;
  defense?: number;
  found?: string;
  attacker?: string;
  defender?: string;
  captured?: boolean;
  skipped?: boolean;
  empty?: boolean;
  atk?: number;
  def?: number;
  left?: number;
  oldMajor?: string;
  [key: string]: unknown;
}

/** 月报的一段计数 */
export interface AiStages {
  domestic: number;
  recruit: number;
  attack: number;
  join: number;
  move: number;
}

/** 月报一行（§5 runMonth 与 §11 executeMonth 的超集） */
export interface AiForceReport {
  force: string;
  table?: AiTable | null;
  stages?: AiStages;
  immediate?: Array<{ city: string; gold: number; troops: number; before: number; after: number }>;
  chosen?: AiCandidate | null;
  action?: AiAction | null;
  result?: AiExecResult | null;
  actions?: AiAction[];
  results?: AiExecResult[];
  [key: string]: unknown;
}

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
  NONE: 0,
  GOLD: 1,
  FLEE: 2,
  MOVE_GENERAL: 3,
  ATTACK_PLAYER: 4,
  ATTACK_AI: 5,
  CHEAT: 6,
  JOIN: 7,
  OCCUPY: 8,
});

/** 0x487248 的 9 个字符串（cp950 原文，顺序不能改） */
export const ACT_NAMES: readonly string[] = Object.freeze([
  '不明', '補金', '逃跑', '移動武將', '攻擊player', '攻擊ai', 'cheat', '聯合', '佔領空城',
]);

/** 9 项全表（顺序即 ACT 值） */
export const ALL_ACTS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 5, 6, 7, 8]);

/** Rate 权重表（R76），见 web 版注释的地址依据 */
export const RATE = Object.freeze({
  ATTACK_PLAYER: 200,
  ATTACK_AI: 100,
  OCCUPY: 80,
  JOIN_PLAYER: 200,
  JOIN_AI: 50,
  SENTINEL: 800,
});

/**
 * 内政类 Rate 阶梯（[推测]）。硬约束：< 100，且大体低于「相邻空城 40」。
 *   佔領空城(相邻) 40 > 徵兵 33..35 > 補金 22..30 > 移動武將 24..28 > 逃跑 35 > cheat 15
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

/** 出兵量纲换算（[新设计]）：候选里的 1..5 是原作单位，落地乘 20 人 */
export const TROOP_UNIT = 20;

/** 内政价目：与玩家内政同价 */
export const COST = Object.freeze({
  RECRUIT_GOLD: 500,
  RECRUIT_TROOPS: 40,
  SALARY_PER_OFFICER: 3,
  DEVELOP_GOLD: 400,
  DEVELOP_POP: 3000,
});

/** 月度漂移阈值（0x41B1BF） */
export const DRIFT = Object.freeze({
  TIRE_HIGH: 0x3c,
  SPIRIT_LOW: 0x46,
  SPIRIT_CRIT: 0x28,
  LOYAL_HIGH: 0x5a,
  TIRE_STEP: -1,
  SPIRIT_MAX: 100,
  LOYAL_MAX: 99,
});

/** 武将三项初值：士气 80 / 疲劳 0 / 忠诚 90（0x42D468/71/7A） */
export const GENERAL_INIT = Object.freeze({ spirit: 0x50, tire: 0, loyal: 0x5a });

// ---------------------------------------------------------------------------
// §2 小工具（一律不抛）
// ---------------------------------------------------------------------------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** 数值化；`''` / null / NaN 一律 0（与 saves.js num 同口径） */
const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** 整数化并夹到 [min, max]（与 saves.js intOr 同口径） */
const intOr = (v: unknown, fallback: number, min = -Infinity, max = Infinity): number => {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
};

const clamp = (v: unknown, lo: number, hi: number): number => Math.min(hi, Math.max(lo, num(v) || 0));

/** rng 取整：等同 C 的 `rand(k)`，返回 0..k-1 */
function roll(rng: AiRng | undefined, k: number): number {
  const r = typeof rng === 'function' ? Number(rng()) : 0;
  const f = Number.isFinite(r) ? Math.min(0.999999, Math.max(0, r)) : 0;
  return Math.floor(f * k);
}

function cityOf(world: AiWorld | null | undefined, name: string): AiCity | null {
  const c = world && world.cities ? world.cities[name] : null;
  return c && typeof c === 'object' ? c : null;
}

/** city+0x10 所属势力；'' = 空城 */
export function forceOf(world: AiWorld | null | undefined, name: string): string {
  const f = world?.forceOf;
  if (typeof f === 'function') return str(f(name));
  return str(cityOf(world, name)?.owner);
}

/** city+0x30 城内总兵数 */
export function troopsOf(world: AiWorld | null | undefined, name: string): number {
  const f = world?.troopsOf;
  if (typeof f === 'function') return Math.max(0, Math.trunc(num(f(name))));
  return Math.max(0, Math.trunc(num(cityOf(world, name)?.troops)));
}

/** city+0x14 太守；空城没有 → '' */
export function governorOf(world: AiWorld | null | undefined, name: string): string {
  const f = world?.governorOf;
  if (typeof f === 'function') return str(f(name));
  const c = cityOf(world, name);
  if (!c) return '';
  const m = str(c.major);
  if (m) return m;
  const list = Array.isArray(c.officers) ? c.officers : [];
  return list.length ? str(list[0]?.name) : '';
}

/** city+0x3C 可出兵标志 = 有守将且有兵（0x40CAF1 开头 `if (city->[0x3C]==0) return 0`） */
export function canDispatch(world: AiWorld | null | undefined, name: string): boolean {
  const f = world?.canDispatch;
  if (typeof f === 'function') return Boolean(f(name));
  return Boolean(governorOf(world, name)) && troopsOf(world, name) > 0;
}

/** city+0x24 城内武将链（原样返回数组，未给就是空数组） */
export function officersOf(world: AiWorld | null | undefined, name: string): AiOfficer[] {
  const f = world?.officersOf;
  if (typeof f === 'function') {
    const l = f(name);
    return Array.isArray(l) ? (l as AiOfficer[]) : [];
  }
  const c = cityOf(world, name);
  return Array.isArray(c?.officers) ? c.officers : [];
}

/**
 * 0x4054B9：取城的可通行邻城。跳过 `FLAGS==1` 的关卡。
 * 三个来源依次尝试：world.neighborsOf → world.adj（Map 或普通对象）→ world.paths 反推。
 */
export function neighborsOf(world: AiWorld | null | undefined, name: string): string[] {
  const w = world || {};
  let out: string[] = [];
  const cb = w.neighborsOf;
  if (typeof cb === 'function') {
    const l = cb(name);
    out = Array.isArray(l) ? (l as string[]) : [];
  } else if (w.adj) {
    const adj = w.adj as { get?: (k: string) => unknown; [k: string]: unknown };
    if (typeof adj.get === 'function') out = Array.from((adj.get(name) as Iterable<string>) || []);
    else if (Array.isArray(adj[name])) out = adj[name] as string[];
    else if (adj[name] instanceof Set) out = Array.from(adj[name] as Set<string>);
  }
  if (!out.length && Array.isArray(w.paths)) out = neighborsFromPaths(w.paths, name);
  const seen = new Set<string>();
  return out.filter((n) => {
    if (typeof n !== 'string' || !n || n === name || seen.has(n)) return false;
    seen.add(n);
    return num(cityOf(w, n)?.flags) !== 1;   // 關卡不可通行
  });
}

/** 从 PATH 表反推邻城；Length>=30000 是「画了线但不可走」的哨兵 */
export function neighborsFromPaths(paths: AiPath[] | null | undefined, name: string): string[] {
  const out: string[] = [];
  // for-of 的头不能是三元/逻辑表达式：Creator 的 Babel(plugin-transform-for-of) 会在类型推断处崩
  // （`Property types[1] of TSUnionType expected node to be of a type ["TSType"]`）。先落常量。
  const rows: AiPath[] = Array.isArray(paths) ? paths : [];
  for (const p of rows) {
    if (!p) continue;
    if (num(p.Length) >= 30000) continue;
    if (p.Start === name && typeof p.End === 'string') out.push(p.End);
    else if (p.End === name && typeof p.Start === 'string') out.push(p.Start);
  }
  return out;
}

/** 两城之间的 PATH Length；没有直接路 → NaN（调用方自行回落） */
export function pathLength(world: AiWorld | null | undefined, a: string, b: string): number {
  // 同上：三元作 for-of 头会让 Creator 的 Babel 崩，先落常量。
  const rows: AiPath[] = Array.isArray(world?.paths) ? world.paths : [];
  for (const p of rows) {
    if (!p || num(p.Length) >= 30000) continue;
    if ((p.Start === a && p.End === b) || (p.Start === b && p.End === a)) return num(p.Length);
  }
  return NaN;
}

/**
 * 占空城的「距离代价」d（RATE.OCCUPY/(d+1) 里的 d）。
 * 优先 world.distanceOf；否则按邻接表算跳数（相邻=1）。见文件头 ① 的冲突说明。
 */
export function distanceOf(world: AiWorld | null | undefined, a: string, b: string): number {
  const w = world || {};
  const cb = w.distanceOf;
  if (typeof cb === 'function') return Math.max(0, num(cb(a, b)));
  if (a === b) return 0;
  const seen = new Set<string>([a]);
  let frontier = [a];
  for (let d = 1; d <= 9; d++) {
    const next: string[] = [];
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

/** 0x40C511 可投入兵力上限；未定位 → 默认不设限（Infinity） */
export function limitOf(world: AiWorld | null | undefined, name: string): number {
  const cb = world?.limitOf;
  if (typeof cb === 'function') return Math.max(0, num(cb(name)));
  return Infinity;
}

/** 城内兵上限：min(人口/2500+110, 600)，与 saves.cityTroops 同口径 */
export function capOf(world: AiWorld | null | undefined, name: string): number {
  const cb = world?.capOf;
  if (typeof cb === 'function') return Math.max(0, Math.trunc(num(cb(name))));
  const c = cityOf(world, name);
  return Math.min(Math.floor(num(c?.pop) / 2500) + 110, 600);
}

/**
 * 势力名下所有城（king+0x338 城链）。
 * 原作里归属的**权威**是城上的 city+0x10，城链只是派生索引；先扫 owner，扫不到才退回城链。
 */
export function citiesOf(world: AiWorld | null | undefined, forceId: string): string[] {
  const id = str(forceId);
  if (!id) return [];
  const cities = world?.cities;
  if (cities && typeof cities === 'object' && Object.keys(cities).length) {
    const out: string[] = [];
    for (const name of Object.keys(cities)) if (str(cities[name]?.owner) === id) out.push(name);
    return out;
  }
  const f = world?.forces ? world.forces[id] : null;
  if (f && Array.isArray(f.cities)) return f.cities.slice();
  return [];
}

/** 全体势力 id：城上出现过的 owner（按 cities 键顺序）+ forces 里登记的（已灭亡的也留着） */
export function forcesOf(world: AiWorld | null | undefined): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (id: unknown): void => {
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
export function forceOrder(world: AiWorld | null | undefined): string[] {
  return forcesOf(world);
}

// ---------------------------------------------------------------------------
// §3 候选表 + ArgMaxRate（R73 的骨架）
// ---------------------------------------------------------------------------

/** 空候选表：{ limit, rows } */
export function createTable(limit: number = MAX_CANDIDATES): AiTable {
  return { limit: Math.max(0, Math.trunc(num(limit)) || MAX_CANDIDATES), rows: [] };
}

/**
 * 写入一条候选（0x40BE2F 的等价物）。表满（≥64）返回 false。
 * 候选字段 ↔ 原作布局：act(+0x00) from(+0x04) to(+0x08) a(+0x0C) b(+0x10) c(+0x14) rate(+0x18)
 */
export function addCandidate(table: AiTable | null | undefined, cand: Record<string, unknown> | null | undefined): boolean {
  if (!table || !Array.isArray(table.rows)) return false;
  if (table.rows.length >= (num(table.limit) || MAX_CANDIDATES)) return false;
  const src = cand || {};
  const act = intOr(src.act, 0, 0, 8);
  table.rows.push({
    act,
    actName: ACT_NAMES[act] as string,
    from: str(src.from),
    to: str(src.to),
    a: num(src.a),
    b: num(src.b),
    c: num(src.c),
    rate: num(src.rate),
    // 以下非原作字段，只给执行/日志用
    joinCity: str(src.joinCity),
    note: str(src.note),
  });
  return true;
}

export function tableSize(table: AiTable | null | undefined): number {
  return Array.isArray(table?.rows) ? table.rows.length : 0;
}

/**
 * 0x40CC10：在 rate[0..n] 上取最大值的下标，其中 rate[n] = 0x320（哨兵 800）。
 * 并列取**后出现**的那条（`>=`，[推测]）。
 */
export function argMaxRate(table: AiTable | null | undefined): number {
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
export function pickCandidate(table: AiTable | null | undefined): AiCandidate | null {
  const i = argMaxRate(table);
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  return i >= rows.length ? null : rows[i];
}

// ---------------------------------------------------------------------------
// §4 R75 出兵数 + R76 评分（0x40C635）
// ---------------------------------------------------------------------------
/**
 * 0x40C635 出兵数（R75）：
 *   limit = 0x40C511(dst)
 *   if (dst->[+0x14] != 0) n = dst->[0x30] + rand(3) + 1;   // 有太守（非空城）
 *   else                    n = rand(2) + 1;                 // 空城只派 1..2
 *   n = min(n, limit); n = min(n, 5); n = min(n, src->[0x30] - 1)
 *   if (n == 0) return 0
 * 返回值是**原作量纲**的 1..5（落地换算见 TROOP_UNIT）。
 */
export function dispatchTroops(
  world: AiWorld | null | undefined,
  src: string,
  dst: string,
  rng: AiRng = Math.random,
): number {
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
export function scoreTarget(world: AiWorld | null | undefined, src: string, dst: string): { act: number; rate: number } {
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

/** 打下一座城「需要」多少兵：城内兵 + 1（[推测]） */
export function neededTroops(world: AiWorld | null | undefined, dst: string): number {
  return troopsOf(world, dst) + 1;
}

/** 0x40C47C 武将个人行动值；只用于日志/候选参数，**不参与评分**。[推测] */
export function officerPower(officer: AiOfficer | null | undefined): number {
  const o = officer || {};
  if (!isEmployed(o)) return 0;
  return Math.trunc(num(o.str ?? o.STR) + num(o.int ?? o.INT));
}

/** 在职判定：`g->[+0x91] & 1`（garrison.json 的 status："登"=在职，"野"=在野） */
export function isEmployed(officer: AiOfficer | null | undefined): boolean {
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
 *   · 補金 ACT=1：城内金 < max(3×武將數, 500) → 从自家最富的城拨款，Rate 22..30。
 *   · 逃跑 ACT=2：城内 0 兵且相邻有敌城 ≥30 兵 → 把城內金搬到後方自家城。
 *   · cheat ACT=6：仅 world.rules.cheat 开启时。
 */
export function planDomestic(
  world: AiWorld | null | undefined,
  forceId: string,
  table: AiTable,
  opts: { rules?: AiRules } = {},
): AiCandidate[] {
  const w = world || {};
  const rules = opts.rules || w.rules || {};
  const cities = citiesOf(w, forceId);
  const added: AiCandidate[] = [];
  const push = (cand: Record<string, unknown>): void => {
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

export interface AiRecruitRow {
  city: string;
  gold: number;
  troops: number;
  before: number;
  after: number;
}

/**
 * PlanRecruit（0x40C1E4）：**即时徵兵**，不产生候选（ACT 表 9 项里没有「徵兵」）。
 * 规则：城内金 ≥ 500 且兵 < 上限 → 金 −500、兵 +40（与玩家内政同价）。[推测]
 */
export function planRecruit(world: AiWorld | null | undefined, forceId: string): AiRecruitRow[] {
  const w = world || {};
  const out: AiRecruitRow[] = [];
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
 *   ① `if (city->[0x3C]==0) return 0`
 *   ② 城内在职武将的 0x40C47C 合计 → 候选参数 a
 *   ③ 沿邻城槽（最多 9 个）：跳过同势力城 → 0x40C635 算出兵数 + 评分
 *   ④ 联合：目标城另有一座本势力城相邻，且两城可投入上限之和 ≥ 本次出兵数
 */
export function planAttack(
  world: AiWorld | null | undefined,
  forceId: string,
  table: AiTable,
  opts: { rng?: AiRng } = {},
): AiCandidate[] {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const added: AiCandidate[] = [];
  const push = (cand: Record<string, unknown>): void => {
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
      for (const row of planJoin(w, forceId, src, dst, n)) push(row as unknown as Record<string, unknown>);
    }
  }
  return added;
}

/**
 * 0x40C8EC 联合：目标城 dst 的邻城里有本势力的另一座城 nb（≠ src），
 * 且 limit(src) + limit(nb) >= 本次出兵数 → 两城对半分兵，记 ACT=7 候选。
 * Rate：打玩家 200、打其它 50。[推测]
 */
export function planJoin(
  world: AiWorld | null | undefined,
  forceId: string,
  src: string,
  dst: string,
  needed: number,
): AiCandidate[] {
  const w = world || {};
  const out: AiCandidate[] = [];
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
    out.push({ act: ACT.JOIN, actName: ACT_NAMES[ACT.JOIN] as string, from: src, to: dst, a, b, c: 0, rate, joinCity: nb });
  }
  return out;
}

/**
 * PlanMoveGeneral（0x40C34D，[推测]）：本势力有城武将 ≥2、且有城一个武将都没有 → 调 1 人过去。
 * Rate = 24 + (目标城兵缺/上限)*4，夹在 24..28。
 */
export function planMoveGeneral(
  world: AiWorld | null | undefined,
  forceId: string,
  table: AiTable,
): AiCandidate[] {
  const w = world || {};
  const added: AiCandidate[] = [];
  const cities = citiesOf(w, forceId);
  const push = (cand: Record<string, unknown>): void => {
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

/** planForceMonth 的返回（§5 的旧接口） */
export interface AiForceMonthPlan {
  force: string;
  table: AiTable;
  stages: AiStages;
  immediate: AiRecruitRow[];
  chosen: AiCandidate | null;
}

/**
 * 一个势力一个月的完整规划（0x40D751 的 0x40BE20 → 0x40CBB6 → 0x40CC10 三段）。
 * 四个规划器**按原作顺序**跑：内政 → 征兵（即时）→ 攻城 → 调将。
 */
export function planForceMonth(
  world: AiWorld | null | undefined,
  forceId: string,
  opts: { rng?: AiRng; rules?: AiRules } = {},
): AiForceMonthPlan {
  const w = world || {};
  const table = createTable();
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const rules = opts.rules || w.rules || {};
  planDomestic(w, forceId, table, { rules });
  const immediate = planRecruit(w, forceId);
  planAttack(w, forceId, table, { rng });
  planMoveGeneral(w, forceId, table);
  const count = (act: number): number => table.rows.filter((r) => r.act === act).length;
  const stage: AiStages = {
    domestic: count(ACT.GOLD) + count(ACT.FLEE) + count(ACT.CHEAT),
    recruit: immediate.length,
    attack: count(ACT.ATTACK_PLAYER) + count(ACT.ATTACK_AI) + count(ACT.OCCUPY) + count(ACT.JOIN),
    join: count(ACT.JOIN),
    move: count(ACT.MOVE_GENERAL),
  };
  return { force: str(forceId), table, stages: stage, immediate, chosen: pickCandidate(table) };
}

/** §5 的月报行 */
export interface AiRunMonthReport extends AiForceMonthPlan {
  result: AiExecResult | null;
}

/**
 * 全体势力跑一个月（AI 总入口 0x40D751）：玩家势力跳过，每个 AI 势力各挑一个动作执行。
 * 注意：**不**调 resolveBattle（打 AI 的结算由调用方做），与 web 版一致。
 */
export function runMonth(
  world: AiWorld | null | undefined,
  opts: { rng?: AiRng; playerId?: string; rules?: AiRules } = {},
): { reports: AiRunMonthReport[]; executed: Array<{ force: string; cand: AiCandidate; result: AiExecResult }> } {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng : (typeof w.rng === 'function' ? w.rng : Math.random);
  const playerId = str(opts.playerId !== undefined ? opts.playerId : w.playerId);
  const reports: AiRunMonthReport[] = [];
  const executed: Array<{ force: string; cand: AiCandidate; result: AiExecResult }> = [];
  for (const forceId of forceOrder(w)) {
    if (forceId === playerId) continue;
    if (!citiesOf(w, forceId).length) continue;
    const r = planForceMonth(w, forceId, { rng, rules: opts.rules });
    let result: AiExecResult | null = null;
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
export function describeCandidate(world: AiWorld | null | undefined, cand: AiCandidate | null | undefined): string {
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
export function describeAction(world: AiWorld | null | undefined, cand: AiCandidate | null | undefined): string {
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
export function executeCandidate(
  world: AiWorld | null | undefined,
  cand: AiCandidate | null | undefined,
  opts: { rng?: AiRng } = {},
): AiExecResult {
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
  const fail = (reason: string): AiExecResult => ({ ok: false, reason, act, debug, text });

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
 */
export function resolveBattle(
  world: AiWorld | null | undefined,
  info: AiExecResult | null | undefined,
  rng: AiRng = Math.random,
): AiExecResult {
  const w = world || {};
  const to = str(info?.to);
  const from = str(info?.from);
  const dst = cityOf(w, to);
  const src = cityOf(w, from);
  if (!dst || !src) return { ok: false, reason: 'city-missing' };
  // attacker 用「下命令时」记下的势力，因为同一月的结算可能在别的势力已经抢走源城之后才跑到这里；
  // defender 用「结算这一刻」的城主，不然君主会判错人。
  const attacker = str(info?.attacker) || forceOf(w, from);
  const defOwner = forceOf(w, to);
  const oldMajor = str(dst.major);
  const atk = Math.max(1, Math.trunc(num(info?.troops)));
  let def = troopsOf(w, to);
  // 计划时这座城还是别人的，结算时已经归自己了 → 不重复开战
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

/** 从「城 → 势力」映射建 forces 表；已存在的条目保留其 flag/ts，只刷新 cities/alive */
export function buildForces(save: AiSave | null | undefined, ownerMap: Record<string, unknown> = {}): Record<string, AiForce> {
  const s: AiSave = save && typeof save === 'object' ? save : {};
  const cities = s.cities && typeof s.cities === 'object' ? s.cities : {};
  if (!s.forces || typeof s.forces !== 'object' || Array.isArray(s.forces)) s.forces = {};
  const forces = s.forces as Record<string, AiForce>;
  const byForce = new Map<string, string[]>();
  for (const name of Object.keys(cities)) {
    const st = cities[name];
    if (!st || typeof st !== 'object') continue;
    if (!('owner' in st) || typeof st.owner !== 'string') {
      const fallback = typeof ownerMap[name] === 'string' ? (ownerMap[name] as string) : '';
      st.owner = fallback;
    }
    const id = str(st.owner);
    if (!id) continue;
    if (!byForce.has(id)) byForce.set(id, []);
    (byForce.get(id) as string[]).push(name);
  }
  for (const [id, list] of byForce) {
    const cur = forces[id];
    if (!cur || typeof cur !== 'object') {
      forces[id] = { id, king: id, flag: 0, alive: true, cities: list, ts: 0 };
    } else {
      cur.id = id;
      if (typeof cur.king !== 'string' || !cur.king) cur.king = id;
      cur.cities = list;
      if (cur.alive !== false || list.length) cur.alive = list.length > 0;
    }
  }
  // 已灭亡的势力：保留条目（供日志/UI 查），cities 清空
  for (const id of Object.keys(forces)) {
    const f = forces[id];
    if (!f || typeof f !== 'object') continue;
    if (!byForce.has(id)) {
      f.cities = [];
      if (f.alive !== false) f.alive = false;
    }
  }
  return forces;
}

/** 玩家 owned ↔ cities.owner 双向同步（main.js 只写 owned，所以读档/换月都要对齐一次） */
export function syncOwned(save: AiSave | null | undefined): string[] {
  const s: AiSave = save && typeof save === 'object' ? save : {};
  const king = str(s.king);
  const cities = s.cities && typeof s.cities === 'object' ? s.cities : {};
  const owned = Array.isArray(s.owned) ? s.owned.filter((n) => typeof n === 'string' && cities[n]) : [];
  const keep: string[] = [];
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

/** 势力摘要（给 UI / 测试） */
export function forceSummary(world: AiWorld | null | undefined): Array<{
  id: string; king: string; cities: number; troops: number; money: number; generals: number; alive: boolean;
}> {
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
 * 继任君主：同势力城内在职武将里 STR+INT 最高、且不是现任君主的那位。[推测]
 * 没有可继任者 → ''。
 */
export function successorOf(world: AiWorld | null | undefined, forceId: string): string {
  const w = world || {};
  const king = str(forceId);
  let best: string | null = null;
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

/** extinguishForce 的返回 */
export interface AiExtinguishResult {
  ok: boolean;
  extinguished: boolean;
  succeeded: boolean;
  newKing: string;
  inherited: Array<{ city: string; to: string }>;
  reason: string;
}

/**
 * 势力灭亡（R78）：城按「最近的其它势力」改嫁；找不到就把城变空城。
 * 默认**不繼承**；`opts.inherit === true` 才走「最强者继位」那条（[推测]，正式流程不开）。
 */
export function extinguishForce(
  world: AiWorld | null | undefined,
  forceId: string,
  opts: { inherit?: boolean } = {},
): AiExtinguishResult {
  const w = world || {};
  const id = str(forceId);
  const empty: AiExtinguishResult = { ok: false, extinguished: false, succeeded: false, newKing: '', inherited: [], reason: 'no-force' };
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
        // 必须 Array.from：Creator 的 Babel(loose) 会把 [...set] / [...map.values()]
        // 编成 [].concat(迭代器)，结果里只剩迭代器本身（项目里已踩过两次：units/物品页）。
        const mergedCities: string[] = (w.forces[heir].cities || []).concat(cities);
        w.forces[heir].cities = Array.from(new Set(mergedCities));
      }
      if (w.playerId === id) w.playerId = heir;
      return { ok: true, extinguished: false, succeeded: true, newKing: heir, inherited: cities.map((c) => ({ city: c, to: heir })), reason: 'inherit' };
    }
  }
  // 无继任 → 灭亡：城归最近的其它势力，找不到就变空城
  const inherited: Array<{ city: string; to: string }> = [];
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
  // 玩家自己的势力灭了：playerId 不能继续指着一个已灭亡的 id（'' = 已无势力）
  if (w.playerId === id) w.playerId = '';
  return { ok: true, extinguished: true, succeeded: false, newKing: '', inherited, reason: 'extinct' };
}

/** 离 name 最近的「非 exclude 势力」的城所属势力；没有 → ''（变空城） */
export function nearestForce(world: AiWorld | null | undefined, name: string, exclude: string): string {
  const w = world || {};
  const bad = str(exclude);
  const seen = new Set<string>([name]);
  let frontier = [name];
  for (let d = 0; d < 9; d++) {
    const next: string[] = [];
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

/** 君主阵亡/被俘的入口：`kings` 是「已死/被俘的君主名」集合。 */
export function applyKingDeaths(
  world: AiWorld | null | undefined,
  kings: string | string[] | null | undefined,
): Array<AiExtinguishResult & { force: string }> {
  const w = world || {};
  const list = Array.isArray(kings) ? kings : (kings ? [kings] : []);
  const out: Array<AiExtinguishResult & { force: string }> = [];
  for (const name of list) {
    const id = str(name);
    if (!id || !w.forces || !w.forces[id]) continue;
    if (w.forces[id].alive === false) continue;
    out.push({ force: id, ...extinguishForce(w, id) });
  }
  return out;
}

/** captureKingIn 的返回 */
export interface AiKingCapture {
  killed: boolean;
  force: string;
  heir: string;
  extinguished: boolean;
}

/**
 * 君主阵亡/被俘的触发点（R78）：攻陷一座城时调用。
 * 条件 = 破城的太守（city+0x14）正是原势力的君主本人（势力 id == 君主名）。条件是 [推测]。
 */
export function captureKingIn(
  world: AiWorld | null | undefined,
  cityName: string,
  opts: { major?: string; owner?: string; inherit?: boolean } = {},
): AiKingCapture {
  const w = world || {};
  const name = str(cityName);
  const none: AiKingCapture = { killed: false, force: '', heir: '', extinguished: false };
  if (!name || !w.forces) return none;
  // 破城后的太守会被改写成「攻方主将」，所以必须用调用方记下的「破城前太守」。
  const major = str(opts.major);
  if (!major) return none;
  // 太守得同时是「这座城原来的主人」。
  if (opts.owner === undefined) return none;
  const ownerForce = str(opts.owner);
  if (!ownerForce || ownerForce !== major) return none;
  const f = w.forces[major];
  if (!f || f.alive === false) return none;
  if (citiesOf(w, major).length === 0) return none;
  const res = extinguishForce(w, major, { inherit: opts.inherit === true });
  return { killed: true, force: major, heir: res.newKing, extinguished: res.extinguished };
}

/** 每月末的势力体检：城数为 0 的势力 → 灭亡（无城可继承，只标 alive=false）。 */
export function checkForceDeaths(world: AiWorld | null | undefined): string[] {
  const w = world || {};
  const out: string[] = [];
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
// §8 R65 月度漂移（0x41B1BF）
// ---------------------------------------------------------------------------
export interface AiDriftResult {
  tire: { down: number };
  spirit: { down: number; up: number; skipped: number };
  loyal: { down: number; up: number; skipped: number };
  names: number;
}

/**
 * 每月：疲劳 −1（下限 0）；
 *   · 疲劳 ≥ 60 → 士气 −1；否则 士气 < 70 → 士气 +1；
 *   · 士气 < 40 → 忠诚 −1；否则 忠诚 < 90 → 忠诚 +1（阈值看**漂移后**的士气）。
 */
export function monthlyDrift(
  save: AiSave | null | undefined,
  officersByCity: unknown,
  opts: {
    parts?: string;
    spiritMax?: number;
    loyalMax?: number;
    rowOf?: (name: string) => unknown;
  } = {},
): AiDriftResult {
  const s: AiSave = save && typeof save === 'object' ? save : {};
  const parts = String(opts.parts || 'tire,spirit,loyal');
  const on = (k: string): boolean => parts.includes(k);
  const spiritMax = num(opts.spiritMax ?? DRIFT.SPIRIT_MAX) || DRIFT.SPIRIT_MAX;
  const loyalMax = num(opts.loyalMax ?? DRIFT.LOYAL_MAX) || DRIFT.LOYAL_MAX;
  const rowOf = typeof opts.rowOf === 'function' ? opts.rowOf : (): unknown => null;
  const tire = normalizeMap(s.tire);
  const morale = normalizeMap(s.morale);
  const loyal = normalizeMap(s.loyal);
  const names = officerNames(officersByCity);
  const out: AiDriftResult = {
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
export function spiritOf(save: AiSave | null | undefined, name: string): number {
  const v = normalizeMap(save?.morale)[name];
  return clamp(v ?? GENERAL_INIT.spirit, 0, DRIFT.SPIRIT_MAX);
}

/** 忠诚取值：存档值优先，其次 generals.json 的 LOYAL，最后 90（原作 0x42D47A） */
export function loyalOf(save: AiSave | null | undefined, name: string, row?: unknown): number {
  const v = normalizeMap(save?.loyal)[name];
  if (Number.isFinite(Number(v))) return clamp(v, 0, DRIFT.LOYAL_MAX);
  const r = (row || {}) as { LOYAL?: unknown; loyal?: unknown };
  const l = Number(r.LOYAL ?? r.loyal);
  if (Number.isFinite(l) && l > 0) return clamp(l, 0, DRIFT.LOYAL_MAX);
  return GENERAL_INIT.loyal;
}

function normalizeMap(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const k of Object.keys(raw as Record<string, unknown>)) {
    const n = Number((raw as Record<string, unknown>)[k]);
    if (Number.isFinite(n)) out[k] = n;
  }
  return out;
}

function officerNames(officersByCity: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const lists = (officersByCity && typeof officersByCity === 'object' ? officersByCity : {}) as Record<string, unknown>;
  for (const key of Object.keys(lists)) {
    const list = Array.isArray(lists[key]) ? (lists[key] as unknown[]) : [];
    for (const o of list) {
      const name = typeof o === 'string' ? o : str((o as { name?: unknown } | null)?.name);
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
export function describeReports(reports: AiForceReport[] | null | undefined, opts: { world?: AiWorld } = {}): string {
  const list = Array.isArray(reports) ? reports : [];
  const lines: string[] = [];
  for (const r of list) {
    if (!r || !r.force) continue;
    lines.push(`君主:${r.force}`);
    const st = r.stages || ({} as Partial<AiStages>);
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

/** 动作类别（Action.kind）。 */
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
} as const);

export const ALL_KINDS: readonly string[] = Object.freeze([
  KIND.ATTACK, KIND.REINFORCE, KIND.RECRUIT, KIND.DEVELOP, KIND.SEARCH,
  KIND.DEFEND, KIND.SUPPLY, KIND.CHEAT, KIND.NONE,
]);

export const KIND_NAMES: Readonly<Record<string, string>> = Object.freeze({
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

/** ACT → kind。4/5/7/8 全是「打出去」，3 是调将/增援，1/2 是钱，0/6 是空/调试。 */
export const ACT_KIND: Readonly<Record<number, string>> = Object.freeze({
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

/** 每势力每月动作数默认值 = 1（0x40D751 → 0x40CC10 → 0x40D52F 一个月一条）。 */
export const MONTH_ACTION_MAX = 1;

/** 内政三命令的花费/增量：与玩家内政同价（web/city_model.js INCR）。 */
export const ACTION_COST = Object.freeze({
  DEVELOP_GOLD: COST.DEVELOP_GOLD,
  DEVELOP_POP: COST.DEVELOP_POP,
  DEVELOP_DEF: 6,
  DEVELOP_POP_CAP: 400000,
  DEVELOP_DEF_CAP: 999,
  SEARCH_GOLD: 200,
  SEARCH_MAX_OFFICERS: 5,
  RECRUIT_GOLD: COST.RECRUIT_GOLD,
  RECRUIT_TROOPS: COST.RECRUIT_TROOPS,
});

/** 本节新增的三个评分阶梯；都以「不得盖过打仗（攻 AI=100）」为约束反推。[推测] */
export const KIND_RATE = Object.freeze({
  DEVELOP_MIN: 26,
  DEVELOP_MAX: 32,
  SEARCH_MIN: 18,
  SEARCH_MAX: 24,
  REINFORCE_MIN: RATE_BAND.MOVE_MIN,
  REINFORCE_MAX: RATE_BAND.MOVE_MAX,
});

/**
 * 显式种子 → () => [0,1)。mulberry32：32 位状态，纯函数、无全局状态。
 */
export function seedRng(seed: unknown): AiRng {
  let s = Math.trunc(num(seed)) >>> 0;
  return function next(): number {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 统一的 rng 取值：state.rand > world.rng > 常数 0（绝不退回 Math.random，保证纯） */
function randOf(state: AiActState | null | undefined): AiRng {
  const s = state || {};
  if (typeof s.rand === 'function') return s.rand;
  const w = s.world || {};
  return typeof w.rng === 'function' ? w.rng : () => 0;
}

/** 城防 DEFENSE：只存在于剧本城市行（world.cities 里没有），没有就是 0 */
export function defenseOf(world: AiWorld | null | undefined, name: string): number {
  const c = cityOf(world, name);
  if (!c) return 0;
  return Math.max(0, Math.trunc(num(c.DEFENSE ?? c.defense)));
}

function officerCount(world: AiWorld | null | undefined, name: string): number {
  return officersOf(world, name).filter(isEmployed).length;
}

function officerTotal(world: AiWorld | null | undefined, name: string): number {
  let t = 0;
  for (const g of officersOf(world, name)) t += officerPower(g);
  return t;
}

/** 城内选一个可调走的武将：优先非太守，其次第一个在职者 */
function pickOfficer(world: AiWorld | null | undefined, name: string): string {
  const list = officersOf(world, name).filter(isEmployed);
  if (!list.length) return '';
  const major = str(cityOf(world, name)?.major);
  const hit = list.find((o) => str(o?.name) && str(o.name) !== major) || list[0];
  return str(hit?.name);
}

/** 贴着几座敌城（0 = 大后方） */
function threatCount(world: AiWorld | null | undefined, force: string, name: string): number {
  const f = str(force);
  let n = 0;
  for (const nb of neighborsOf(world, name)) {
    const own = forceOf(world, nb);
    if (own && own !== f) n++;
  }
  return n;
}

/** 势力强弱一行字：城/兵/金（决策依据「势力强弱」的落地口径） */
function strengthText(world: AiWorld | null | undefined, force: string): string {
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
 * 等效兵力 = 守军 + 城防/4。
 */
function targetScore(world: AiWorld | null | undefined, src: string, dst: string, troops: number): number {
  const wall = Math.trunc(defenseOf(world, dst) / 4);
  const defense = troopsOf(world, dst) + wall;
  return Math.trunc((Math.max(1, Math.trunc(num(troops))) * 100) / Math.max(1, defense + 1));
}

/** 统一构造 Action */
function mkAction(p?: Record<string, unknown> | null): AiAction {
  const cand0 = p || {};
  const act = intOr(cand0.act, 0, 0, 8);
  const cand: AiCandidate = {
    act,
    actName: ACT_NAMES[act] as string,
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
  const action: AiAction = {
    force: str(cand0.force),
    act,
    actName: ACT_NAMES[act] as string,
    kind: str(cand0.kind) || ACT_KIND[act] || KIND.NONE,
    from: cand.from,
    to: cand.to,
    rate: cand.rate,
    score: Math.trunc(num(cand0.score)),
    reason: str(cand0.reason),
    generals: Array.isArray(cand0.generals) ? (cand0.generals as unknown[]).map((x) => str(x)).filter(Boolean) : [],
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
 * 纯函数：不修改 save / cities，返回全新对象（officers 数组是浅拷贝）。
 */
export function prepareMonth(
  save: AiSave | null | undefined,
  cities: AiCityMeta[] | Record<string, AiCityMeta> | null | undefined,
  ctx: AiMonthCtx = {},
): AiWorld {
  const s: AiSave = save && typeof save === 'object' ? save : {};
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const meta = new Map<string, AiCityMeta>();
  if (Array.isArray(cities)) {
    for (const row of cities) {
      if (row && typeof row === 'object' && typeof (row as AiCityMeta).NAME === 'string') meta.set((row as AiCityMeta).NAME as string, row as AiCityMeta);
    }
  } else if (cities && typeof cities === 'object') {
    const table = cities as Record<string, AiCityMeta>;
    for (const name of Object.keys(table)) {
      const row = table[name];
      if (row && typeof row === 'object') meta.set(name, row);
    }
  }
  const state = s.cities && typeof s.cities === 'object' ? s.cities : {};
  const owned = Array.isArray(s.owned) ? s.owned.map((x) => str(x)) : [];
  const playerId = str(c.playerId) || str(s.king);
  const names: string[] = [];
  const seen = new Set<string>();
  for (const n of Object.keys(state)) if (!seen.has(n)) { seen.add(n); names.push(n); }
  for (const n of meta.keys()) if (!seen.has(n)) { seen.add(n); names.push(n); }

  const out: Record<string, AiCity> = {};
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

  const world: AiWorld = {
    playerId,
    cities: out,
    adj: c.adj ?? null,
    paths: Array.isArray(c.paths) ? c.paths : (Array.isArray(s.paths) ? s.paths : []),
    forces: (c.forces ?? s.forces ?? {}) as Record<string, AiForce>,
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
// 每个函数签名统一为 `actXxx(state) => Action[]`，state = { world, force, rand?, rules? }。

/** ACT=0 不明：原作里这张表项没有生成点，永远返回空 */
export function actNop(): AiAction[] {
  return [];
}

/** ACT=1 補金：城内金 < max(3×武将数, 500) 时从本势力最富的城拨款（Rate 22..30，[推测]） */
export function actSupplyGold(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
  if (!force) return out;
  const cities = citiesOf(w, force);
  const push = (a: AiAction): void => { out.push(a); };

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
export function actFlee(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
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
export function actMoveGeneral(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
  if (!force) return out;
  const cities = citiesOf(w, force);
  const donorOf = (to: string): string | undefined => cities
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
export function actAttackPlayer(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out: AiAction[] = [];
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
export function actAttackAI(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out: AiAction[] = [];
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
 * 每个 (src,dst) 只取第一座可联合的 nb（[推测]）。
 */
export function actJoin(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const playerId = str(w.playerId);
  const out: AiAction[] = [];
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
      let picked: { nb: string; fromUnits: number; joinUnits: number } | null = null;
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

/** ACT=8 佔領空城：Rate = 80/(距离+1)，相邻空城 40（距离口径见文件头 ①，[推测]） */
export function actOccupyEmpty(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
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
export function actRecruit(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
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
export function actDevelop(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
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
export function actSearch(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const out: AiAction[] = [];
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
export function actCheat(state?: AiActState | null): AiAction[] {
  const st = state || {};
  const w = st.world || {};
  const force = str(st.force);
  const rules = st.rules || w.rules || {};
  const out: AiAction[] = [];
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

/** ACT 值 → 生成函数（九项齐全） */
export const ACT_IMPL: Readonly<Record<number, (state?: AiActState | null) => AiAction[]>> = Object.freeze({
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

/** 一个势力的全部候选（十二个生成函数依次跑）。顺序不影响结果（全序排序）。 */
export function planForceActions(world: AiWorld | null | undefined, forceId: string, ctx: AiMonthCtx = {}): AiAction[] {
  const w = world || {};
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const state: AiActState = {
    world: w,
    force: str(forceId),
    rules: c.rules || w.rules || {},
    rand: typeof c.rand === 'function' ? c.rand : (typeof w.rng === 'function' ? w.rng : () => 0),
  };
  const acts: AiAction[] = [];
  const take = (fn: ((s?: AiActState | null) => AiAction[]) | undefined): void => {
    const list = typeof fn === 'function' ? fn(state) : [];
    const rows: AiAction[] = Array.isArray(list) ? list : [];
    for (const a of rows) if (a && num(a.rate) > 0) acts.push(a);
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
 * Action 全序比较：Rate 降序 → act 降序（并列取后出现）→ score 降序 → 城名升序。
 * 返回 -1/0/1；对同一份输入稳定，不依赖 sort 的稳定性。
 */
export function compareAction(a: AiAction | null | undefined, b: AiAction | null | undefined): number {
  const A = a || ({} as AiAction);
  const B = b || ({} as AiAction);
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
 *   ① 12 个生成函数各出候选（ACT 1..8 + 徵兵/開墾/搜索），每条带 rate/score/reason
 *   ② compareAction 全序排序（Rate 大的胜；同 Rate 时 ACT 编号大的胜＝聯合压过单城进攻）
 *   ③ 只取前 maxPerForce 条（默认 1）
 * 纯：不修改 save / cities；随机只走 ctx.rand / world.rng（缺省是 seedRng(ctx.seed)）。
 */
export function planMonth(
  save: AiSave | null | undefined,
  cities: AiCityMeta[] | Record<string, AiCityMeta> | null | undefined,
  ctx: AiMonthCtx = {},
): AiAction[] {
  const c = ctx && typeof ctx === 'object' ? ctx : {};
  const world = prepareMonth(save, cities, c);
  const maxPer = Math.max(1, Math.trunc(num(c.maxPerForce ?? c.maxActions) || MONTH_ACTION_MAX));
  const only = Array.isArray(c.forces) ? c.forces.map((x) => str(x)) : null;
  const onlyKind = Array.isArray(c.kinds) ? c.kinds.map((x) => str(x)) : null;
  const out: AiAction[] = [];
  for (const forceId of forceOrder(world)) {
    if (forceId === world.playerId) continue;         // 玩家势力不跑 AI
    if (only && !only.includes(forceId)) continue;
    if (!citiesOf(world, forceId).length) continue;   // 已灭亡的势力
    let acts = planForceActions(world, forceId, c);
    // [新设计] ctx.kinds 白名单：默认不过滤
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
export function describePlan(action: Partial<AiAction> | null | undefined): string {
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
function describeKindCandidate(world: AiWorld | null | undefined, cand: AiCandidate | null | undefined): string {
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

function describeKindAction(world: AiWorld | null | undefined, cand: AiCandidate | null | undefined): string {
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
  return describePlan(v as Partial<AiAction>);
}

/** ACT=3 的执行：先搬将，再搬兵（[新设计]：原作 ACT=3 只写「移動武將」） */
function executeReinforce(w: AiWorld, action: AiAction, text: string, debug: string): AiExecResult {
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
 *   其余（attack/supply/defend/cheat）→ 交给 §6 的 executeCandidate
 * 永远不抛；失败返回 { ok:false, reason }。
 */
export function executeAction(
  world: AiWorld | null | undefined,
  action: AiAction | null | undefined,
  opts: { rng?: AiRng } = {},
): AiExecResult {
  const w = world || {};
  const a = action && typeof action === 'object' ? action : ({} as AiAction);
  const cand = a.cand && typeof a.cand === 'object' ? a.cand : (a as unknown as AiCandidate);
  const kind = str(a.kind);
  const act = intOr(cand.act, 0, 0, 8);
  const text = describePlan(a);
  const debug = describeCandidate(w, cand);
  const fail = (reason: string): AiExecResult => ({ ok: false, reason, kind, act, text, debug });

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
      const key: 'DEFENSE' | 'defense' = c.DEFENSE !== undefined ? 'DEFENSE' : 'defense';
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
      const item = pool.shift() as unknown;
      found = str((item as { name?: unknown } | null)?.name) || str(item);
      if (found) {
        if (!Array.isArray(c.officers)) c.officers = [];
        c.officers.push(item && typeof item === 'object'
          ? { ...(item as AiOfficer), name: found, status: str((item as AiOfficer).status) || '登' }
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
function actionToCandidate(a: AiAction | null | undefined): AiCandidate {
  const act = intOr(a?.act, 0, 0, 8);
  return {
    act,
    actName: ACT_NAMES[act] as string,
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

/** executeMonth 的一行 */
export interface AiExecutedRow {
  force: string;
  cand: AiCandidate;
  action: AiAction;
  result: AiExecResult;
}

/**
 * 执行 planMonth 的整张动作清单，返回与 §5 `runMonth` **同形**的 { reports, executed }：
 *   executed[i] = { force, cand, action, result }
 *   reports[i]  = { force, table, stages, immediate, chosen, action, result }
 * `immediate` 用本月的徵兵结果填充。势力在同一个月里被灭掉 → 跳过它的后续动作。
 */
export function executeMonth(
  world: AiWorld | null | undefined,
  actions: AiAction[] | null | undefined,
  opts: { rng?: AiRng } = {},
): { reports: AiForceReport[]; executed: AiExecutedRow[] } {
  const w = world || {};
  const rng = typeof opts.rng === 'function' ? opts.rng
    : (typeof w.rng === 'function' ? w.rng : () => 0);
  const list = Array.isArray(actions) ? actions : [];
  const executed: AiExecutedRow[] = [];
  const byForce = new Map<string, {
    force: string;
    table: AiTable | null;
    stages: AiStages;
    immediate: Array<{ city: string; gold: number; troops: number; before: number; after: number }>;
    actions: AiAction[];
    results: AiExecResult[];
  }>();

  for (const a of list) {
    if (!a || typeof a !== 'object') continue;
    const force = str(a.force);
    if (!force) continue;
    if (!citiesOf(w, force).length) continue;
    const cand = a.cand && typeof a.cand === 'object' ? a.cand : actionToCandidate(a);
    const result = executeAction(w, a, { rng });
    executed.push({ force, cand, action: a, result });
    if (!byForce.has(force)) {
      byForce.set(force, {
        force, table: null, stages: { domestic: 0, recruit: 0, attack: 0, join: 0, move: 0 },
        immediate: [], actions: [], results: [],
      });
    }
    const rec = byForce.get(force) as NonNullable<ReturnType<typeof byForce.get>>;
    rec.actions.push(a);
    rec.results.push(result);
    if (str(a.kind) === KIND.RECRUIT && result.ok) {
      rec.immediate.push({ city: str(a.from), gold: num(a.gold), troops: num(result.troops), before: num(result.before), after: num(result.after) });
    }
  }

  const reports: AiForceReport[] = [];
  for (const rec of byForce.values()) {
    const countKind = (k: string): number => rec.actions.filter((x) => str(x.kind) === k).length;
    const stages: AiStages = {
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
