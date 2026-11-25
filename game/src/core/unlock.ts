/**
 * 兵种 / 阵形解锁 —— **两层**判定（原作 `SANGO.INI` 的武将表 + `[ITEM]`）。
 *
 * 第一层（主判定，原作真实机制）：**武将白名单**。
 *  - `generals[].UseForce`：该将当前可带兵种，单字缩写（`刀`/`槍`/`關`…）；
 *  - `generals[].Force`：全部可带兵种，含还没学会的；
 *  - `generals[].BattleArray`：已学阵形缩写；`UseBattleArray`：当前使用的那一个。
 *  出兵界面能选哪些兵种/阵形，先看这个人的白名单。
 *
 * 第二层（次判定）：**兵符 / 阵法书**，用位掩码"学会"某人不会的兵种。
 *  - 兵符：`TYPE === 'JEWEL_MISC' && Force > 0`，`Force` 是 `1 << 兵种号`；
 *  - 阵法书：`Battle > 0`，`Battle` 是 `1 << 阵形号`；
 *  - 判定只看 `ownedIds` 里有没有这个物品 id（全仓口径 `String(Sequence)`），不猜等级/数量/装备位。
 *
 * 缩写 ↔ 索引的权威来源（不是凭顺序猜的）：
 *  - `docs/05b_动画与造型目录.md` §4.1「兵种编号 1–13 ↔ 兵符 ↔ 群英2 可用兵种写法」整表；
 *  - `docs/03c-剧本武将城池TIMES.md` §7 交叉印证「13 个单字缩写 = 13 个兵种」；
 *  - 与 `game/data/troops.json` / `formations.json` 的 `names` 顺序逐项一致（`tests/unlock.test.ts` 对字校验）。
 *  注意缩写是繁体（`槍`/`圓`/`衝`），数据里的名字是简体（`长枪`/`圆形`/`冲锋`），所以下表的顺序即索引。
 */
import type { GameData, General, Item, Magic, Wise } from '../types.ts';

/** 兵种数（`troops.json` 13 行） */
export const TROOP_COUNT = 13;
/** 阵形数（`formations.json` 9 种） */
export const FORMATION_COUNT = 9;

/**
 * 兵种单字缩写，**下标即兵种号 0..12**（官方编号 1..13），逐项对应
 * `troops.json` 的 `names`：朴刀 / 长枪 / 大刀 / 弓箭 / 链锤 / 飞刀 / 武斗 / 蛮族 / 铁缒 / 藤甲 / 黄巾 / 弩兵 / 女兵。
 *
 * 特殊两项（docs/05b §4.1 原表注）：
 *  - `關` = 大刀（"關刀"简称；原作 400 将里只有 4 人可用：甘寧/典韋/顏良/曹彰）；
 *  - `賊` = 黄巾（黃巾賊）。
 * 其余是繁体缩写对简体名：槍→长枪、鍊→链锤、飛→飞刀、蠻→蛮族、鐵→铁缒、籐→藤甲。
 */
export const TROOP_TOKENS = ['刀', '槍', '關', '弓', '鍊', '飛', '武', '蠻', '鐵', '籐', '賊', '弩', '女'] as const;

/**
 * 阵形单字缩写，**下标即阵形号 0..8**，逐项对应 `formations.json` 的 `names`：
 * 方形 / 圆形 / 锥形 / 雁形 / 玄襄 / 鱼丽 / 钩形 / 冲锋 / 箭矢。
 */
export const FORMATION_TOKENS = ['方', '圓', '錐', '雁', '玄', '魚', '鉤', '衝', '箭'] as const;

/** 缩写 → 索引；未知返回 −1（不抛异常：脏数据不该炸存档/界面） */
export function troopIndexOf(token: string | null | undefined): number {
  if (typeof token !== 'string') return -1;
  const t = token.trim();
  return t === '' ? -1 : TROOP_TOKENS.indexOf(t as (typeof TROOP_TOKENS)[number]);
}

/** 阵形缩写 → 索引；未知返回 −1 */
export function formationIndexOf(token: string | null | undefined): number {
  if (typeof token !== 'string') return -1;
  const t = token.trim();
  return t === '' ? -1 : FORMATION_TOKENS.indexOf(t as (typeof FORMATION_TOKENS)[number]);
}

// ---------------------------------------------------------------------------
// 时代差异字段（R167）：generals.json 的 `*_by_times[5]`
// ---------------------------------------------------------------------------
//
// 原作 `TIMES1..5.INI` 里这 5 个字段会随剧本变（数据见 `generals.json`，生成器
// `work/data_audit/gen_generals_era.mjs`，审计表 `generals_era` 逐剧本 0 差异）：
//   BattleArray 379 将 / Force 381 / UseForce 27 / LoyalKing 70 / Weapon 1（袁術）。
// 单值字段仍表示 TIMES1；新字段 `[s]` 表示第 s 个剧本（0..4，与
// `data/levels_by_scenario.json`、`deploy.html` 的 `SCEN_IDX`、`campaign.html` 的
// `currentScenarioIdx()` 同口径）。读取一律「时代优先，回落单值」。

/** 有 `*_by_times` 时代数组的字段名 */
export type EraField = 'BattleArray' | 'Force' | 'UseForce' | 'LoyalKing' | 'Weapon';

/**
 * `eraFieldOf` 接受的武将行。`General` 结构可以直接传入（字段全可选），
 * 不往 `types.ts` 的 `General` 上加字段，避免动到别的读取方。
 */
export interface EraFieldRow {
  BattleArray?: string[];
  Force?: string[];
  UseForce?: string[];
  LoyalKing?: string;
  Weapon?: string;
  BattleArray_by_times?: string[][];
  Force_by_times?: string[][];
  UseForce_by_times?: string[][];
  LoyalKing_by_times?: string[];
  Weapon_by_times?: string[];
}

/** 剧本数（`*_by_times[5]`，下标 0..4） */
export const ERA_SCENARIO_COUNT = 5;

/** 剧本下标归一：非有限数 → 0，只取整数部分；越界不抛（取值时自然回落单值） */
function eraIndex(scenarioIdx: number): number {
  return Number.isFinite(scenarioIdx) ? Math.trunc(scenarioIdx) : 0;
}

/**
 * 取某武将在第 `scenarioIdx` 个剧本（0..4）的字段值：**时代优先** ——
 * `*_by_times[scenarioIdx]` 存在就用它，否则回落单值字段（= TIMES1）。
 * 返回类型与单值字段一致：BattleArray/Force/UseForce → `string[]`，
 * LoyalKing/Weapon → `string`；两边都没有 → `undefined`。
 */
export function eraFieldOf(
  row: EraFieldRow,
  field: EraField,
  scenarioIdx: number,
): string | string[] | undefined {
  const byTimes = (row as unknown as Record<string, unknown>)[`${field}_by_times`];
  if (Array.isArray(byTimes)) {
    const v = byTimes[eraIndex(scenarioIdx)];
    if (v !== undefined && v !== null) return v as string | string[];
  }
  return row[field];
}

/** 列表字段统一成 token 数组：数组原样；空格分隔串拆开；空/缺省 → [] */
function toTokens(v: string | string[] | undefined): string[] {
  if (Array.isArray(v)) return v;
  if (typeof v !== 'string') return [];
  const t = v.trim();
  return t === '' ? [] : t.split(/\s+/);
}

/** 列表字段的「时代优先」取值器，始终返回 `string[]`（`troopsOf`/`formationsOf` 等用） */
function eraTokensOf(row: EraFieldRow, field: 'BattleArray' | 'Force' | 'UseForce', scenarioIdx: number): string[] {
  return toTokens(eraFieldOf(row, field, scenarioIdx));
}

/** 该将当前可带的兵种（`UseForce` → 0..12，去重升序；空/未知 token 跳过） */
export function troopsOf(general: General, scenarioIdx = 0): number[] {
  return toIndexes(eraTokensOf(general, 'UseForce', scenarioIdx), troopIndexOf);
}

/** 全部可带兵种（`Force` → 0..12，含未学；去重升序） */
export function allTroopsOf(general: General, scenarioIdx = 0): number[] {
  return toIndexes(eraTokensOf(general, 'Force', scenarioIdx), troopIndexOf);
}

/** 该将已学的阵形（`BattleArray` → 0..8，去重升序） */
export function formationsOf(general: General, scenarioIdx = 0): number[] {
  return toIndexes(eraTokensOf(general, 'BattleArray', scenarioIdx), formationIndexOf);
}

/** 默认兵种：`UseForce` 第一个有效项 → 次选 `Force` 第一个有效项 → 兜底 0（朴刀） */
export function defaultTroopOf(general: General, scenarioIdx = 0): number {
  const useForce = eraTokensOf(general, 'UseForce', scenarioIdx);
  for (const tok of useForce) {
    const i = troopIndexOf(tok);
    if (i >= 0) return i;
  }
  const force = eraTokensOf(general, 'Force', scenarioIdx);
  for (const tok of force) {
    const i = troopIndexOf(tok);
    if (i >= 0) return i;
  }
  return 0;
}

/** 默认阵形：`UseBattleArray` 有效 → 次选 `BattleArray` 第一个有效项 → 兜底 0（方） */
export function defaultFormationOf(general: General, scenarioIdx = 0): number {
  const current = formationIndexOf(general.UseBattleArray);
  if (current >= 0) return current;
  const battleArray = eraTokensOf(general, 'BattleArray', scenarioIdx);
  for (const tok of battleArray) {
    const i = formationIndexOf(tok);
    if (i >= 0) return i;
  }
  return 0;
}

function toIndexes(tokens: string[] | undefined, indexOf: (t: string) => number): number[] {
  const out = new Set<number>();
  for (const tok of tokens ?? []) {
    const i = indexOf(tok);
    if (i >= 0) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// 第二层：兵符 / 阵法书（位掩码）

/** `Force` / `Battle` → 非负整数掩码；`""` / 缺省 / NaN / 负数 → 0 */
function maskOf(v: number | string | undefined): number {
  const n = typeof v === 'string' ? (v.trim() === '' ? 0 : Number(v)) : (v ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
}

/** 把 ownedIds 里存在的物品的掩码按位或起来；`pick` 决定取 Force 还是 Battle */
function ownedMask(items: Item[], ownedIds: string[], pick: (it: Item) => number): number {
  const owned = new Set(ownedIds.map((id) => String(id)));
  let mask = 0;
  for (const it of items) {
    if (!owned.has(String(it.Sequence))) continue;
    mask |= pick(it);
  }
  return mask;
}

function expand(mask: number, count: number): boolean[] {
  const out: boolean[] = [];
  for (let i = 0; i < count; i++) out.push((mask & (1 << i)) !== 0);
  return out;
}

/** 该兵种是否已解锁：持有任意一件带对应 Force 位的兵符即是 */
export function isTroopUnlocked(items: Item[], ownedIds: string[], troopIndex: number): boolean {
  if (!Number.isInteger(troopIndex) || troopIndex < 0 || troopIndex >= TROOP_COUNT) return false;
  const bit = 1 << troopIndex;
  const owned = new Set(ownedIds.map((id) => String(id)));
  for (const it of items) {
    if (!owned.has(String(it.Sequence))) continue;
    if (it.TYPE !== 'JEWEL_MISC') continue;
    if ((maskOf(it.Force) & bit) !== 0) return true;
  }
  return false;
}

/** 该阵形是否已解锁：持有任意一本带对应 Battle 位的阵法书即是 */
export function isFormationUnlocked(items: Item[], ownedIds: string[], formationIndex: number): boolean {
  if (!Number.isInteger(formationIndex) || formationIndex < 0 || formationIndex >= FORMATION_COUNT) return false;
  const bit = 1 << formationIndex;
  const owned = new Set(ownedIds.map((id) => String(id)));
  for (const it of items) {
    if (!owned.has(String(it.Sequence))) continue;
    if ((maskOf(it.Battle) & bit) !== 0) return true;
  }
  return false;
}

/** 13 个兵种的解锁状态（下标 = 兵种号 0..12） */
export function unlockedTroops(items: Item[], ownedIds: string[]): boolean[] {
  return expand(
    ownedMask(items, ownedIds, (it) => (it.TYPE === 'JEWEL_MISC' ? maskOf(it.Force) : 0)),
    TROOP_COUNT,
  );
}

/** 9 个阵形的解锁状态（下标 = 阵形号 0..8） */
export function unlockedFormations(items: Item[], ownedIds: string[]): boolean[] {
  return expand(ownedMask(items, ownedIds, (it) => maskOf(it.Battle)), FORMATION_COUNT);
}

// ---------------------------------------------------------------------------
// R68 武将技 / 军师技学习门槛（运行期流程）
// ---------------------------------------------------------------------------
//
// 原作**没有技能树，也没有武力/智力门槛**，只有一张「习得等级 → 技序号」的表：
//  - 表：`generals[].SKILL`（武将技）/ `WISESKILL`（军师技），每行是 `"习得等级, 技序号"`；
//  - 内存：`general+0x54 byte[8]` 已学武将技 / `+0x5C byte[8]` 已学军师技 /
//    `+0x65`、`+0x75` 各 `8×{等级, id}` 学习表（`docs/04b_战斗系统.md:61-63`）；
//  - 升级：`0x40A183`（武将技）/ `0x40A227`（军师技）按等级扫表补学，
//    `docs/04b:572` 的升级提示里直接有「學會新的武將技:%s」「學會新的軍師策略:%s」；
//  - 结论原文：`docs/04b:637`「等級到了自動學會，無需技能樹」。
//
// 这里把它拆成三个可组合的**纯函数**（不改 `World`、不读画面、不掷骰）：
//   1. `pendingLearn`    —— 按当前等级，还差哪些没学（含月末补学的漏学）；
//   2. `learnable`       —— 单条判定：在不在表里 / 等级够不够 / 8 槽满没满；
//   3. `applyLearn`      —— 把条目写进 `LearnState.magic` / `.wise`（幂等，重复调用不再变）。
// 两个触发点各自调一行：
//   - 升级：`onLevelUp(state, 旧等级, 新等级)`，只补 `(旧, 新]` 这一段（原作补学的区间口径）；
//   - 月末：`monthlyLearnCheck(state)`，把所有 `≤ 当前等级` 的漏学一次补齐。
//
// 两条口径说明（报告里也写了）：
//  - 「智力/武力门槛」在数据（`magics.json` 无门槛字段）和文档里都查不到，STR/INT 只进带兵数/技力上限
//    公式（`docs/04b §9.4`）。所以判定**只按等级**；若以后要加，应当把它做成 `canLearn` 的显式参数，
//    而不是在这里偷偷读 STR/INT。
//  - 「月末补学」在文档里**找不到直接证据**（只有升级补学），是本任务书要求的第二触发点；实现成
//    「补齐所有漏学」的兜底，对升级触发没有副作用。标 `[推测]`。
//  - 事件/剧情送技同样没有证据，本 API 只认学习表；确有剧情送技时应当另加 `grantLearn`（不猜）。

/** 已学武将技槽位 = 8（`general+0x54 byte[8]`，`docs/04b_战斗系统.md:61`） */
export const MAGIC_SLOTS = 8;
/** 已学军师技槽位 = 8（`general+0x5C byte[8]`，`docs/04b_战斗系统.md:62`） */
export const WISE_SLOTS = 8;
/** 学习表等级上界 = 41（`docs/03a-武将技表MAGIC.md:477`；数据实测也正好是 1..41） */
export const LEARN_MAX_LEVEL = 41;

/** 学习表的一行：第几级学、学哪条技（`+0x65` 表里的 `{等级, id}`） */
export interface LearnRow {
  /** 习得等级（`SKILL` / `WISESKILL` 第一列） */
  level: number;
  /** 技序号（第二列，对应 `magics.json` / `wises.json` 的 `SEQUENCE`） */
  seq: number;
  /** 技名（从 `data.magics` / `data.wises` 查到的 `NAME`） */
  name: string;
}

/**
 * 一名武将的技能习得状态（`general+0x54/+0x5C/+0x65` 三块的运行期镜像）。
 * 可序列化：`magic`/`wise` 存序号，`magicTable`/`wiseTable` 可由 `createLearnState` 重算。
 */
export interface LearnState {
  /** 武将名（`generals.json` 的 `NAME`，与 `battle.ts` 的 `GeneralState.name` 同一口径） */
  name: string;
  /** 当前等级（门槛判定的依据） */
  level: number;
  /** 已学武将技序号（≤ `MAGIC_SLOTS` 条） */
  magic: number[];
  /** 已学军师技序号（≤ `WISE_SLOTS` 条） */
  wise: number[];
  /** 武将技学习表（按等级升序） */
  magicTable: LearnRow[];
  /** 军师技学习表（按等级升序） */
  wiseTable: LearnRow[];
}

/** 一条待学/已学的技能（报告与 UI 提示用；`kind` 区分武将技/军师技） */
export interface PendingLearn {
  kind: LearnKind;
  /** 技序号 */
  seq: number;
  /** 技名 */
  name: string;
  /** 学习表里的习得等级 */
  learn: number;
}

/** 技能种类：武将技 / 军师技 */
export type LearnKind = 'magic' | 'wise';

/** 等级归一到 ≥1 的整数（`NaN`/`Infinity` 当 1 级） */
function normalizeLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.floor(level));
}

/** 序号去重 + 丢掉非法值（存档里可能混进 0/NaN/重复） */
function uniqSeqs(list: readonly number[] | undefined): number[] {
  const out: number[] = [];
  for (const v of list ?? []) {
    const n = Number(v);
    if (!Number.isInteger(n) || n < 1 || out.includes(n)) continue;
    out.push(n);
  }
  return out;
}

/**
 * 解析一行学习表。数据有两种形态：
 *  - `generals.json` 里是字符串 `"6, 63"`（`SKILL` / `WISESKILL`）；
 *  - `types.ts` 声明的 `[等级, 序号]` 元组（导出的历史形态）。
 * 坏行（`盜賊` 模板的 `"1,"`、空串、缺列、NaN）返回 `null` 由调用方丢弃 —— 不猜。
 */
function parseLearnRow(raw: unknown): { level: number; seq: number } | null {
  let a: unknown;
  let b: unknown;
  if (typeof raw === 'string') {
    const parts = raw.split(',');
    a = parts[0];
    b = parts[1];
  } else if (Array.isArray(raw)) {
    a = raw[0];
    b = raw[1];
  } else {
    return null;
  }
  const level = Number(a);
  const seq = Number(b);
  if (!Number.isInteger(level) || !Number.isInteger(seq) || level < 1 || seq < 1) return null;
  return { level, seq };
}

/**
 * 取某人的学习表（`SKILL` = 武将技 / `WISESKILL` = 军师技），按等级升序。
 * 表里有、但 `magics.json`/`wises.json` 里没有的序号直接丢掉（实测 0 例；丢掉比猜名字安全）。
 */
export function learnTableOf(data: GameData, name: string, field: 'SKILL' | 'WISESKILL'): LearnRow[] {
  const general = data.generals.find((g) => g.NAME === name);
  if (!general) return [];
  const raw = (field === 'SKILL' ? general.SKILL : general.WISESKILL) ?? [];
  const rows: LearnRow[] = [];
  const seen = new Set<number>();
  for (const item of raw as unknown[]) {
    const row = parseLearnRow(item);
    if (!row || seen.has(row.seq)) continue;
    const def =
      field === 'SKILL'
        ? data.magics.find((m) => m.SEQUENCE === row.seq)
        : data.wises.find((w) => w.SEQUENCE === row.seq);
    if (!def) continue;
    seen.add(row.seq);
    rows.push({ level: row.level, seq: row.seq, name: def.NAME });
  }
  rows.sort((x, y) => x.level - y.level || x.seq - y.seq);
  return rows;
}

/**
 * 建一份习得状态。`known` 用来接存档里的已学列表（不传 = 从零开始，交给 `monthlyLearnCheck` 补）。
 * 注意 `known` 不按学习表过滤：原作剧情/事件送技可以给表外的技，这里只负责"别重复"。
 */
export function createLearnState(
  data: GameData,
  name: string,
  level = 1,
  known: { magic?: readonly number[]; wise?: readonly number[] } = {},
): LearnState {
  return {
    name,
    level: normalizeLevel(level),
    magic: uniqSeqs(known.magic),
    wise: uniqSeqs(known.wise),
    magicTable: learnTableOf(data, name, 'SKILL'),
    wiseTable: learnTableOf(data, name, 'WISESKILL'),
  };
}

/** 单条判定的公共实现 */
function canLearn(state: LearnState, kind: LearnKind, seq: number, level: number): boolean {
  const table = kind === 'magic' ? state.magicTable : state.wiseTable;
  const known = kind === 'magic' ? state.magic : state.wise;
  const slots = kind === 'magic' ? MAGIC_SLOTS : WISE_SLOTS;
  const row = table.find((r) => r.seq === seq);
  if (!row) return false; // 不在这名武将的学习表里
  if (known.includes(seq)) return false; // 已学
  if (row.level > normalizeLevel(level)) return false; // 等级没到
  return known.length < slots; // 8 槽没满
}

/** 这条武将技现在能不能学（`level` 默认当前等级，可传未来等级做预览） */
export function learnable(state: LearnState, magic: number | Magic, level = state.level): boolean {
  return canLearn(state, 'magic', typeof magic === 'number' ? magic : magic.SEQUENCE, level);
}

/** 这条军师技现在能不能学（与 `learnable` 同口径，槽位换成 `WISE_SLOTS`） */
export function learnableWise(state: LearnState, wise: number | Wise, level = state.level): boolean {
  return canLearn(state, 'wise', typeof wise === 'number' ? wise : wise.SEQUENCE, level);
}

/** 待学条目的统一顺序：先按习得等级，再武将技在前，最后按序号 */
function byLearnOrder(x: PendingLearn, y: PendingLearn): number {
  return x.learn - y.learn || (x.kind === y.kind ? 0 : x.kind === 'magic' ? -1 : 1) || x.seq - y.seq;
}

/**
 * 按当前等级，还差哪些没学（含漏学）。只读不写，按 `(习得等级, 武将技在前, 序号)` 排序。
 * 月末补学 = `applyLearn(state, pendingLearn(state))`。
 */
export function pendingLearn(state: LearnState): PendingLearn[] {
  const out: PendingLearn[] = [];
  for (const row of state.magicTable) {
    if (row.level <= state.level && !state.magic.includes(row.seq)) {
      out.push({ kind: 'magic', seq: row.seq, name: row.name, learn: row.level });
    }
  }
  for (const row of state.wiseTable) {
    if (row.level <= state.level && !state.wise.includes(row.seq)) {
      out.push({ kind: 'wise', seq: row.seq, name: row.name, learn: row.level });
    }
  }
  out.sort(byLearnOrder);
  return out;
}

/**
 * 把条目写进已学表，返回**真正写进去**的条目（已学/表外/等级不够/槽满 的条目会被跳过）。
 * 默认 `entries = pendingLearn(state)`，所以「补齐所有漏学」就是 `applyLearn(state)`。
 * 幂等：第二次调用返回 `[]`，`state` 不变。
 */
export function applyLearn(state: LearnState, entries: readonly PendingLearn[] = pendingLearn(state)): PendingLearn[] {
  const applied: PendingLearn[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const key = `${entry.kind}:${entry.seq}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const table = entry.kind === 'magic' ? state.magicTable : state.wiseTable;
    const known = entry.kind === 'magic' ? state.magic : state.wise;
    const slots = entry.kind === 'magic' ? MAGIC_SLOTS : WISE_SLOTS;
    const row = table.find((r) => r.seq === entry.seq);
    if (!row || known.includes(row.seq) || row.level > state.level) continue;
    if (known.length >= slots) continue;
    known.push(row.seq);
    applied.push({ kind: entry.kind, seq: row.seq, name: row.name, learn: row.level });
  }
  return applied;
}

/**
 * 升级触发（`0x40A183` / `0x40A227` 的区间口径）：只补 `(from, to]` 里跨过的行。
 * `to <= from`（降级/同级/结算里 `hi<=lo` 的退化情况）返回 `[]`，不动状态。
 * 一次升多级也走这里（区间会覆盖中间每一行）；漏掉的由月末 `monthlyLearnCheck` 兜底。
 */
export function onLevelUp(state: LearnState, from: number, to: number): PendingLearn[] {
  const lo = normalizeLevel(from);
  const hi = normalizeLevel(to);
  if (hi <= lo) return [];
  state.level = Math.max(state.level, hi);
  const entries: PendingLearn[] = [];
  for (const row of state.magicTable) {
    if (row.level > lo && row.level <= hi) {
      entries.push({ kind: 'magic', seq: row.seq, name: row.name, learn: row.level });
    }
  }
  for (const row of state.wiseTable) {
    if (row.level > lo && row.level <= hi) {
      entries.push({ kind: 'wise', seq: row.seq, name: row.name, learn: row.level });
    }
  }
  entries.sort(byLearnOrder);
  return applyLearn(state, entries);
}

/**
 * 月末触发：把所有 `≤ 当前等级` 的漏学一次补齐（升级时漏掉的、或读档时等级已经涨上去的）。
 * `[推测]` 文档只写了升级补学，没有月末补学的直接证据；这是任务书要求的第二触发点，做成兜底。
 */
export function monthlyLearnCheck(state: LearnState): PendingLearn[] {
  return applyLearn(state, pendingLearn(state));
}
