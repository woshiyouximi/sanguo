/**
 * 战后武将名单结算：招降入城（原有）+ 斩首出池（R56）+ 释放回原势力（R103）。
 *
 * 存档形状见 `types.ts` 的 `CampaignSave`（就是 `game/web/campaign.html` 那份
 * localStorage JSON 的子集）：`roster[城名] = 武将名[]`，另有
 * `roster._moved[武将名] = 落腳城`（`game/web/city_model.js:512` 读它做调动的唯一真源）。
 *
 * R56 的缺口：`capture.ts` 只把被斩武将记进 `report.executed`，**没人把它从可招募池/
 * 势力将池里删掉**，于是一个被斩的人下次还会出现在 `city_model.js` 的 `rosterOf()` /
 * `wildPool()` 里被重新搜索、重新招募。原作里斩将 = 从城内武将链上摘掉、永不复活
 * （`docs/04c_世界与内政.md:308-316`），所以这里补两件事：
 *
 *  1. `removeFromPools()`：把名字从**每一座城**的 `roster[城]` 名单里删掉（招降/调动
 *     留下的副本一并清掉），并打上"已斩首"标记；
 *  2. `applyPostBattle()`：一次性做"招降入城 + 斩首出池 + 跨城去重"，幂等。
 *
 * "已斩首"标记用 `roster._moved[name] = '陣亡'` 这个哨兵值表达，原因：
 * `city_model.js` 的 `rosterOf()`（:512-535）/`stationedNames()`（:552-566）已经只认
 * `_moved` 这一个渠道 —— 只要 `moved[name]` 存在且不等于查询城名，这个人就既不在
 * 原城、也不在 `wildPool()`，等于彻底出池。用一条**现有**渠道而不是新增 `save.dead`
 * 字段，是因为 `game/web/**` 这一轮不归我改（另一个 agent 在动），新增字段 web 侧
 * 读不到、等于没修。哨兵值取"陣亡"而不是空串：`rosterOf()` 里 `moved[name] || ''`
 * 会把空串当成"没调动"。
 *
 * 规则：
 *  - 只处理 `post.captures` 里 `recruited === true` 的条目（executed 走 `removeFromPools()`、
 *    released 走 `releaseFromPools()`，都不进名单）；
 *  - 释放（R103）只摘名单 + 打 `_moved` 哨兵，不改任何静态归属（见 `releaseFromPools()`）；
 *  - 被斩首的名字从所有城名单里删掉，且以后 `applyCapturesToRoster()` 也不会再加回来；
 *  - 该城没有 `roster` 数组就建一个（连 `save.roster` 本身没有也一起建）；
 *  - **幂等**：重复调用不会重复 push、不会重复记 `removed`。
 *
 * 原作里招降成功的将直接进"我方武将列表"，所以这里是"按城"记名；
 * 哪座城（`homeCity`）由调用方给 —— 通常是打完仗回城的那座。
 */
import type { CampaignSave, GameData } from '../types.ts';
import type { CapturedGeneral, PostBattleReport, PostGeneral } from './capture.ts';
import { canRecruit, recruitChanceOf } from './capture.ts';

/** `roster._moved[name]` 的哨兵值：已斩首，永不复活（见文件头"出池"说明） */
export const DEAD = '陣亡';

/**
 * `roster._moved[name]` 的哨兵值：已释放回原势力（R103，`status=2`「安全歸來」）。
 *
 * 原作释放**不改任何字段**：`0x44EDB4` 只写 `status=2`，随后 `0x40EF9A` 的 switch
 * 对 `case 2` 什么都不做（`docs/04b2` §6.2）—— 势力（`+0x10`）/君主（`+0xCB`）/
 * 所在城（`+0xD7`）全部原样，所以是"回原势力"，**不是**转在野。`generals.json` 的
 * `status_by_times`（`登`/`野`/`未`）是剧本初值，也不会因此变成 `野`。
 *
 * 但本作 web 的城池名单是 `city_model.js:rosterOf()` 用**静态** `city_by_times` 推的：
 * 我军一打下城，它的原守将就会被算成"我方武将"。要让"释放的将不在我方名单"成立，
 * 只能借 `_moved` 这条既有渠道打哨兵（值不等于任何城名 → `rosterOf()` 两处都跳过）。
 * 哨兵只表示"不在我方名单"，不改静态归属：他下次仍按 `garrison.json` 在原势力守城，
 * 也仍可再被搜索/俘虏（`isDead()` 只认 `DEAD`）。重新招降时哨兵会被摘掉。
 */
export const RELEASED = '釋放';

/** 只需要这几个字段，测试里传 `{ captures: [...] }` 就够；`executed` 可选 */
export type PostBattle = Pick<PostBattleReport, 'captures'> &
  Partial<Pick<PostBattleReport, 'executed'>>;

export interface ApplyCapturesResult {
  /** 本次真正新增的武将名（已去重、按 post.captures 顺序）；幂等重放时为空 */
  added: string[];
}

export interface ApplyPostBattleResult extends ApplyCapturesResult {
  /** 本次从池里移除（斩首）的武将名；幂等重放时为空 */
  removed: string[];
}

/** `save.roster` 的宽松视图：值可能是 `string[]`（城名单）或 `_moved` 的映射 */
type RawRoster = {
  _moved?: Record<string, string>;
  [key: string]: unknown;
};

function rawRoster(save: CampaignSave, create = true): RawRoster {
  if (!save.roster && create) save.roster = {};
  return (save.roster ?? {}) as unknown as RawRoster;
}

function cityList(raw: RawRoster, city: string): string[] {
  const cur = raw[city];
  if (Array.isArray(cur)) return cur as string[];
  const list: string[] = [];
  raw[city] = list;
  return list;
}

/** 所有城的名单键（排除 `_moved`；非数组的键一律跳过） */
function cityKeys(raw: RawRoster): string[] {
  return Object.keys(raw).filter((k) => k !== '_moved' && Array.isArray(raw[k]));
}

/**
 * 已斩首名单。
 *
 * 只认 `_moved[name] === DEAD`；`_moved` 缺失/形状不对时返回空数组（不抛）。
 */
export function deadNames(save: CampaignSave): string[] {
  const raw = rawRoster(save, false);
  const moved = raw._moved;
  if (!moved || typeof moved !== 'object') return [];
  return Object.keys(moved).filter((n) => moved[n] === DEAD);
}

/**
 * `_moved` 的只读视图（web 的 `stationedNames` 就靠它判断人去了哪）。
 *
 * `CampaignSave.roster` 的类型是 `Record<string, string[]>`，`_moved` 是同一对象里
 * 唯一的非数组键；这里给出一个不抛的类型安全入口，避免调用方到处 `as any`。
 */
export function movedOf(save: CampaignSave): Record<string, string> {
  const raw = rawRoster(save, false);
  const moved = raw._moved;
  return moved && typeof moved === 'object' ? moved : {};
}

/** 这个武将是否已被斩首（永不进池） */
export function isDead(save: CampaignSave, name: string): boolean {
  const raw = rawRoster(save, false);
  const moved = raw._moved;
  return !!moved && typeof moved === 'object' && moved[String(name)] === DEAD;
}

/**
 * 已释放名单（`_moved[name] === RELEASED`）。
 *
 * 释放**不是**"出池"：他仍在原势力的守将表里，下次还会来守城、还能再被俘
 * （原作 `status=2` 还能再遇，见 `RELEASED` 的说明）。这里只给战报/查档用。
 */
export function releasedNames(save: CampaignSave): string[] {
  const moved = movedOf(save);
  return Object.keys(moved).filter((n) => moved[n] === RELEASED);
}

/** 这个武将是否已被释放回原势力（`_moved === RELEASED`） */
export function isReleased(save: CampaignSave, name: string): boolean {
  return movedOf(save)[String(name)] === RELEASED;
}

/**
 * 把 `names` 从**所有城**的名单里删掉，并记成已斩首（R56）。
 *
 * 即使某人当前不在任何一座城的名单里（守将在野外/在敌城数据里），也要记死：
 * 否则他下一次还能被招降，违反"斩首=死亡不可复活"。
 *
 * @returns 本次**新记入死亡**的名字（幂等重放返回空数组）
 */
export function removeFromPools(save: CampaignSave, names: Iterable<string>): string[] {
  const raw = rawRoster(save);
  const moved = (raw._moved && typeof raw._moved === 'object' ? raw._moved : (raw._moved = {})) as
    Record<string, string>;
  const removed: string[] = [];

  for (const n of names) {
    const name = String(n ?? '');
    if (!name) continue;
    for (const city of cityKeys(raw)) {
      const list = raw[city] as string[];
      const at = list.indexOf(name);
      if (at >= 0) list.splice(at, 1);
    }
    // 幂等：已经记过死的就不再算"本次移除"
    if (!moved[name]) removed.push(name);
    moved[name] = DEAD;
  }
  return removed;
}

/**
 * 释放回原势力（R103）：把名字从**所有城**的名单里摘掉，并在 `_moved` 打 `RELEASED` 哨兵。
 *
 * 原作语义（`docs/04b2` §6.2 `[确认]`）：`0x44EDB4` 只写 `status=2`，`0x40EF9A` 的 switch
 * 不处理 `case 2` → **无字段变更**；AI 侧同一档的文案是 `0x481214 "%s將軍安全歸來!!"`。
 * 所以释放 = 该将回原势力（势力/君主/所在城指针原样），**不转在野、不掉原城归属**。
 * 本作里"回原势力"的表示就是"不在我方任何城的名单里"：静态 `city_by_times` 不改
 * （`generals.json` 只读），只借 `_moved` 打哨兵（理由见 `RELEASED`）。
 *
 * 斩首优先：已 `DEAD` 的名字不会被释放"复活"（脏档防御）。
 *
 * @returns 本次**新打上**释放哨兵的名字（幂等重放返回空数组）
 */
export function releaseFromPools(save: CampaignSave, names: Iterable<string>): string[] {
  const raw = rawRoster(save);
  const moved = (raw._moved && typeof raw._moved === 'object' ? raw._moved : (raw._moved = {})) as
    Record<string, string>;
  const released: string[] = [];

  for (const n of names) {
    const name = String(n ?? '');
    if (!name) continue;
    if (moved[name] === DEAD) continue; // 已斩首的不复活
    for (const city of cityKeys(raw)) {
      const list = raw[city] as string[];
      const at = list.indexOf(name);
      if (at >= 0) list.splice(at, 1);
    }
    // 幂等：已经打过释放哨兵的不再算"本次释放"
    if (moved[name] !== RELEASED) released.push(name);
    moved[name] = RELEASED;
  }
  return released;
}

export function applyCapturesToRoster(
  save: CampaignSave,
  post: PostBattle,
  homeCity: string,
): ApplyCapturesResult {
  const city = String(homeCity);
  const raw = rawRoster(save);

  // 先筛出真正要加的人：一个都没有就**不要**建空城数组（旧行为会把城"建"出来）
  const pending = post.captures
    .filter((cap) => cap && cap.recruited === true)
    .map((cap) => String(cap.name))
    .filter((name) => name && !isDead(save, name));
  if (pending.length === 0) return { added: [] };

  const list = cityList(raw, city);
  const added: string[] = [];
  // 曾经释放过的将再被招降：先摘掉 `RELEASED` 哨兵，否则 `rosterOf()` 仍当他"不在任何城"
  const moved = (raw._moved && typeof raw._moved === 'object' ? raw._moved : null) as
    Record<string, string> | null;
  for (const name of pending) {
    if (moved && moved[name] === RELEASED) delete moved[name];
    // 幂等：同一批里重复、或上一次调用已经写进去的，都不再 push
    if (list.includes(name) || added.includes(name)) continue;
    list.push(name);
    added.push(name);
  }
  return { added };
}

/**
 * 戰中勸降（軍師技 32 / `Execute 33`）的戰後落庫：把「戰中標記」變成一次招降成功。
 *
 * 原作 `0x44DDE0..0x44DE3F` 的成功分支只有 `foeArmy+0x84 |= 0x400` + 一句
 * 「說服敵將投靠我方」，**不碰武將名單**；名單變動在戰後 `0x44E820` 那段（先算招降結果
 * 存 `[0x4A8094]`，玩家按鈕只讀不重擲，見 `project/92`）。所以：
 *
 *   · `battle.ts:settle()` 讀 `army[敗方].defectPending`（戰中 `applyWise(32)` /
 *     `strategy.ts` 的 persuade 分支寫的顯式標記）；
 *   · 由本函數補一條 `recruited: true` 的捕獲條目進 `post.captures`；
 *   · 之後照常走 `applyPostBattle()` / `applyCapturesToRoster()` 的招降路徑落名單。
 *
 * **戰中不改 roster**：`settle()` 在戰鬥結束後才呼叫，`save.roster` 一次都不會被戰場內核碰到。
 *
 * 幂等：已有同名條目時只把 `recruited` 置 true；已經 true 的返回 null（= 這次沒有新變化）。
 *
 * @returns 真的被標成「招降成功」的名字；null = 沒有新變化
 */
export function markDefectedCapture(
  post: Pick<PostBattleReport, 'captures'>,
  g: { name: string; str?: number; int?: number; loyal?: number },
): string | null {
  const name = typeof g?.name === 'string' ? g.name : '';
  if (!name) return null;
  const list: CapturedGeneral[] = Array.isArray(post.captures) ? post.captures : (post.captures = []);
  const hit = list.find((c) => c && String(c.name) === name);
  if (hit) {
    if (hit.recruited === true) return null;
    hit.recruited = true;
    return name;
  }
  const cl = (v: unknown, lo: number, hi: number, def: number): number => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.max(lo, Math.min(hi, n)) : def;
  };
  list.push({
    name,
    str: cl(g?.str, 0, 999, 0),
    int: cl(g?.int, 0, 999, 0),
    loyal: cl(g?.loyal, 0, 99, 50),
    recruited: true,
  });
  return name;
}

/**
 * 战后一次性结算（R56 的落地入口，web 侧只要把 `resolvePostBattle()` 的 report 传进来）：
 *
 *  1. 被斩首的 → `removeFromPools()`：从所有城名单删除 + 标记死亡；
 *  2. 招降成功的 → 先从**别的城**名单里摘掉（同一个人不能同时在两座城），再进 `homeCity`；
 *  3. 释放的：本函数不动（`status=2`，原作还能再遇）；要表达"不在我方名单"由
 *     `applySurrender()` 调 `releaseFromPools()` 打哨兵（R103）。
 *
 * 幂等：同一份 report 重放，`added` / `removed` 都是空数组。
 */
export function applyPostBattle(
  save: CampaignSave,
  post: PostBattle,
  homeCity: string,
): ApplyPostBattleResult {
  const raw = rawRoster(save);
  const executed = (post.executed ?? []).map((e) => String(e?.name ?? '')).filter(Boolean);
  const removed = executed.length ? removeFromPools(save, executed) : [];

  // 招降：跨城去重（防止"原城的副本 + 新城的副本"同一个人出现两次）
  const city = String(homeCity);
  const recruits = post.captures.filter((c) => c && c.recruited === true);
  if (recruits.length) {
    const home = cityList(raw, city);
    for (const cap of recruits) {
      const name = String(cap.name);
      if (!name || isDead(save, name) || home.includes(name)) continue;
      for (const other of cityKeys(raw)) {
        if (other === city) continue;
        const list = raw[other] as string[];
        const at = list.indexOf(name);
        if (at >= 0) list.splice(at, 1);
      }
    }
  }

  const { added } = applyCapturesToRoster(save, post, city);
  return { added, removed };
}

// ---------------------------------------------------------------------------
// 招降决策（R85，`project/92_招降决策.md`）
//
// `project/89_全流程演练.md` 卡点③：战后结算是「自动拒降 → 直接进斩首池」，玩家没有
// 机会选。原作 `0x44E820` 是**先把招降结果算好**存 `[0x4A8094]`，再弹
// `0x491D8C "抓到敵將，如何處理?"`；按钮确认函数 `0x44EBE2` 只读那个预算结果、
// **不重新掷骰**（`docs/04b2_招降斩首与战后结算.md` §2.1）。战斗页 `main.js` 已经按这个
// 顺序把「预判成功的」写进 `save.captured`、「预判失败后被斩的」写进 `save.executed`。
//
// 所以这里**一行判定都不重写**：
//   1. `surrenderCandidates()` 把两个名单翻成"卡片"，档位直接问 `capture.ts` 的
//      `recruitChanceOf()`（:197，纯函数、不掷骰）—— p==1 必降 / 0<p<1 须掷骰 /
//      p==0 拒降。理由文案用 `canRecruit()`（:237）的原文，但**只在 chance 为 0/1 时**
//      调它：那两条路径 capture.ts 必然在掷骰前早退（:259-300），所以传一个会抛错的
//      `NO_ROLL` 当 rng，capture.ts 哪天改成"先掷骰再判"这里会立刻炸出来。
//   2. `applySurrender()` 只在玩家逐将决策**之后**落库，招降入城 / 斩首出池仍走既有的
//      `applyPostBattle()`；已决策的名字从待决名单摘掉 → 二次进入不会重复结算。
//
// 君主（`0x40975E`）：`resolvePostBattle()` 在 `isKingOf()` 处就 `continue` 了，君主
// **永远不会**出现在 captured/executed 里，所以面板单独出一张"逃走"行（候选来自
// `opts.atCity` 里那些剧本君主），不给按钮。
// ---------------------------------------------------------------------------

/** 招降判定档位：可降 / 需再战（要掷骰）/ 拒降 */
export type SurrenderTier = 'must' | 'roll' | 'refuse';

/** 玩家对一张卡的处置；`escape` = 放走（君主只能是这个），`release` = 释放回原势力（R103） */
export type SurrenderDecision = 'recruit' | 'kill' | 'escape' | 'release';

/** 逐将询问面板上的一张卡（web 侧只负责画，不参与判定） */
export interface SurrenderCard {
  name: string;
  str: number;
  int: number;
  /** 被俘当刻的忠诚（已扣 `0x447520`；君主行是未扣的表值） */
  loyal: number;
  /** 节操 1..9（`general+0xC7`） */
  constancy: number;
  isKing: boolean;
  /** 这张卡从哪来：战斗页预判成功 / 预判失败被斩 / 君主逃走 */
  from: 'captured' | 'executed' | 'king';
  /** 战斗页已经预判过结果（= 这张卡在 `save.captured` 里） */
  predicted: boolean;
  /** `recruitChanceOf()` 的返回值：1 必降、0 拒降、中间值须掷骰 */
  chance: number;
  tier: SurrenderTier;
  /** 档位文案：`可 降` / `需 再 戰` / `拒 降`（君主 `逃 走`） */
  tierText: string;
  /** 按钮能不能点「招降」（君主与预判失败的都点不了） */
  recruitable: boolean;
  /** 一行中文理由（原作硬门/节操原文，或成功率） */
  reason: string;
}

/** `surrenderCandidates()` 的上下文：城市守将名、我方将名、君主名 */
export interface SurrenderOpts {
  /** 该城（通常是刚打下的城）的守将名单，用来找"逃走"的君主 */
  atCity?: string[];
  /** 我方在職武将名：与他们同名的俘虏是"我方被俘"，不进面板（也不该被斩首） */
  mine?: string[];
  /** 我方君主名（`save.monarch || save.king`） */
  king?: string;
}

export interface SurrenderResult {
  /** 真正招降入城的名字（`applyPostBattle().added`） */
  recruited: string[];
  /** 玩家选了斩首的名字（不论是否已在池里） */
  killed: string[];
  /** 真正从池里移除的名字（`applyPostBattle().removed`，幂等重放为空） */
  removed: string[];
  /** 放走的名字，含君主 */
  escaped: string[];
  /**
   * 玩家选了释放的名字（回原势力）：不进 `save.captured`/`save.executed`，
   * 而是累加进 `save.released`、`_moved` 打 `RELEASED` 哨兵（幂等重放仍会列出）。
   */
  released: string[];
  /** 档位不允许却被要求招降的名字（防绕过硬门；按放走处理） */
  rejected: string[];
  /** 从 `save.captured` / `save.executed` 摘掉的名字（= 已决策） */
  cleared: string[];
}

const TIER_TEXT: Record<SurrenderTier, string> = {
  must: '可 降',
  roll: '需 再 戰',
  refuse: '拒 降',
};
const KING_TEXT = '逃 走';
const KING_REASON = '君主不可俘（0x40975E）：只能逃走';

/** 只允许走 `canRecruit()` 里"不掷骰"的早退路径；一旦掷骰立刻抛错（见文件头） */
const NO_ROLL: () => number = () => {
  throw new Error('capture.ts 的招降判定不应在 roster 的招降面板里掷骰（0x44EBE2 只读预算结果）');
};

/** 与 `capture.ts` 里 `Side` 同名；招降方永远是胜方 */
const WINNER = 'A' as unknown as Parameters<typeof canRecruit>[0];

type GeneralRow = {
  NAME?: unknown;
  STR?: unknown;
  INT?: unknown;
  /** generals.json 的数值忠诚（注意不是那个空的 `LOYAL` 字段） */
  Loyal?: unknown;
  CONSTANCY?: unknown;
};

type KingsRow = { kings?: { NAME?: unknown }[] };

function numOf(v: unknown, dflt: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

function nameListOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x ?? '')).filter(Boolean);
}

/** 剧本里的君主名（`capture.ts:150 isKingOf()` 的第二条判据；该函数没导出，只读不改） */
export function kingsInScenario(data: GameData): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const sc of ((data?.scenarios ?? []) as unknown as KingsRow[]) || []) {
    for (const k of sc?.kings ?? []) {
      const n = String(k?.NAME ?? '');
      if (n && !seen.has(n)) {
        seen.add(n);
        out.push(n);
      }
    }
  }
  return out;
}

function rowOf(data: GameData, name: string): GeneralRow | undefined {
  const rows = (data?.generals ?? []) as unknown as GeneralRow[];
  return rows.find((g) => g && String(g.NAME ?? '') === name);
}

/**
 * 卡上的数值。`loyal` 复刻 `resolvePostBattle()` 里那行 `0x447520` 战败扣忠诚
 * `clamp(row.Loyal - (10-節操)*2, 0, 99)`（`capture.ts:363` 之后逐将内联）—— 面板显示
 * 的档位必须和引擎算的一致，否则 `project/89` 里的 程昱53/華佗84/張遼78/守將40 对不上。
 */
function statOf(data: GameData, name: string): {
  str: number;
  int: number;
  baseLoyal: number;
  loyal: number;
  constancy: number;
} {
  const row = rowOf(data, name);
  const constancy = clampInt(numOf(row?.CONSTANCY, 5), 0, 9);
  const baseLoyal = clampInt(numOf(row?.Loyal, 50), 0, 99);
  return {
    str: Math.round(numOf(row?.STR, 0)),
    int: Math.round(numOf(row?.INT, 0)),
    baseLoyal,
    loyal: clampInt(baseLoyal - (10 - constancy) * 2, 0, 99),
    constancy,
  };
}

/** 一张俘虏卡（`from` 只有 captured/executed 两种，君主行走 `kingCardOf()`） */
function cardOf(data: GameData, name: string, from: 'captured' | 'executed'): SurrenderCard {
  const st = statOf(data, name);
  const g: PostGeneral = {
    name,
    str: st.str,
    int: st.int,
    // level 只影响战功/经验，判定不看；面板上也不显示
    level: 1,
    loyal: st.loyal,
    constancy: st.constancy,
  };
  // 与战斗页传给引擎的字段**一模一样**（main.js:600 只给 name/str/int/level，
  // 没有 isKing / lordAlive / sameForce / lordSurrendered）—— 档位因此不会和引擎打架。
  const chance = recruitChanceOf(g, { data, rng: () => 0.5 });
  const tier: SurrenderTier = chance >= 1 ? 'must' : chance <= 0 ? 'refuse' : 'roll';
  const predicted = from === 'captured';
  let reason: string;
  if (tier === 'roll') {
    reason = `${predicted ? '本戰擲骰成功' : '本戰擲骰失敗'}：成功率 ${(chance * 100).toFixed(1)}%（忠誠 ${st.loyal} / 節操 ${st.constancy}）`;
  } else {
    // chance 0/1 → canRecruit 必然早退、不碰 rng，所以能安全取原作中文原文
    const out = canRecruit(WINNER, g, { data, rng: NO_ROLL });
    reason = out.reasons.join('；') || (tier === 'must' ? '必降' : '拒降');
  }
  return {
    name,
    str: st.str,
    int: st.int,
    loyal: st.loyal,
    constancy: st.constancy,
    isKing: false,
    from,
    predicted,
    chance,
    tier,
    tierText: TIER_TEXT[tier],
    recruitable: predicted,
    reason,
  };
}

/** 君主行：只给"逃走"，不给按钮（`0x40975E` 在处置入口就把他放走了） */
function kingCardOf(data: GameData, name: string): SurrenderCard {
  const st = statOf(data, name);
  return {
    name,
    str: st.str,
    int: st.int,
    // 君主没被俘，不扣那 (10-節操)*2
    loyal: st.baseLoyal,
    constancy: st.constancy,
    isKing: true,
    from: 'king',
    predicted: false,
    chance: 0,
    tier: 'refuse',
    tierText: KING_TEXT,
    recruitable: false,
    reason: KING_REASON,
  };
}

/**
 * 战后逐将询问的候选卡（结算之后、进大地图之前）。
 *
 * 来源三条：
 *  - `save.captured`（战斗页预判"招降成功"）→ 可降，按钮能点；
 *  - `save.executed`（预判"拒降"后被斩）→ 档位多半是"需再战/拒降"，按钮不能点；
 *  - `opts.atCity` 里那些剧本君主 → 只显示"逃走"。
 *
 * 同名同时出现在两个名单里时**以斩首为准**（引擎不会这么写，防脏档）。
 * 已死的（`_moved='陣亡'`）、我方自己人（`opts.mine`）、我方君主（`opts.king`）都不出卡。
 */
export function surrenderCandidates(
  save: CampaignSave,
  data: GameData,
  opts: SurrenderOpts = {},
): SurrenderCard[] {
  const cards: SurrenderCard[] = [];
  const taken = new Set<string>();
  const executed = new Set(nameListOf(save?.executed));
  const mine = new Set((opts.mine ?? []).map((n) => String(n ?? '')).filter(Boolean));
  const kingName = String(opts.king ?? '');
  const kings = new Set(kingsInScenario(data));

  const usable = (name: string): boolean =>
    !!name && !taken.has(name) && !mine.has(name) && name !== kingName && !isDead(save, name);

  // 君主就算被脏档写进 captured/executed，也只能出"逃走"卡（`0x40975E`）
  const emit = (name: string, from: 'captured' | 'executed'): void => {
    if (!usable(name)) return;
    taken.add(name);
    cards.push(kings.has(name) ? kingCardOf(data, name) : cardOf(data, name, from));
  };

  for (const name of nameListOf(save?.captured)) {
    if (executed.has(name)) continue; // 以斩首为准，交给下面那趟
    emit(name, 'captured');
  }
  for (const name of nameListOf(save?.executed)) {
    emit(name, 'executed');
  }
  for (const raw of opts.atCity ?? []) {
    const name = String(raw ?? '');
    if (!kings.has(name)) continue; // 只有君主才配"逃走"这一行
    if (kingName && name === kingName) continue; // 我方君主不用逃
    emit(name, 'captured');
  }
  return cards;
}

/**
 * 面板要不要弹：没卡就不弹。
 *
 * `project/89` 的空城/无俘战（例如只打死守将没抓到人）不该每次都拦玩家一下 ——
 * web 侧必须先问这个函数再决定开不开 `#surrenderSheet`。
 */
export function needSurrenderPanel(cards: readonly SurrenderCard[]): boolean {
  return Array.isArray(cards) && cards.length > 0;
}

/** 从 `save.captured` / `save.executed` 里摘掉已决策的名字（不建新键） */
function dropPending(save: CampaignSave, key: 'captured' | 'executed', names: string[]): void {
  const cur = (save as Record<string, unknown>)[key];
  if (!Array.isArray(cur)) return;
  const drop = new Set(names);
  const left = (cur as unknown[]).filter((n) => !drop.has(String(n ?? '')));
  (save as Record<string, unknown>)[key] = left;
}

/**
 * 逐将决策落库。
 *
 * @param decisions 名字 → 处置；缺项视为"还没决定"，既不落库也不摘名单
 * @returns 各类结果名（见 `SurrenderResult`）
 *
 * 招降 / 斩首仍走 `applyPostBattle()`：招降进 `homeCity` 的名单（跨城去重、幂等），
 * 斩首从所有城名单移除 + `_moved='陣亡'`。释放走 `releaseFromPools()`（摘名单 +
 * `_moved='釋放'`，并累加 `save.released`）。君主与 `escape` 不动名单。
 */
export function applySurrender(
  save: CampaignSave,
  cards: readonly SurrenderCard[],
  decisions: Record<string, SurrenderDecision | undefined>,
  homeCity: string,
): SurrenderResult {
  const wantRecruit: string[] = [];
  const wantKill: string[] = [];
  const wantRelease: string[] = [];
  const escaped: string[] = [];
  const rejected: string[] = [];
  const cleared: string[] = [];

  for (const card of cards ?? []) {
    const name = String(card?.name ?? '');
    if (!name) continue;
    const d = decisions?.[name];
    if (!d) continue; // 还没决定：保持待决
    cleared.push(name);
    if (card.isKing || d === 'escape') {
      escaped.push(name);
      continue;
    }
    if (d === 'kill') {
      wantKill.push(name);
      continue;
    }
    if (d === 'release') {
      // 释放不看档位：拒降的将也能放回原势力（原作 0x491DF4 三键并列，没有硬门）
      wantRelease.push(name);
      continue;
    }
    // d === 'recruit'
    if (!card.recruitable) {
      // 绕过硬门（拒降档 / 引擎预判失败 / 君主）→ 一律按放走处理，不改名单
      rejected.push(name);
      escaped.push(name);
      continue;
    }
    wantRecruit.push(name);
  }

  const lookup = new Map((cards ?? []).map((c) => [String(c.name), c]));
  const post: PostBattle = {
    captures: wantRecruit.map((name) => {
      const c = lookup.get(name);
      return { name, str: c?.str ?? 0, int: c?.int ?? 0, loyal: c?.loyal ?? 0, recruited: true };
    }),
    executed: wantKill.map((name) => {
      const c = lookup.get(name);
      return { name, str: c?.str ?? 0, int: c?.int ?? 0, loyal: c?.loyal ?? 0, recruited: false };
    }),
  };

  const res =
    wantRecruit.length || wantKill.length
      ? applyPostBattle(save, post, homeCity)
      : { added: [] as string[], removed: [] as string[] };

  // 释放：回原势力 → 不在我方任何城的名单 + `_moved` 哨兵 + `save.released` 累加（去重）
  if (wantRelease.length) {
    releaseFromPools(save, wantRelease);
    rememberReleased(save, wantRelease);
  }

  if (cleared.length) {
    dropPending(save, 'captured', cleared);
    dropPending(save, 'executed', cleared);
  }

  return {
    recruited: res.added,
    killed: wantKill,
    removed: res.removed,
    escaped,
    released: wantRelease,
    rejected,
    cleared,
  };
}

/**
 * `save.released` 累加（R103）：保序、去重、不改历史项；只给战报/后查用。
 *
 * `CampaignSave` 没有 `released` 字段（`types.ts` 这轮不动），走它的索引签名读写；
 * 存档层（`saves.js`）对这个键是"未知键原样保留"，所以战报不会丢。
 */
function rememberReleased(save: CampaignSave, names: readonly string[]): void {
  const box = save as Record<string, unknown>;
  const cur = Array.isArray(box.released) ? box.released : [];
  const list = (cur as unknown[]).map((n) => String(n ?? '')).filter(Boolean);
  const seen = new Set(list);
  for (const raw of names) {
    const name = String(raw ?? '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  box.released = list;
}
