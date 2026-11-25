/**
 * 武將名單（城池 → 名單）與「出池」狀態：招降 / 斬首 / 釋放的落庫層。
 *
 * 純邏輯模組（不 import `cc`、不碰 `sys.localStorage`）：所有入口都吃普通的
 * `CampaignSave` 對象，方便 headless 測試，也方便 web 側的 JS 直接共用。
 *
 * 三條名單語義（與原作一致）：
 *  - 招降成功 → 進 `roster[homeCity]`（跨城去重，同一個人不能同時在兩座城）；
 *  - 斬首     → 從**所有城**的名單摘掉，`_moved[name] = DEAD`（永不復活）；
 *  - 釋放     → 同樣摘名單，`_moved[name] = RELEASED`（回原勢力，還能再遇）。
 *
 * [R197] 本檔同時是招降面板十欄的取值層（`surrenderCardExtras()`）：等級 / 士氣 /
 * 疲勞 / 武器 / 物品 / 勝場 / 敗場全部照抄 web 的唯一標準
 * （`game/web/campaign.html:4917-4960` 的 `surFields()`、`saves.js:836-909` 的
 * `generalRecord`）。**存檔沒有就是「沒有」**：一律回 `null` / 不填，由面板畫灰
 * 「—」，不拿 0 或 60 冒充真值（web 的 `moraleOf()` 缺省 60 是為了戰鬥計算，
 * 不是為了顯示）。
 */

import type { CampaignSave, GameData, General } from '../types';
import type { CapturedGeneral, PostBattleReport, PostGeneral } from './capture';
import { canRecruit, recruitChanceOf } from './capture';
import type { Side } from './battle';

/* ------------------------------------------------------------------------- */
/* [R56] 出池：名單 / `_moved` 哨兵                                            */
/* ------------------------------------------------------------------------- */

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

/** `save.roster` 的原始形状：城名 → 名单；唯一例外是 `_moved`（名 → 哨兵） */
type RosterRaw = Record<string, unknown>;

function rawRoster(save: CampaignSave, create = true): RosterRaw {
  if (!save.roster && create) save.roster = {};
  return (save.roster ?? {}) as RosterRaw;
}

function cityList(raw: RosterRaw, city: string): string[] {
  const cur = raw[city];
  if (Array.isArray(cur)) return cur as string[];
  const list: string[] = [];
  raw[city] = list;
  return list;
}

/** 所有城的名单键（排除 `_moved`；非数组的键一律跳过） */
function cityKeys(raw: RosterRaw): string[] {
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
  return Object.keys(moved).filter((n) => (moved as Record<string, unknown>)[n] === DEAD);
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
  return moved && typeof moved === 'object' ? (moved as Record<string, string>) : {};
}

/** 这个武将是否已被斩首（永不进池） */
export function isDead(save: CampaignSave, name: string): boolean {
  const raw = rawRoster(save, false);
  const moved = raw._moved;
  return !!moved && typeof moved === 'object' && (moved as Record<string, unknown>)[String(name)] === DEAD;
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
export function removeFromPools(save: CampaignSave, names: readonly string[]): string[] {
  const raw = rawRoster(save);
  const moved = (raw._moved && typeof raw._moved === 'object' ? raw._moved : (raw._moved = {})) as Record<
    string,
    string
  >;
  const removed: string[] = [];
  for (const n of names) {
    const name = String(n ?? '');
    if (!name) continue;
    for (const city of cityKeys(raw)) {
      const list = cityList(raw, city);
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
export function releaseFromPools(save: CampaignSave, names: readonly string[]): string[] {
  const raw = rawRoster(save);
  const moved = (raw._moved && typeof raw._moved === 'object' ? raw._moved : (raw._moved = {})) as Record<
    string,
    string
  >;
  const released: string[] = [];
  for (const n of names) {
    const name = String(n ?? '');
    if (!name) continue;
    if (moved[name] === DEAD) continue; // 已斩首的不复活
    for (const city of cityKeys(raw)) {
      const list = cityList(raw, city);
      const at = list.indexOf(name);
      if (at >= 0) list.splice(at, 1);
    }
    // 幂等：已经打过释放哨兵的不再算"本次释放"
    if (moved[name] !== RELEASED) released.push(name);
    moved[name] = RELEASED;
  }
  return released;
}

/* ------------------------------------------------------------------------- */
/* [R56] 战后落库                                                              */
/* ------------------------------------------------------------------------- */

/** 招降成功的人进 `homeCity` 的名单（幂等；一个都没有时不建空城数组） */
export function applyCapturesToRoster(
  save: CampaignSave,
  post: PostBattleReport,
  homeCity: string,
): { added: string[] } {
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
  const moved = raw._moved && typeof raw._moved === 'object' ? (raw._moved as Record<string, string>) : null;
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
  post: PostBattleReport,
  g: Partial<PostGeneral> | null | undefined,
): string | null {
  const name = typeof g?.name === 'string' ? g.name : '';
  if (!name) return null;
  const list = Array.isArray(post.captures) ? post.captures : (post.captures = []);
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
  post: PostBattleReport,
  homeCity: string,
): { added: string[]; removed: string[] } {
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
        const list = cityList(raw, other);
        const at = list.indexOf(name);
        if (at >= 0) list.splice(at, 1);
      }
    }
  }
  const { added } = applyCapturesToRoster(save, post, city);
  return { added, removed };
}

/* ------------------------------------------------------------------------- */
/* [R197] 十欄真值：士氣 / 疲勞 / 勝敗場 / 裝備 / 等級                          */
/*                                                                           */
/* 逐條照抄 web 的唯一標準：`campaign.html:4917-4960 surFields()` +            */
/* `saves.js:836-909`（`generalRecord`）。差別只有一處，而且是**故意的**：     */
/* web 的 `moraleOf()` 缺記錄回默認 60，這裡回 `null` —— 面板要顯示原作的      */
/* 真值，拿 60 冒充會把「沒打過仗的新人」畫成「士氣 60」（= 假數）。           */
/* ------------------------------------------------------------------------- */

/** 勝/敗場計數上限（web `saves.js` 的 `GENERAL_RECORD_MAX`） */
export const GENERAL_RECORD_MAX = 9999;

/** 一個武將的勝/敗記錄（web `saves.js:857 generalRowOf()` 的一行） */
export interface GeneralRecordRow {
  w: number;
  l: number;
}

/** 四槽裝備名（web `campaign.html:1710 equipNamesOf()` 的返回值；空槽是空串） */
export interface EquipNames {
  weapon: string;
  horse: string;
  book: string;
  amulet: string;
}

function saveBox(save: CampaignSave): Record<string, unknown> {
  return (save ?? {}) as Record<string, unknown>;
}

/** 把 `raw` 当映射看（非物件/陣列一律空映射，不拋）。 */
function objectAt(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
}

/** `save[key]` 當映射看（髒檔裡 `morale: 'x'` 之類不該炸）。 */
function mapAt(save: CampaignSave, key: string): Record<string, unknown> {
  return objectAt(saveBox(save)[key]);
}

function hasKey(map: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, key);
}

/**
 * 有限數 → 夾在 `[lo, hi]` 的整數；**不是數回 `null`**。
 *
 * 與 `numOf()` 的差別：`numOf(v, 0)` 會把「缺欄位」變 `0`，而面板要能區分
 * 「值是 0」與「根本沒有這條記錄」。布林/空串/`null` 也算沒有（web
 * `moraleNormalize()` 同樣丟這些）。
 */
function intOrNull(value: unknown, lo: number, hi: number): number | null {
  if (value === null || value === undefined || typeof value === 'boolean' || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? clampInt(n, lo, hi) : null;
}

/** web `setEquipSlots()` 的 `text()`：去空白；空串與佔位符 `---` / `—` 都算「沒有」。 */
function equipText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text === '' || text === '---' || text === '—' ? '' : text;
}

/**
 * 某個武將的勝/敗記錄（web `Saves.generalRecordOf()`，`saves.js:879`）。
 *
 * **沒有記錄返回 `null`**，不是 `{w:0,l:0}` —— 面板要能區分「打過 0 場」與
 * 「存檔裡根本沒有這個人的記錄」（後者畫灰「—」）。判定用 `hasOwnProperty`，
 * 與 web 一致（繼承鍵不算）。
 */
export function generalRecordOf(save: CampaignSave, name: string): GeneralRecordRow | null {
  const key = String(name ?? '').trim();
  if (!key) return null;
  const rows = mapAt(save, 'generalRecord');
  if (!hasKey(rows, key)) return null;
  const row = rows[key];
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const rec = row as Record<string, unknown>;
  return {
    w: intOrNull(rec.w, 0, GENERAL_RECORD_MAX) ?? 0,
    l: intOrNull(rec.l, 0, GENERAL_RECORD_MAX) ?? 0,
  };
}

/**
 * 記一場勝/敗（web `Saves.noteGeneralResult()`，`saves.js:896`）。
 *
 * 只寫 `save.generalRecord` 這一個鍵（不碰任何別的表）；`won` 必須是布林
 * （web 也是這麼嚴：非布林回 `null` 且不寫檔）。返回落帳後的整行。
 */
export function noteGeneralResult(save: CampaignSave, name: string, won: boolean): GeneralRecordRow | null {
  const key = String(name ?? '').trim();
  if (!key || typeof won !== 'boolean') return null;
  const rows = mapAt(save, 'generalRecord');
  const row = generalRecordOf(save, key) ?? { w: 0, l: 0 };
  const next: GeneralRecordRow = won
    ? { w: Math.min(GENERAL_RECORD_MAX, row.w + 1), l: row.l }
    : { w: row.w, l: Math.min(GENERAL_RECORD_MAX, row.l + 1) };
  rows[key] = next;
  saveBox(save).generalRecord = rows;
  return next;
}

/**
 * 士氣（原作 `general+0x38`；web `campaign.html:722-745` 的 `save.morale`）。
 *
 * **無記錄回 `null`**（web 的 `moraleOf()` 回默認 60，這裡故意不跟：面板顯示的是
 * 原作欄位真值，60 是「沒資料時的推定值」，畫上去就是編數）。
 */
export function moraleOf(save: CampaignSave, name: string): number | null {
  const key = String(name ?? '').trim();
  if (!key) return null;
  const map = mapAt(save, 'morale');
  return hasKey(map, key) ? intOrNull(map[key], 0, 100) : null;
}

/** 疲勞（原作 `general+0x3A`；web `save.tire`；無記錄回 `null` 而非 0）。 */
export function tireOf(save: CampaignSave, name: string): number | null {
  const key = String(name ?? '').trim();
  if (!key) return null;
  const map = mapAt(save, 'tire');
  return hasKey(map, key) ? intOrNull(map[key], 0, 100) : null;
}

/**
 * 裝備名（web `campaign.html:1710 equipNamesOf()`）。
 *
 * 兩張表都讀：v3 的 `save.equip[name][slot]` 優先，回落舊鏡像
 * `save.weapon / horse / thing`（web `Saves.equipOf()`；`book` 對應舊表的 `thing`）。
 * 一個都沒有就是空串（面板那格畫「—」）。
 */
export function equipNamesOf(save: CampaignSave, name: string): EquipNames {
  const key = String(name ?? '').trim();
  const slots = objectAt(mapAt(save, 'equip')[key]);
  return {
    weapon: equipText(slots.weapon) || equipText(mapAt(save, 'weapon')[key]),
    horse: equipText(slots.horse) || equipText(mapAt(save, 'horse')[key]),
    book: equipText(slots.book) || equipText(mapAt(save, 'thing')[key]),
    amulet: equipText(slots.amulet),
  };
}

/**
 * 等級（web `campaign.html:1624 generalLevelOf()` 的**存檔段**）。
 *
 * 只認 `save.generalLevel[name]`（≥1、上限 99）；**不做** web 那層
 * `scenarioLevelOf()` 劇本回落 —— 回落等於給「存檔沒記等級」的將編一個數字，
 * 與這輪「無記錄畫「—」」的口徑衝突。
 */
export function generalLevelOf(save: CampaignSave, name: string): number | null {
  const key = String(name ?? '').trim();
  if (!key) return null;
  const map = mapAt(save, 'generalLevel');
  if (!hasKey(map, key)) return null;
  const level = intOrNull(map[key], 1, 99);
  return level !== null && level >= 1 ? level : null;
}

/** `generals.json` 的一行；`Thing`（物品）不在 `types.ts` 的 `General` 裡，本地補一層 */
type GeneralRow = General & { Thing?: unknown };

/** `generals.json` 的靜態裝備名（web `surFields()` 的 `text(row.Weapon)` / `text(row.Thing)` 回落） */
function staticEquipOf(data: GameData, name: string, field: 'Weapon' | 'Thing'): string {
  return equipText(rowOf(data, name)?.[field]);
}

/**
 * 卡片那七欄的取值（取不到就不填 → 面板畫灰「—」）。
 *
 * 逐項對應 web `surFields(c)`：等級 / 士氣 / 疲勞 / 武器（裝備表回落靜態表）/
 * 物品（`book` 再 `amulet`，最後回落 `Thing`）/ 勝場 / 敗場。
 */
export function surrenderCardExtras(save: CampaignSave, data: GameData, name: string): SurrenderCardExtras {
  const extras: SurrenderCardExtras = {};
  const level = generalLevelOf(save, name);
  if (level !== null) extras.level = level;
  const morale = moraleOf(save, name);
  if (morale !== null) extras.morale = morale;
  const tire = tireOf(save, name);
  if (tire !== null) extras.tire = tire;
  const rec = generalRecordOf(save, name);
  if (rec) {
    extras.wins = rec.w;
    extras.losses = rec.l;
  }
  const equip = equipNamesOf(save, name);
  const weapon = equip.weapon || staticEquipOf(data, name, 'Weapon');
  if (weapon) extras.weapon = weapon;
  const item = equip.book || equip.amulet || staticEquipOf(data, name, 'Thing');
  if (item) extras.item = item;
  return extras;
}

/* ------------------------------------------------------------------------- */
/* 招降卡                                                                      */
/* ------------------------------------------------------------------------- */

/** 招降档位：必降 / 需掷骰 / 拒降（`capture.ts` 的 `recruitChanceOf()` 判出来） */
export type SurrenderTier = 'must' | 'roll' | 'refuse';

/** 玩家对一张卡的处置（`escape` 只对君主/批量放走有意义） */
export type SurrenderDecision = 'recruit' | 'kill' | 'release' | 'escape';

/**
 * 面板十欄裡「存檔不一定有」的那七項（`SurrenderCard` 的可選附加欄）。
 *
 * 每一項都照原作偏移與 web 同名鍵取值；**存檔沒有就不填**（`undefined`），
 * 面板畫灰「—」。絕不拿 0 / 60 之類的缺省值冒充真值。
 */
export interface SurrenderCardExtras {
  /** 等級（web `save.generalLevel[name]`，`campaign.html:1624`）；沒有就不填 */
  level?: number;
  /** 士氣（原作 `general+0x38`；web `save.morale[name]`）；沒有就不填，**不套 60** */
  morale?: number;
  /** 疲勞（原作 `general+0x3A`；web `save.tire[name]`）；沒有就不填，**不套 0** */
  tire?: number;
  /** 勝場（原作 `general+0x9F`；web `save.generalRecord[name].w`） */
  wins?: number;
  /** 敗場（原作 `general+0xA1`；web `save.generalRecord[name].l`） */
  losses?: number;
  /** 武器名（`equip[name].weapon` → 舊鏡像 `weapon[name]` → `generals.json` 的 `Weapon`） */
  weapon?: string;
  /** 物品名（`equip[name].book` → `.amulet` → 舊鏡像 `thing[name]` → `generals.json` 的 `Thing`） */
  item?: string;
}

/** 一张俘虏卡 / 君主卡（`surrenderCandidates()` 的输出，面板只读它） */
export interface SurrenderCard extends SurrenderCardExtras {
  name: string;
  str: number;
  int: number;
  /** 被俘当刻的忠诚（已按 `0x447520` 扣过 `(10-節操)*2`；君主不扣） */
  loyal: number;
  constancy: number;
  isKing: boolean;
  /** 这张卡从哪来：`captured` 预判可降 / `executed` 预判拒降被斩 / `king` 君主逃走 */
  from: 'captured' | 'executed' | 'king';
  /** 战斗页的预判结果（`from === 'captured'`） */
  predicted: boolean;
  /** 招降成功率 0..1（`capture.ts:recruitChanceOf`；rng 固定 0.5，只看档位） */
  chance: number;
  tier: SurrenderTier;
  tierText: string;
  /** 能不能点「招降」：只有预判成功的俘虏卡能点（君主/被斩永远 false） */
  recruitable: boolean;
  /** 档位原因（原作硬门原文，或 `本戰擲骰成功：成功率 …`） */
  reason: string;
}

/** `surrenderCandidates()` 的可选覆盖项（不给就自己从存档/守将表推） */
export interface SurrenderOpts {
  /** 该城守将名：只有剧本君主才出「逃走」卡 */
  atCity?: readonly string[];
  /** 我方在职武将名（这些人不出卡） */
  mine?: readonly string[];
  /** 我方君主名（他自己不出「逃走」卡） */
  king?: string;
}

/** `applySurrender()` 的结果（各类处置的名字清单） */
export interface SurrenderResult {
  recruited: string[];
  killed: string[];
  /** 从别的城名单里摘掉的名字（招降跨城去重） */
  removed: string[];
  escaped: string[];
  released: string[];
  /** 绕过硬门被按「放走」处理的名字（拒降档点了招降等） */
  rejected: string[];
  /** 本次真正落库（摘出待决名单）的名字 */
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
const NO_ROLL = (): never => {
  throw new Error('capture.ts 的招降判定不应在 roster 的招降面板里掷骰（0x44EBE2 只读预算结果）');
};

/** 与 `capture.ts` 里 `Side` 同名；招降方永远是胜方 */
const WINNER: Side = 'A';

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
  // Cocos 的 Babel 不能吃「for-of 的头是逻辑表达式」：`for (const x of a || b)` 会在
  // plugin-transform-for-of 的类型推断里崩（`Property types[1] of TSUnionType ... GenericTypeAnnotation`），
  // 而 tsc 全绿。提成常量即可（同 PUBLISH 清单里「三元式提成常量」那条坑）。
  const rows = (data?.scenarios ?? []) || [];
  for (const sc of rows) {
    const kings = sc?.kings ?? [];
    for (const k of kings) {
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
  const rows = (data?.generals ?? []) as GeneralRow[];
  return rows.find((g) => g && String(g.NAME ?? '') === name);
}

/**
 * 卡上的数值。`loyal` 复刻 `resolvePostBattle()` 里那行 `0x447520` 战败扣忠诚
 * `clamp(row.Loyal - (10-節操)*2, 0, 99)`（`capture.ts:363` 之后逐将内联）—— 面板显示
 * 的档位必须和引擎算的一致，否则 `project/89` 里的 程昱53/華佗84/張遼78/守將40 对不上。
 */
function statOf(
  data: GameData,
  name: string,
): { str: number; int: number; baseLoyal: number; loyal: number; constancy: number } {
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
function cardOf(data: GameData, name: string, from: 'captured' | 'executed', save: CampaignSave): SurrenderCard {
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
    // [R197] 十欄真值（存檔沒有就不填 → 面板畫「—」）
    ...surrenderCardExtras(save, data, name),
  };
}

/** 君主行：只给"逃走"，不给按钮（`0x40975E` 在处置入口就把他放走了） */
function kingCardOf(data: GameData, name: string, save: CampaignSave): SurrenderCard {
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
    // [R197] 君主也照同一套取值（士氣/疲勞/勝敗場同樣按名查，取不到就不填）
    ...surrenderCardExtras(save, data, name),
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
export function surrenderCandidates(save: CampaignSave, data: GameData, opts: SurrenderOpts = {}): SurrenderCard[] {
  const cards: SurrenderCard[] = [];
  const taken = new Set<string>();
  const executed = new Set(nameListOf((save as Record<string, unknown>)?.executed));
  const mine = new Set((opts.mine ?? []).map((n) => String(n ?? '')).filter(Boolean));
  const kingName = String(opts.king ?? '');
  const kings = new Set(kingsInScenario(data));
  const usable = (name: string): boolean =>
    !!name && !taken.has(name) && !mine.has(name) && name !== kingName && !isDead(save, name);
  // 君主就算被脏档写进 captured/executed，也只能出"逃走"卡（`0x40975E`）
  const emit = (name: string, from: 'captured' | 'executed'): void => {
    if (!usable(name)) return;
    taken.add(name);
    cards.push(kings.has(name) ? kingCardOf(data, name, save) : cardOf(data, name, from, save));
  };
  for (const name of nameListOf((save as Record<string, unknown>)?.captured)) {
    if (executed.has(name)) continue; // 以斩首为准，交给下面那趟
    emit(name, 'captured');
  }
  for (const name of nameListOf((save as Record<string, unknown>)?.executed)) {
    emit(name, 'executed');
  }
  const atCity = opts.atCity ?? [];
  for (const raw of atCity) {
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
function dropPending(save: CampaignSave, key: 'captured' | 'executed', names: readonly string[]): void {
  const box = save as Record<string, unknown>;
  const cur = box[key];
  if (!Array.isArray(cur)) return;
  const drop = new Set(names);
  box[key] = cur.filter((n) => !drop.has(String(n ?? '')));
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
  decisions: Readonly<Record<string, SurrenderDecision>>,
  homeCity: string,
): SurrenderResult {
  const wantRecruit: string[] = [];
  const wantKill: string[] = [];
  const wantRelease: string[] = [];
  const escaped: string[] = [];
  const rejected: string[] = [];
  const cleared: string[] = [];
  const cardList = cards ?? [];
  for (const card of cardList) {
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

  const lookup = new Map<string, SurrenderCard>((cards ?? []).map((c) => [String(c.name), c] as [string, SurrenderCard]));
  const post: PostBattleReport = {
    captures: wantRecruit.map((name) => {
      const c = lookup.get(name);
      return { name, str: c?.str ?? 0, int: c?.int ?? 0, loyal: c?.loyal ?? 0, recruited: true };
    }),
    executed: wantKill.map((name) => {
      const c = lookup.get(name);
      return { name, str: c?.str ?? 0, int: c?.int ?? 0, loyal: c?.loyal ?? 0, recruited: false };
    }),
    released: [],
    kingsEscaped: [],
    drops: [],
    expBonus: 0,
    meritBonus: 0,
  };
  const res =
    wantRecruit.length || wantKill.length ? applyPostBattle(save, post, homeCity) : { added: [], removed: [] };

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
  const cur = Array.isArray(box.released) ? (box.released as unknown[]) : [];
  const list = cur.map((n) => String(n ?? '')).filter(Boolean);
  const seen = new Set(list);
  for (const raw of names) {
    const name = String(raw ?? '');
    if (!name || seen.has(name)) continue;
    seen.add(name);
    list.push(name);
  }
  box.released = list;
}
