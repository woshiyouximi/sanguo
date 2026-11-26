/**
 * Cocos 侧的战役状态：`localStorage` 的替代实现 + 三屏之间的参数总线。
 *
 * 边界：
 *   - 只在 Cocos 侧使用；不引 game/web、不引第三方库。
 *   - 存档键与 web 版保持一致：`sanguo_campaign_v1`，结构为
 *     `{owned,wins,losses,month,gold,seeded,cities{}}`，方便以后两边互通。
 *   - 战斗规则仍在 `core/battle.ts`；本文件只负责"战役状态"和"出征参数"。
 */
import { director, sys } from 'cc';
import { advance as advanceMarch } from './core/march';
import type { Army } from './core/march';
import type { BattleRecord } from './core/battle';
import { GENERAL_RECORD_MAX } from './core/roster';
import type { ReinforceConfig } from './core/strategy';
import { clearRunScoped } from './core/run_scoped';
import { advanceOneMonth } from './core/advance_month';
import type { MonthContext, MonthCivicTick, MonthReport, MonthSaveLike } from './core/advance_month';
import {
  EQUIP_ITEMS_CACHE_KEY,
  EQUIP_SAVE_KEY,
  effectiveStatsOf,
  equipBagFromJson,
  equipNamesForGeneral,
  equipRowsFromJson,
  type EquipItemLike,
} from './core/equip_bonus';
import type { GameData, General } from './types';

export const SAVE_KEY = 'sanguo_campaign_v1';

/**
 * [F4] 單月推進調試開關（對照 web `campaign.html` 的 `?adv=1`）：
 * `sys.localStorage.setItem('sanguo_adv_single', '1')` 之後，「內 政 終 了」一次只走一個月，
 * 其餘情況走「跑完一年」。放在 localStorage 而不是命令行，是因為原生包沒有 URL 參數。
 */
export const ADV_SINGLE_KEY = 'sanguo_adv_single';

/**
 * 城內武將（`cities[城].officers` 的一項）。
 *
 * [OFFICER_OBJ] 三種歷史形狀都認（清洗見 `cityOfficersOf()`）：
 *   · `{name,str,int,loyal,status}` —— AiRunner 月回寫 / garrison.json 的物件形（現在的主形）；
 *   · `'張飛'`                      —— 更早的純名字檔（`stringArray()` 時代的 officers）；
 *   · 帶擴展鍵的物件                —— 劇本/模組多寫的欄位，[SAVES_V3] 之後原樣保留。
 *
 * 已知鍵強類型（下游 CityPanel/MonarchModel/AiModel 都靠這五個判在職與戰力），
 * 未知鍵靠索引簽名原樣帶過：存檔不做白名單過濾，否則「AI 回寫 → 下一次讀檔」就整批丟。
 * `status` 保留 `string | number`：garrison.json 是 '登'/'野'，AiModel 也可能寫數字 STATUS。
 */
export interface CityOfficer {
  name: string;
  str: number;
  int: number;
  loyal: number;
  status: string | number;
  [key: string]: unknown;
}

export interface CityRuntime {
  troops: number;
  pop: number;
  money: number;
  // [AI_PORTS] AI 月动作（AiModel/AiRunner）要读/写这几项：归属势力、太守、在城武将、
  // 城防。以前 CityRuntime 只有三项，normalize 会把它们洗掉，AI 每回合都当空城处理。
  owner?: string;
  major?: string;
  /**
   * [OFFICER_OBJ] 以前宣告成 `string[]`（配 `stringArray()` 白名單）：AiRunner 回寫的
   * `{name,str,int,loyal,status}` 物件會被整批濾掉 → 跨月人事丟失（project/106 §7.2）。
   * 現在是物件陣列，舊檔的純字串在 `normalize()` 裡補預設值。
   */
  officers?: CityOfficer[];
  DEFENSE?: number;
}

/**
 * [R102 部隊層] 部隊在存檔裏的完整形狀。
 *
 * `core/march.ts` 的 `Army` 是 web core 的同步產物（禁改），只認
 * `{id, side, from, to, pathIndex, progress, troops, general}`；R102 起多出
 * `officers / advisor / stationed / reported` 四個鍵（對應 web `campaign.html:1205`
 * 的 `normalizeArmyExtras()`）。這些鍵**必須存活在存檔裏**，否則駐紮與軍師一重載
 * 就沒了，所以 `CampaignSave.armies` 用這個型別而不是 `Army`。
 */
export type CampaignArmy = Army & {
  /** 隨軍武將（主將排第一、去重、上限 5）——「任命軍師」的名單來源 */
  officers?: string[];
  /** 軍師（必須是 `officers` 裏的人；`''` = 未任命） */
  advisor?: string;
  /** 駐紮：停在路上不動，擋住同段的敵軍（web `armyIsStationed`，campaign.html:1302） */
  stationed?: boolean;
  /** 已上報過（避免每月重複寫同一條對峙戰報） */
  reported?: boolean;
};

/**
 * [R197] 按武將記的勝/敗場（web `saves.js:836-909` 的 `save.generalRecord`）。
 *
 * 形狀與 web **逐字一致**：`{ 武將名: { w, l } }`，`w` = 勝場（原作 `general+0x9F`）、
 * `l` = 敗場（`+0xA1`）。**沒有記錄的將不在表裏** —— 面板靠這一點區分「0 勝 0 敗」
 * 與「根本沒打過」，所以讀檔函數（`core/roster.ts` 的 `generalRecordOf()`）無記錄時
 * 返回 `null` 而不是 `{w:0,l:0}`。
 */
export interface GeneralRecordRow {
  w: number;
  l: number;
}

export interface CampaignSave {
  owned: string[];
  wins: number;
  losses: number;
  /**
   * 当前连胜 / 历史最高连胜（core `battle.ts` R63 的 `BattleRecord.streak/bestStreak`）。
   * 旧存档没有这两键 → `normalize()` 兜 0；与 `wins/losses` 一起喂给 `createWorld({record})`，
   * 这样 `settle().record` 才是累计值而不是「每局从 0 起算」。
   */
  streak: number;
  bestStreak: number;
  month: number;
  /** 舊版單一錢包。**[F16] 遷移後恆為 0**，國庫 = Σ 每城 `money`（見 `nationalGold()`）。 */
  gold: number;
  /**
   * [F16] 「錢已遷移到每城 money」的標記（web `save.goldMigrated`，`city_model.js:786-894`）。
   * 舊檔沒有這個鍵 ⇒ 讀檔時做一次性遷移：`gold` → 首座我方城的 `money`，然後 `gold = 0`。
   */
  goldMigrated?: boolean;
  seeded: boolean;
  /**
   * 开局选择的指纹（`剧本序号:君主名`，由 `RunSetup` 生成）。
   * 只用来判断「换剧本/换君主时要重开一局」，旧档没有这个字段 → 视为未设置、不触发重置。
   */
  runKey?: string;
  cities: Record<string, CityRuntime>;
  /**
   * [R232] 攻城快照（抵達城下、正在戰前準備的那支部隊）。
   * 落盤是為了：① 戰前準備時被殺進程不丟兵；② `awayNameSet()` 能把這些將算作在途，
   * 避免再派第二支兵團時把第一支的將又列進候選。
   */
  siege?: DeploySiege;
  /** 大地圖上行軍中的部隊（我方 side 'A'、敵方 side 'B'）；與 web 的 `save.armies` 同形 */
  armies: CampaignArmy[];
  /** 部隊 id 的自增序號，對應 web 的 `save.armySeq` */
  armySeq: number;

  // [R197] 下面五個是 web v3 快照的可選鍵（`campaign.html:4917-4960 surFields()` 的資料源）。
  // 舊檔沒有這些鍵 → 整個鍵不落盤（`normalize()` 只在表非空時才寫），絕不補 0 / 60。
  /** 士氣 0..100（原作 `general+0x38`；web `save.morale`，戰後只回寫雙方主將） */
  morale?: Record<string, number>;
  /** 疲勞 0..100（原作 `general+0x3A`；web `save.tire`，戰後只回寫雙方主將） */
  tire?: Record<string, number>;
  /** 勝/敗場（原作 `general+0x9F` / `+0xA1`；web `save.generalRecord`） */
  generalRecord?: Record<string, GeneralRecordRow>;
  /** 等級（web `generalLevelOf()` 的存檔段 `save.generalLevel`；≥1，上限 99） */
  generalLevel?: Record<string, number>;
  /** 四槽裝備（v3 `save.equip[name][slot]`；web `equipSlotsOf()` 優先於舊鏡像） */
  equip?: Record<string, Record<string, string>>;
  /** 舊鏡像三表：武器 / 馬 / 物品（web `saves.js equipOf()`；面板只讀 `weapon`/`thing`） */
  weapon?: Record<string, string>;
  horse?: Record<string, string>;
  thing?: Record<string, string>;
}

/** 剧本 cities[] 的实际字段（types.ts 里 cities 是 unknown[]，这里补窄） */
export interface CampaignCity {
  NAME: string;
  KING?: string;
  POPULATION?: number;
  DEFENSE?: number;
  MONEY?: number;
  /** 關城 `RATE===0`（原作 FLAGS==2 的 12 座）；`isGateCity()` 用它判年稅/開發 */
  RATE?: number;
  pos_xy: [number, number];
}

export interface CampaignPath {
  Start: string;
  End: string;
  Length?: number;
  points?: [number, number][];
}

export interface CampaignScenario {
  cities: CampaignCity[];
  paths: CampaignPath[];
}

/**
 * 武将表里前端额外用到的字段。
 *
 * 注意：`SKILL` / `WISESKILL` 现在由 `types.ts` 统一声明为 `Array<[number, number]>`
 * （多值字段一律数组，1 条也是数组，见 project/08 §9.5）。这里**不能**再用
 * `string[]` 覆盖，否则 `extends General` 直接 TS2430；DeployRoot 只读 `.length`，
 * 数组形态照样能编译。
 */
export type CampaignGeneral = General;

/** 战斗页需要的全部参数（对应 web `?gen=&troop=&form=&soldiers=&bsoldiers=&bstr=&bint=`） */
export interface BattleLoadout {
  gen: string;
  troop: number;
  form: number;
  soldiers: number;
  btroop: number;
  bform: number;
  bsoldiers: number;
  bstr: number;
  bint: number;
  /** 主将属性由 GameState/DeployRoot 从 generals 表查好，战斗场景不用再查表 */
  genStr?: number;
  genInt?: number;
  genLevel?: number;
  /** 出發城（web deploy.html 的 `?from`）：主將候選從這座城出，守軍也按它算 */
  home?: string;
  /** 軍師技序號（`wises.json` 的 SEQUENCE）；null / 缺省 = 不用 */
  wise?: number | null;
  /** 敵方主將名（web 的 `bgen`）；缺省時 BattleRoot 顯示「守將」 */
  bgen?: string;
  /**
   * 這一場是不是「守城戰」（web 的 `?defend=1`）。
   *
   * 為 true 時 `city` 是我方城、A 方是守方，B 方是正在行軍的敵軍；戰鬥結算走
   * `recordBattleResult(city, winner, armyId)`：守方輸了要丟城、敵軍部隊兩邊都要撤。
   */
  defend?: boolean;
  /** 來襲部隊的 id（`save.armies[].id`），用於戰後把它從地圖上撤掉 */
  armyId?: string;
  /**
   * 地形序號（0..11，`terrains.json` 的 `_index`；web 側是 `?terrain=N`）。
   *
   * 它同时决定三件事，三者都只读不写：战场底图（`bg/orig/<kind><NN>`）、
   * 天气初值（`core/weather.ts` 的 `weatherOf(month, terrain)`）、BGM 曲目（`TERRAIN_TRACK`）。
   * 缺省 0 = 城郭。剧本 `cities[]` 目前不带地形字段，只能由调用方显式给。
   */
  terrain?: number;
  /**
   * 直接指定天气 0..3（晴/雨/雪/雾），web 是 `?weather=N`。
   * 缺省只在 `month + terrain` 推（`core/weather.ts` 的 `weatherOf()`），不传 = 沿用旧行为。
   */
  weather?: number;
  /** 敵方（B 側）軍師技序號（web 的 `?bwise=`）；戰前生效並在戰中派發，null/缺省 = 不帶 */
  bwise?: number | null;
  /**
   * 援軍配置（core `strategy.ts` 的 `ReinforceConfig`，web 的 `?rfrom=&rcity=&rrario=` 那组参数）。
   * 缺省不配 = 没有援军，既有对局一位不变。
   */
  reinforce?: ReinforceConfig[];
  /**
   * 車輪戰名冊（R22x）：雙方出陣順序，第 0 位 = 本場先發。
   *
   * 原作戰前是**手動淘汰制**：打完一場回戰前面板，玩家點下一位再打。名冊缺省
   * （單將對局）時行為與以前一位不變——一場定勝負。
   */
  rosterA?: string[];
  rosterB?: string[];
  /** 本場上場者在名冊里的下标；缺省 0 */
  indexA?: number;
  indexB?: number;
  /**
   * 連場繼承：勝方下一場帶走的殘餘（HP/技力/存活兵）。只在車輪戰內部流轉，
   * 由 `BattleRoot` 結算時填；單場對局不看。
   */
  carryA?: DuelCarry | null;
  carryB?: DuelCarry | null;
}

/** 車輪戰一方的殘餘狀態（勝者續戰時帶進下一場） */
export interface DuelCarry {
  hp: number;
  mp: number;
  soldiers: number;
}

export interface BattleLaunch extends BattleLoadout {
  city: string;
  seed: number;
  from: 'campaign';
}

let cached: CampaignSave | null = null;
let deployTarget: string | null = null;
let deployFrom: string | null = null;
let pendingLaunch: BattleLaunch | null = null;

function recordOf(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

/** 武將狀態：字串原樣；有限數字（原作的 2/8 STATUS）原樣；其餘按「登用」 */
function officerStatusOf(value: unknown): string | number {
  if (typeof value === 'string') return value || '登';
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  return '登';
}

/**
 * [OFFICER_OBJ] 單項武將清洗。
 *   · 純字串（舊檔）→ `{name, str:0, int:0, loyal:0, status:'登'}`；
 *   · 物件 → 已知鍵強類型（缺/壞值補 0 或 '登'），**未知鍵原樣保留**（`{...rec}` 起手）；
 *   · 沒有名字 / 不是物件也不是字串 → `null`（丟掉該項，但不影響同陣列其他項）。
 */
export function cityOfficerOf(value: unknown): CityOfficer | null {
  if (typeof value === 'string') {
    const name = value.trim();
    return name ? { name, str: 0, int: 0, loyal: 0, status: '登' } : null;
  }
  const rec = recordOf(value);
  if (!rec) return null;
  const name = typeof rec.name === 'string' ? rec.name : '';
  if (!name) return null;
  // 先整份複製再覆寫：模組/新版本多帶的鍵不會因為「這裡只認 5 個」而消失。
  const out = { ...rec } as CityOfficer;
  out.name = name;
  out.str = Math.trunc(numberOr(rec.str, 0));
  out.int = Math.trunc(numberOr(rec.int, 0));
  out.loyal = Math.trunc(numberOr(rec.loyal, 0));
  out.status = officerStatusOf(rec.status);
  return out;
}

/**
 * [OFFICER_OBJ] 武將清單清洗（`cities[*].officers` / AI 回寫的 `AiOfficer[]` 都走這裡）。
 * 舊檔的純字串補預設值；物件保留未知鍵；同名不去重（城內同名在資料層就是異常，交給下游顯示）。
 */
export function cityOfficersOf(value: unknown): CityOfficer[] {
  if (!Array.isArray(value)) return [];
  const out: CityOfficer[] = [];
  for (const item of value) {
    const officer = cityOfficerOf(item);
    if (officer) out.push(officer);
  }
  return out;
}

/** `CityRuntime` 的已知鍵：normalize 已經按強類型寫過，未知鍵才需要原樣搬過去 */
const CITY_KNOWN_KEYS = ['troops', 'pop', 'money', 'owner', 'major', 'officers', 'DEFENSE'];

/** 隨軍武將上限（web `ARMY_MAX_OFFICERS = 5`，campaign.html:1250） */
export const ARMY_OFFICER_CAP = 5;

/** 進城後守軍上限（web `enterCity()` 的 600，campaign.html:2988） */
export const CITY_TROOP_CAP = 600;

function normalizeArmies(raw: unknown): CampaignArmy[] {
  if (!Array.isArray(raw)) return [];
  const out: CampaignArmy[] = [];
  for (const item of raw) {
    const row = recordOf(item);
    if (!row) continue;
    const from = typeof row.from === 'string' ? row.from : '';
    const to = typeof row.to === 'string' ? row.to : '';
    const id = typeof row.id === 'string' ? row.id : '';
    if (!id || !from || !to) continue;
    const pathIndex = Math.max(0, Math.floor(numberOr(row.pathIndex, 0)));
    const progress = Math.max(0, Math.min(1, numberOr(row.progress, 0)));
    const side: Army['side'] = row.side === 'A' ? 'A' : 'B';
    const army: CampaignArmy = {
      id,
      side,
      from,
      to,
      pathIndex,
      progress,
      troops: Math.max(0, Math.floor(numberOr(row.troops, 0))),
    };
    if (typeof row.general === 'string' && row.general) army.general = row.general;
    // [R102 部隊層] 隨軍武將 / 軍師 / 駐紮 / 已上報：與 web `normalizeArmyExtras()`
    // （campaign.html:1205）同一組規則 —— 主將補到最前、去重、上限 5；軍師不在名單
    // 就當未任命；`stationed` 只認嚴格 true。
    // 刻意**不** import ArmyLayer 的 `normalizeArmyExtras()`：那邊 `import 'cc'`，
    // 拉進來會讓 `work/cocos_officers85/build.mjs` 的「GameState.ts 只有 1 處 from 'cc'」
    // 斷言失敗，所以這 12 行是那支函式的精簡副本（兩邊行為由 project/186 §5 對表）。
    const officers: string[] = [];
    const pushOfficer = (value: unknown): void => {
      const name = typeof value === 'string' ? value.trim() : '';
      if (name && officers.indexOf(name) < 0) officers.push(name);
    };
    if (army.general) pushOfficer(army.general);
    if (Array.isArray(row.officers)) {
      for (const name of row.officers) pushOfficer(name);
    }
    if (officers.length > 0) army.officers = officers.slice(0, ARMY_OFFICER_CAP);
    const advisor = typeof row.advisor === 'string' ? row.advisor.trim() : '';
    if (advisor && officers.indexOf(advisor) >= 0) army.advisor = advisor;
    if (row.stationed === true) army.stationed = true;
    if (row.reported === true) army.reported = true;
    out.push(army);
  }
  return out;
}

/* [R197] web v3 快照的可選表清洗：壞行整條丟、空表不落鍵（**絕不**補 0 / 60 缺省）。 */

/** `normalize()` 先佔位再清洗的 8 個可選表（見該函式末尾的清理）。 */
const R197_TABLES = [
  'morale',
  'tire',
  'generalRecord',
  'generalLevel',
  'equip',
  'weapon',
  'horse',
  'thing',
] as const;

/** 名 → 有限整數（夾在 `[lo, hi]`）；布林/空串/非數整條丟。空表返 `undefined`。 */
function intMapOf(raw: unknown, lo: number, hi: number): Record<string, number> | undefined {
  const rec = recordOf(raw);
  if (!rec) return undefined;
  const out: Record<string, number> = {};
  for (const [name, value] of Object.entries(rec)) {
    const key = name.trim();
    if (!key || value === null || value === undefined || typeof value === 'boolean' || value === '') continue;
    const n = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(n)) continue;
    out[key] = Math.max(lo, Math.min(hi, Math.round(n)));
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 名 → 文字（trim 後非空才收）。空表返 `undefined`。 */
function textMapOf(raw: unknown): Record<string, string> | undefined {
  const rec = recordOf(raw);
  if (!rec) return undefined;
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(rec)) {
    const key = name.trim();
    const text = typeof value === 'string' ? value.trim() : '';
    if (!key || !text) continue;
    out[key] = text;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 名 → `{w,l}`（缺一個按 0，壞行整條丟——web `generalRowOf()` 同口徑）。空表返 `undefined`。 */
function generalRecordMapOf(raw: unknown): Record<string, GeneralRecordRow> | undefined {
  const rec = recordOf(raw);
  if (!rec) return undefined;
  const out: Record<string, GeneralRecordRow> = {};
  for (const [name, value] of Object.entries(rec)) {
    const key = name.trim();
    const row = recordOf(value);
    if (!key || !row) continue;
    out[key] = {
      w: Math.max(0, Math.min(GENERAL_RECORD_MAX, Math.floor(numberOr(row.w, 0)))),
      l: Math.max(0, Math.min(GENERAL_RECORD_MAX, Math.floor(numberOr(row.l, 0)))),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** 名 → 四槽裝備（只收非空字串；整行空則丟）。空表返 `undefined`。 */
function equipMapOf(raw: unknown): Record<string, Record<string, string>> | undefined {
  const rec = recordOf(raw);
  if (!rec) return undefined;
  const out: Record<string, Record<string, string>> = {};
  for (const [name, value] of Object.entries(rec)) {
    const key = name.trim();
    const slots = recordOf(value);
    if (!key || !slots) continue;
    const row: Record<string, string> = {};
    for (const [slot, raw] of Object.entries(slots)) {
      const slotKey = slot.trim();
      const text = typeof raw === 'string' ? raw.trim() : '';
      if (slotKey && text) row[slotKey] = text;
    }
    if (Object.keys(row).length > 0) out[key] = row;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalize(raw: unknown): CampaignSave {
  const obj = recordOf(raw) ?? {};
  const cities: Record<string, CityRuntime> = {};
  const rawCities = recordOf(obj.cities);
  if (rawCities) {
    for (const [name, value] of Object.entries(rawCities)) {
      const c = recordOf(value);
      if (!c) continue;
      const city: CityRuntime = {
        troops: Math.max(0, Math.floor(numberOr(c.troops, 0))),
        pop: Math.max(0, Math.floor(numberOr(c.pop, 0))),
        money: Math.max(0, Math.floor(numberOr(c.money, 0))),
      };
      // [AI_PORTS] 归属/太守/在城武将/城防照原样带过（AI 月动作用它们判敌我与兵力）。
      if (typeof c.owner === 'string') city.owner = c.owner;
      if (typeof c.major === 'string') city.major = c.major;
      // [OFFICER_OBJ] 物件陣列（AiRunner 月回寫 / garrison.json）與純字串（舊檔）都收；
      // 以前這裡是 `stringArray(c.officers)`，物件被整批濾掉 → 跨月人事丟失（project/106 §7.2）。
      // 空清單不寫鍵，免得老存檔無端多出一個 `officers: []`。
      if (Array.isArray(c.officers)) {
        const officers = cityOfficersOf(c.officers);
        if (officers.length > 0) city.officers = officers;
      }
      if (c.DEFENSE != null) city.DEFENSE = Math.max(0, Math.floor(numberOr(c.DEFENSE, 0)));
      // [SAVES_V3] 城市層級的未知鍵原樣帶過（頂層同一規則，見下面補鍵的循環）。
      // 已知鍵不搬：即使值非法也以強類型清洗結果為準，否則 normalize 會把壞值又放回去。
      const extra: Record<string, unknown> = {};
      for (const key of Object.keys(c)) {
        if (CITY_KNOWN_KEYS.indexOf(key) >= 0) continue;
        extra[key] = c[key];
      }
      Object.assign(city, extra);
      cities[name] = city;
    }
  }
  const out = {
    owned: stringArray(obj.owned),
    wins: Math.max(0, Math.floor(numberOr(obj.wins, 0))),
    losses: Math.max(0, Math.floor(numberOr(obj.losses, 0))),
    streak: Math.max(0, Math.floor(numberOr(obj.streak, 0))),
    bestStreak: Math.max(0, Math.floor(numberOr(obj.bestStreak, 0))),
    month: Math.max(1, Math.floor(numberOr(obj.month, 1))),
    gold: Math.max(0, Math.floor(numberOr(obj.gold, 1200))),
    goldMigrated: obj.goldMigrated === true,
    seeded: obj.seeded === true,
    runKey: typeof obj.runKey === 'string' ? obj.runKey : undefined,
    cities,
    armies: normalizeArmies(obj.armies),
    armySeq: Math.max(0, Math.floor(numberOr(obj.armySeq, 0))),
  } as CampaignSave & Record<string, unknown>;

  // [R197] web v3 的可選表（士氣/疲勞/勝敗場/等級/裝備）。只在表非空時落鍵：
  // 舊檔沒這些資料 → 鍵保持不存在（面板才畫得出「—」）。賦 `undefined` 的鍵在
  // `JSON.stringify` 裡會整條消失，同時也讓下面 SAVES_V3 的「原樣搬運」跳過它們
  // —— 否則壞形狀（`morale: 'x'`）會被原封不動放回存檔。
  out.morale = intMapOf(obj.morale, 0, 100);
  out.tire = intMapOf(obj.tire, 0, 100);
  out.generalRecord = generalRecordMapOf(obj.generalRecord);
  out.generalLevel = intMapOf(obj.generalLevel, 1, 99);
  out.equip = equipMapOf(obj.equip);
  out.weapon = textMapOf(obj.weapon);
  out.horse = textMapOf(obj.horse);
  out.thing = textMapOf(obj.thing);

  // [SAVES_V3] 白名单之外的键原样带过。web 侧快照升到 v3 后会写 year/ledger/generalStatus/
  // weapon/horse/thing 等字段；这里若只返回上面 11 个键，下一次保存就把它们吃掉（静默丢数据）。
  // 已知键仍走上面对应的清洗分支，损坏值不会漏进来。
  for (const key of Object.keys(obj)) {
    if (!(key in out)) out[key] = (obj as Record<string, unknown>)[key];
  }

  // [R197] 上面 8 個可選表是「先佔位再清洗」：清洗結果為 `undefined` 時鍵是存在的
  // （正好擋住 SAVES_V3 把壞形狀原樣搬回來），但那不是資料 —— 清掉，舊檔才不會
  // 平白無故多出 `morale` / `generalRecord` 這些鍵（`'morale' in save` 騙人）。
  for (const key of R197_TABLES) {
    if (out[key] === undefined) delete (out as Record<string, unknown>)[key];
  }
  return out;
}

/** 读存档（内存缓存；首次读 sys.localStorage）。损坏/隐私模式一律回默认值。 */
export function loadSave(): CampaignSave {
  if (cached) return cached;
  try {
    const raw = sys.localStorage.getItem(SAVE_KEY);
    cached = normalize(raw ? (JSON.parse(raw) as unknown) : null);
  } catch {
    cached = normalize(null);
  }
  // [F16] 舊檔「單一錢包」→「每城 money」的一次性遷移。
  // 放在讀檔這一層：CampaignRoot / CityPanel / 存檔槽任何入口讀到的都是遷移後口徑，
  // 不會出現「頂欄讀錢包、城內頁讀城錢」兩個數（web 已改，見 `city_model.js:786-894`）。
  migrateGoldInPlace(cached);
  return cached;
}

/**
 * [F16] 錢包 → 每城 money 的一次性遷移（就地改）。
 *
 * web 真源 `city_model.js:migrateGold()`：`goldMigrated === true` 直接回 `{moved:0}`；
 * 否則取 `owned` 裡第一座有定義的城，把錢包併進它的 `money`，然後 `save.gold = 0`、
 * `save.goldMigrated = true`（無論有沒有搬成功都打標記，避免下次重複搬）。
 * Cocos 的舊檔每城本來就有一個 `money`（開局照劇本 `MONEY` 給的），所以這裡是**加法**：
 * 錢包是一筆額外的現金，併進主城後總額不變。
 */
function migrateGoldInPlace(save: CampaignSave): { moved: number; to: string } {
  if (!save || save.goldMigrated === true) return { moved: 0, to: '' };
  const wallet = Math.max(0, Math.floor(Number(save.gold) || 0));
  let to = '';
  for (const name of save.owned) {
    if (save.cities[name]) {
      to = name;
      break;
    }
  }
  let moved = 0;
  if (to && wallet > 0) {
    const st = save.cities[to];
    if (st) {
      st.money = Math.max(0, Math.floor(Number(st.money) || 0)) + wallet;
      moved = wallet;
    }
  }
  save.gold = 0;
  save.goldMigrated = true;
  return { moved, to };
}

/** [F16] 對外的一次性遷移（冪等：第二次回 `{moved:0,to:''}`；讀檔時已自動跑過） */
export function migrateGold(): { moved: number; to: string } {
  const save = loadSave();
  const moved = migrateGoldInPlace(save);
  if (moved.moved > 0) persistSave();
  return moved;
}

/** [F16] 本城金（遷移後唯一可花的口袋） */
export function cityMoney(name: string): number {
  const save = loadSave();
  const st = save.cities[name];
  return st ? Math.max(0, Math.floor(Number(st.money) || 0)) : 0;
}

/** [F16] 國庫 = Σ 我方每城 money（web `CM.nationalGold()`）；未遷移時退回舊錢包 */
export function nationalGold(): number {
  const save = loadSave();
  if (!save.goldMigrated) return Math.max(0, Math.floor(Number(save.gold) || 0));
  let total = 0;
  for (const name of save.owned) total += cityMoney(name);
  return total;
}

/** [F16] 從本城扣錢；不夠回 false 且不動任何欄位（web `spendCityMoney`） */
export function spendCityMoney(name: string, cost: number): boolean {
  const save = loadSave();
  const need = Math.max(0, Math.floor(Number(cost) || 0));
  if (need <= 0) return true;
  if (!save.goldMigrated) {
    if (save.gold < need) return false;
    save.gold -= need;
    persistSave();
    return true;
  }
  const st = save.cities[name];
  if (!st) return false;
  const have = Math.max(0, Math.floor(Number(st.money) || 0));
  if (have < need) return false;
  st.money = have - need;
  persistSave();
  return true;
}

/** [F16] 把錢加進本城（退款用） */
export function addCityMoney(name: string, amount: number): void {
  const save = loadSave();
  const gain = Math.trunc(Number(amount) || 0);
  if (gain === 0) return;
  const st = save.cities[name];
  if (!st) return;
  st.money = Math.max(0, Math.floor(Number(st.money) || 0)) + gain;
  persistSave();
}

export function persistSave(): void {
  if (!cached) return;
  try {
    sys.localStorage.setItem(SAVE_KEY, JSON.stringify(cached));
  } catch {
    // 隐私模式 / 容量不足：静默，内存里的状态仍可用
  }
}

/**
 * 首次进入：按开局选择（剧本 + 君主）给城，并按剧本人口初始化每城兵/民/金。
 *
 * 开局选择由 `RunSetup` 提供（标题页 → 剧本页 → 君主页写入）：
 *   - `opts.key` 变化（换剧本或换君主）时整份战役存档作废，避免「上一个剧本的城 + 这一个剧本的君主」混档；
 *   - `opts.force` 有值时，该势力名下所有城都归玩家（对齐 web `campaign.html` 的换君主行为）；
 *   - 都没有时退回旧行为：前 3 座城。
 */
export function initCampaign(
  cities: CampaignCity[],
  opts?: { key?: string; force?: string; fresh?: boolean },
): CampaignSave {
  const save = loadSave();
  const key = opts?.key ?? '';
  // `fresh`：玩家在标题页按了「開始新局」——即使剧本与君主都没变，也要重开一局
  // （r86 的 P5：同剧本同君主再点一次时 `runKey` 不变，旧进度被原样继承）。
  const keyChanged = (key !== '' && save.runKey !== undefined && save.runKey !== key) || opts?.fresh === true;
  if (keyChanged) {
    save.owned = [];
    save.cities = {};
    save.seeded = false;
    // R214：新局必须把「上一局留下的战后状态」清干净，否则一进大地图就弹出
    // 「处置上一局的俘虏」面板（2026-11-26 用户实测：选《讨伐董卓》+ 刘备，进去先弹处置张角）。
    //
    // 键名单与判定口径统一放在 `core/run_scoped.ts`（纯函数、有 `game/tests/run_scoped.test.ts` 守门）：
    //   `captured` / `executed` —— `SurrenderModel.queuePostBattle()` 写的待决队列
    //   `lastBattle` / `lastPost` —— 上一场战果（判「同一场只处置一次」用）
    //   `roster`（含 `_moved`）/ `acted` / `away` —— 逐将在职、逐将年令、在途武将
    //   `armies` —— 行军中的部队（新局不该有）
    // 不清 `wins/losses/streak`：那是玩家战绩，跨局保留（与 web `saves.js` 的 legacy 计分同义）。
    clearRunScoped(save);
    // [R226b] 新局必須從 1 月起算：`month` 是存檔欄位，不歸 1 的話新局會接上一局的月份
    // （用戶實測：開新局進來已經是「第 2 年 1 月」）。年份由劇本起始年 + month 現算，不用另清。
    save.month = 1;
  }
  if (key !== '') save.runKey = key;
  if (!save.seeded) {
    const force = (opts?.force ?? '').trim();
    const mine = force ? cities.filter((c) => String(c.KING ?? '').trim() === force) : [];
    const grant = mine.length > 0 ? mine : cities.slice(0, 3);
    for (const city of grant) {
      if (!save.owned.includes(city.NAME)) save.owned.push(city.NAME);
    }
    save.seeded = true;
  }
  for (const city of cities) {
    if (save.cities[city.NAME]) continue;
    const pop = Math.max(0, Math.floor(city.POPULATION ?? 0));
    save.cities[city.NAME] = {
      troops: Math.min(600, Math.floor(pop / 2500) + 110),
      pop,
      money: Math.max(0, Math.floor(city.MONEY ?? 0)),
    };
  }
  persistSave();
  return save;
}

export function isOwned(name: string): boolean {
  return loadSave().owned.includes(name);
}

/**
 * 关城判定（与 `CityModel.isGate()` 同义：`RATE===0 || POPULATION===0`）。
 *
 * 本地重写一份而不是 import，是为了避免 `GameState ↔ CityModel` 的循环依赖：
 * `CityModel` 已经在多处 import `GameState` 的存档读写。两处判定口径必须一起改。
 */
export function isGateCity(city: { RATE?: number; POPULATION?: number } | null | undefined): boolean {
  if (!city) return false;
  return Number(city.RATE) === 0 || Number(city.POPULATION) === 0;
}

export function cityRuntime(name: string): CityRuntime {
  const save = loadSave();
  const existing = save.cities[name];
  if (existing) return existing;
  const created: CityRuntime = { troops: 110, pop: 0, money: 0 };
  save.cities[name] = created;
  return created;
}

/** 守军规模：与 web deploy.html 同一条公式，保证两套客户端口径一致。 */
export function garrisonOf(city: CampaignCity): number {
  return Math.min(Math.floor((city.POPULATION ?? 0) / 2500) + 110, 600);
}

/** 从任意我方城出发的 BFS 道路数；`Length >= 30000` 是原作哨兵，不算可走。 */
export function distanceFromOwned(target: string, paths: CampaignPath[]): number {  const save = loadSave();
  const adj = new Map<string, Set<string>>();
  for (const path of paths) {
    if ((path.Length ?? 0) >= 30000) continue;
    if (!adj.has(path.Start)) adj.set(path.Start, new Set());
    if (!adj.has(path.End)) adj.set(path.End, new Set());
    adj.get(path.Start)?.add(path.End);
    adj.get(path.End)?.add(path.Start);
  }
  const seen = new Set(save.owned);
  let frontier = save.owned.slice();
  let distance = 0;
  while (frontier.length > 0 && distance < 30) {
    if (frontier.includes(target)) return distance;
    const next: string[] = [];
    for (const name of frontier) {
      // 先落變數再 for-of：`for (const x of a ?? [])` 這種「邏輯式當 for-of 頭」的寫法
      // 會踩到 Creator 的 Babel（`TSUnionType expected TSType`），全專案一律拆開。
      const links = adj.get(name);
      if (!links) continue;
      for (const neighbor of links) {
        if (seen.has(neighbor)) continue;
        seen.add(neighbor);
        next.push(neighbor);
      }
    }
    frontier = next;
    distance += 1;
  }
  return 99;
}

/**
 * 离目標最近的我方城（BFS 父節點回溯）。
 *
 * web 版出征是 `?city=<目標>&from=<出發城>`；Cocos 沒有 URL，就用這條回溯算：
 * 從所有我方城同時擴散，記 parent，最後從目標倒着走回我方城。走不到（`Length>=30000`
 * 的哨兵路徑全斷）時返回 null，DeployRoot 再退回 `save.owned[0]`。
 */
export function nearestOwnedTo(target: string, paths: CampaignPath[]): string | null {
  const save = loadSave();
  if (save.owned.includes(target)) return target;
  const adj = new Map<string, Set<string>>();
  for (const path of paths) {
    if ((path.Length ?? 0) >= 30000) continue;
    if (!adj.has(path.Start)) adj.set(path.Start, new Set());
    if (!adj.has(path.End)) adj.set(path.End, new Set());
    adj.get(path.Start)?.add(path.End);
    adj.get(path.End)?.add(path.Start);
  }
  const parent = new Map<string, string | null>();
  const queue = save.owned.slice();
  for (const name of queue) parent.set(name, null);
  while (queue.length > 0) {
    const name = queue.shift() as string;
    // 同上：先落變數再 for-of，避免「邏輯式當 for-of 頭」的 Babel 崩潰。
    const links = adj.get(name);
    if (!links) continue;
    for (const neighbor of links) {
      if (parent.has(neighbor)) continue;
      parent.set(neighbor, name);
      if (neighbor === target) {
        let cursor: string | null = name;
        while (cursor !== null && !save.owned.includes(cursor)) cursor = parent.get(cursor) ?? null;
        return cursor ?? name;
      }
      queue.push(neighbor);
    }
  }
  return null;
}

/**
 * [F4] 「內 政 終 了」要跑幾個月才到次年正月。
 *
 * web 真源：`web/campaign.html:2517-2533 endMonth()` → `advanceMonth(12)`，
 * 註釋（2504-2516）寫的是「結束內政＝進大地圖跑時間」；`advanceMonth(n)` 的循環體
 * （5389-5558）逐月 `save.month += 1` → 年稅 → AI 行軍 → 事件。
 *
 * 原作月份是 1..12 循環（`Saves.isYearStart(m) = (m-1)%12===0`），所以：
 *   · 正月（1 月）按下去 = 跑滿一整年 → 12 個月，落回次年正月；
 *   · 其它月份（單月調試或中途） = 補到次年正月，`12 - (m-1)%12` 個月。
 * 純函數，方便 `node --test` 直接驗（`game/tests/cocos_p1_port.test.ts`）。
 */
export function monthsToNextJanuary(month: number): number {
  const n = Math.floor(Number(month));
  const m = Number.isFinite(n) && n > 0 ? n : 1;
  return 12 - ((m - 1) % 12);
}

/** [F4] 單月調試開關是否打開（見 `ADV_SINGLE_KEY`）。 */
export function advSingleMonth(): boolean {
  try {
    return sys.localStorage.getItem(ADV_SINGLE_KEY) === '1';
  } catch {
    return false;
  }
}

/** [F4] 「內 政 終 了」實際要跑的月數：正常 = `monthsToNextJanuary()`，調試 = 1。 */
export function advanceSteps(month: number): number {
  return advSingleMonth() ? 1 : monthsToNextJanuary(month);
}

/**
 * [F-03 / F-14] 月推進內政橋：Cocos 的城內政狀態（`prep` / `auto` / `autoMonth` / `roster`）不在這份
 * 戰役存檔裏，而在 `CityPanel.CITY_EXTRAS_KEY='sanguo_city_v1'` 那個獨立鍵（F-09「存檔容器分裂」）；
 * `GameState.advanceMonth()` 又必須是同步函數（`CampaignRoot.endInterior()` 逐月調）。
 *
 * 所以月流水走 core 單源 `core/advance_month.ts`：`data` 給年稅關城判定 / 月末補學用，
 * `civic` 由 `CityPanel` 打開時註冊（mergeSave → `M.autonomyTick` → persist）。
 * **沒註冊也不報錯**：core 會降級成「只推月/年結算，自治代行跳過」，並在
 * `MonthReport.civic.mode === 'skipped'` 裏明說，不靜默。
 */
export interface CityMonthBridge {
  /** 武將/物品數據（`CampaignRoot.this.data`）：月末補學要 generals.json 的 SKILL/WISESKILL。 */
  data?: GameData | null;
  /** 自治代行回調（CityPanel 註冊）：每月搜索/開發代行 + 金→預備兵。 */
  civic?: MonthCivicTick | null;
  /** 在職武將（缺省時 core 從 `save.cities[*].officers` 取）。 */
  officersByCity?: Record<string, readonly string[]> | null;
}

let cityMonthBridge: CityMonthBridge | null = null;
const monthReportLog: MonthReport[] = [];

/** 註冊/更新內政橋（`CityPanel.open()` 調；傳 null 取消）。 */
export function setCityMonthBridge(bridge: CityMonthBridge | null): void {
  cityMonthBridge = bridge;
}

/** 取消內政橋（換局/退出內政頁時可調；不調也不影響存檔）。 */
export function clearCityMonthBridge(): void {
  cityMonthBridge = null;
}

/** 是否已掛上內政橋（`MonthReport.civic.mode` 的最終依據仍是 core 的實際結果）。 */
export function hasCityMonthBridge(): boolean {
  return !!cityMonthBridge;
}

/** 最近 12 個月的推進報告（戰報/對帳用；只留最近 12 條）。 */
export function lastMonthReports(): MonthReport[] {
  return monthReportLog.slice();
}

/** 最近一個月的推進報告（沒有則 null）。 */
export function lastMonthReport(): MonthReport | null {
  return monthReportLog.length ? monthReportLog[monthReportLog.length - 1] : null;
}

/**
 * 月推进：换月 + 年度税 + 年度结算（正月）+ 自治代行 + 疲劳/士气/补学。
 *
 * **单源**：全部逻辑在 `core/advance_month.ts`（F-03/F-04/F-14），本函数只负责
 * ① 从存档拿 `save`、② 把 `cities` / bridge 拼成 `MonthContext`、③ `persistSave()` 并回傳稅入。
 * 与 web `campaign.html advanceMonth()` 调用的是同一个 `advanceOneMonth()`。
 *
 * 不再做的事：`GameState.ts:854-862` 那段「所有城每月白補守軍 2%」已刪（web 側 F14 已刪，
 * 原作換月不補守軍；兵只有徵兵 / 出征帶回 / AI 補兵三個來源）。
 *
 * @param cities 劇本全城定義（年稅判關城、population 上限用）
 * @param opts   `{ data }`：`CampaignRoot` 把 `this.data` 傳進來；不傳時退到 bridge 的 data
 * @returns 本月稅入（正月才有，其餘月份 0），與舊返回值同義
 */
export function advanceMonth(cities: CampaignCity[], opts: { data?: GameData | null } = {}): number {
  const save = loadSave();
  const bridge = cityMonthBridge;
  const ctx: MonthContext = {
    cityDefs: cities,
    data: opts.data ?? bridge?.data ?? null,
    civic: bridge?.civic ?? null,
    officersByCity: bridge?.officersByCity ?? null,
    ts: Date.now(),
  };
  const report = advanceOneMonth(save as unknown as MonthSaveLike, ctx);
  monthReportLog.push(report);
  if (monthReportLog.length > 12) monthReportLog.shift();
  persistSave();
  return report.income;
}

export function recruit(name: string): { ok: boolean; message: string } {
  const save = loadSave();
  const state = cityRuntime(name);
  // [F16] 錢只看本城：徵兵從這座城的 money 扣，國庫只是各城之和（web `spendCityMoney` 同口徑）。
  const own = Math.max(0, Math.floor(Number(state.money) || 0));
  if (own < 500) return { ok: false, message: `${name}：金不足（徵兵要 500 金，本城 ${own}）。` };
  state.money = own - 500;
  state.troops = Math.min(600, state.troops + 40);
  persistSave();
  return { ok: true, message: `${name}：兵 +40（${state.troops}）` };
}

export function develop(name: string): { ok: boolean; message: string } {
  const save = loadSave();
  const state = cityRuntime(name);
  // [F16] 同上：開發扣本城 money，不動 `save.gold`。
  const own = Math.max(0, Math.floor(Number(state.money) || 0));
  if (own < 400) return { ok: false, message: `${name}：金不足（開發要 400 金，本城 ${own}）。` };
  state.money = own - 400;
  state.pop += 3000;
  persistSave();
  return { ok: true, message: `${name}：民 +3000（${state.pop}）` };
}

export function setDeployTarget(name: string): void {
  deployTarget = name;
}
export function takeDeployTarget(): string | null {
  const target = deployTarget;
  deployTarget = null;
  return target;
}

/**
 * 出征/守城戰的敵情（`EnemyIntel.resolveEnemyIntel()` 的結果）。
 *
 * 這條總線是 task「敵將 守將（武 0 / 智 0）」的正解：以前只有出發城走
 * `setDeployFrom()`，敵情靠 DeployRoot 自己再查一遍表，兩邊可能算出不同答案；
 * 現在由**大地圖（出征/守城發起點）**先算好，編成屏原樣顯示，BattleRoot 原樣使用。
 */
export interface DeployEnemy {
  name: string;
  str: number;
  int: number;
  troops: number;
  defense: number;
  /** true = 數據裏沒有守將，由城防折算成「守備隊」 */
  fallback: boolean;
  owner: string;
}

let deployEnemy: DeployEnemy | null = null;
/** 守城戰時非空：來襲部隊的 id（戰後要從 `save.armies` 撤掉） */
let deployArmy: string | null = null;

export function setDeployEnemy(enemy: DeployEnemy | null): void {
  deployEnemy = enemy;
}

export function takeDeployEnemy(): DeployEnemy | null {
  const enemy = deployEnemy;
  deployEnemy = null;
  return enemy;
}

export function setDeployArmy(id: string | null): void {
  deployArmy = id;
}

export function takeDeployArmy(): string | null {
  const id = deployArmy;
  deployArmy = null;
  return id;
}

/** 記錄出發城（web 的 `?from`）；DeployRoot 用它在「這座城出的武將」裏挑主將。 */
export function setDeployFrom(name: string | null): void {
  deployFrom = name;
}

/** 取一次出發城；第二屏消費掉，避免下次編成沿用上一場的城。 */
export function takeDeployFrom(): string | null {
  const from = deployFrom;
  deployFrom = null;
  return from;
}

/**
 * 兵團出征的「編成」態（web campaign.html：出征 → 編成 → 出發）。
 *
 * 以前大地圖按出征是直接 `dispatchArmyTo()` 派兵，玩家沒機會選將/排順序；
 * 現在改成先記下出發城/目標/路徑再進 Deploy 場景，由編成屏的 5 槽隊列派兵。
 */
export interface DeployMarch {
  from: string;
  target: string;
  pathIndex: number;
}

let deployMarch: DeployMarch | null = null;

export function setDeployMarch(m: DeployMarch | null): void {
  deployMarch = m;
}

export function peekDeployMarch(): DeployMarch | null {
  return deployMarch;
}

export function clearDeployMarch(): void {
  deployMarch = null;
}

/**
 * [R231] 抵達敵城/關卡的「攻城戰前準備」快照。
 *
 * 兵團走到目標後會先 `removeArmy()` 再進 Deploy；編成屏必須用這份快照把剛抵達的
 * 主將/隨軍/兵數/armyId 原樣帶進 Battle，而不是讓玩家從出發城重新派一支新兵團
 * （重派 → 新兵團再走一次 → 再進編成，就是「到達一次彈一次」的循環）。
 */
export interface DeploySiege {
  from: string;
  target: string;
  pathIndex: number;
  armyId: string;
  general: string;
  officers: string[];
  troops: number;
  advisor?: string;
}

/**
 * [R232] 攻城快照**落盤**（`save.siege`），不再只存內存。
 *
 * 兩個原因：
 *   1. 抵達時兵團已經 `removeArmy()` 落盤，若快照只在內存，戰前準備屏被殺進程就丟兵；
 *   2. `awayNameSet()`（`OfficersOfCity` / `CityModel`）要能把「正在攻城的將」算作在途，
 *      否則從城裡再派第二支兵團時，第一支的將還會出現在候選名單裡
 *      （制作人實測：第二支的編成屏出現「我這支隊伍＋前一支的武將」）。
 */
let deploySiege: DeploySiege | null = null;

export function setDeploySiege(siege: DeploySiege | null): void {
  deploySiege = siege;
  const save = loadSave();
  if (siege) save.siege = siege;
  else delete save.siege;
  persistSave();
}

export function peekDeploySiege(): DeploySiege | null {
  if (deploySiege) return deploySiege;
  const save = loadSave();
  return save.siege ?? null;
}

export function clearDeploySiege(): void {
  deploySiege = null;
  const save = loadSave();
  if (save.siege) {
    delete save.siege;
    persistSave();
  }
}

/**
 * [R231] 放棄攻城：把抵達兵團的兵退回出發城。
 *
 * 與 web `campaign.html` 的 `refundArmy()` 同口徑：
 * `cities[from].troops = min(cap, troops + army.troops)`（cap 預設 600，即 CITY_TROOP_CAP）。
 * 部隊在抵達時就已經 `removeArmy()`，這裡只回寫兵數；出發城不在存檔就返回 0。
 */
export function refundSiegeTroops(from: string, troops: number, cap = CITY_TROOP_CAP): number {
  const save = loadSave();
  const state = save.cities[from];
  if (!state) return 0;
  const before = Math.max(0, Math.floor(numberOr(state.troops, 0)));
  const add = Math.max(0, Math.floor(numberOr(troops, 0)));
  state.troops = Math.min(Math.max(0, Math.floor(cap)), before + add);
  persistSave();
  return state.troops - before;
}

/**
 * 編成屏按「出征」：用選好的隊列派一支兵團。
 *
 * `general` = 第 1 槽（主將），`officers` = 其餘槽（隨軍，最多 4 人）；
 * `troops` = 本次帶走的兵，夾在出發城現有守軍內。成功回 true。
 */
export function dispatchMarch(general: string, officers: string[], troops: number): boolean {
  const march = deployMarch;
  if (!march) return false;
  const save = loadSave();
  const state = save.cities[march.from];
  if (!state) return false;
  const taken = Math.max(0, Math.min(Math.round(troops), Math.round(state.troops)));
  if (taken < 1) return false;
  const id = nextArmyId('A');
  const army: CampaignArmy = {
    id,
    side: 'A',
    from: march.from,
    to: march.target,
    pathIndex: march.pathIndex,
    progress: 0,
    troops: taken,
    general: general || undefined,
    officers: officers.filter((name) => !!name).slice(0, 4),
    advisor: '',
    stationed: false,
  };
  addArmy(army);
  state.troops = Math.max(0, Math.round(state.troops - taken));
  persistSave();
  deployMarch = null;
  return true;
}

/**
 * 讀裝備加成用的兩份 localStorage 資料（F-05）：
 *   - `sanguo_equip_items_v1`：物品表快照（`ItemsPanel.open()` 寫入的 `data/items` 列）；
 *   - `sanguo_items_v1`：物品存檔 `{equip:{名:{槽:Sequence}}, bag}`（裝備的權威來源）。
 *
 * 為什麼走快照而不是 `DataLoader`：`loadGameData()` 只有 Promise、沒有同步 peek，而
 * `startBattle()` 是同步函數且 `BattleRoot` 進場就要參數；快照由唯一持有整張物品表的
 * 物品頁寫入，跨場景/跨會話都在。兩份都缺 / 壞檔 / 沒開過物品頁 → 空資料、加成 0。
 */
function readEquipBattleItems(): EquipItemLike[] {
  try {
    return equipRowsFromJson(sys.localStorage.getItem(EQUIP_ITEMS_CACHE_KEY));
  } catch {
    return [];
  }
}

function readEquipBattleBag(): unknown {
  try {
    return equipBagFromJson(sys.localStorage.getItem(EQUIP_SAVE_KEY));
  } catch {
    return null;
  }
}

/**
 * 把主將的裝備加成算進出征參數（F-05）。
 *
 * 公式（四槽累加、五屬性投影、`max(0, trunc(base)+trunc(bonus))`）在
 * `core/equip_bonus`，與 web `items_model.js` / `campaign.html` 同源，這裡不另寫算法。
 * `BattleRoot` 只讀 `genStr/genInt/genLevel`（沒有 hp/mp 欄位），所以只覆寫武力/智力；
 * 原本是 `undefined` 的欄位保持 `undefined`（`BattleRoot` 自己有 80/60 回退），
 * 不要用「原值 + 0」把那份回退語義改掉。
 */
function applyEquipBonus(launch: BattleLaunch): BattleLaunch {
  if (typeof launch.genStr !== 'number' && typeof launch.genInt !== 'number') return launch;
  const items = readEquipBattleItems();
  if (items.length === 0) return launch;
  const names = equipNamesForGeneral(launch.gen, loadSave(), items, readEquipBattleBag());
  const stats = effectiveStatsOf({ str: launch.genStr, int: launch.genInt }, names, items);
  if (typeof launch.genStr === 'number') launch.genStr = stats.str;
  if (typeof launch.genInt === 'number') launch.genInt = stats.int;
  return launch;
}

/**
 * 三屏之间的唯一"导航"入口。
 *
 * Cocos 的 scene 不能像浏览器一样在 URL 上带参，所以这里先把 BattleLaunch 放进
 * 模块内存，再 loadScene('Battle')；BattleRoot.start() 用 consumeBattleLaunch()
 * 取一次。场景名 'Battle' / 'Campaign' / 'Deploy' 由工程里的 .scene 名决定。
 */
export function startBattle(target: string, loadout: BattleLoadout): BattleLaunch {
  const launch: BattleLaunch = {
    ...loadout,
    city: target,
    seed: 20261124,
    from: 'campaign',
  };
  applyEquipBonus(launch);
  pendingLaunch = launch;
  director.loadScene('Battle');
  return launch;
}

/** BattleRoot 只调用一次；二次调用返回 null，避免重开时复用旧参数。 */
export function consumeBattleLaunch(): BattleLaunch | null {
  const launch = pendingLaunch;
  pendingLaunch = null;
  return launch;
}

/**
 * 大地圖行軍的狀態讀寫（對齊 web campaign.html 的 `save.armies` / `save.armySeq`）。
 *
 * 這一組只在 Cocos 側用；`core/march.ts` 仍是純邏輯（路徑、進度、相遇），
 * 這裏只負責"存在存檔裏 + 每月推一格"。
 */
export function armies(): CampaignArmy[] {
  return loadSave().armies;
}

/** 部隊 id：`m<月>-<陣營><序號>`，與 web 的 `nextArmyId()` 同形 */
export function nextArmyId(side: Army['side']): string {
  const save = loadSave();
  save.armySeq += 1;
  return `m${save.month}-${side}${save.armySeq}`;
}

export function addArmy(army: Army): void {
  const save = loadSave();
  if (!army.id || save.armies.some((existing) => existing.id === army.id)) return;
  save.armies.push(army);
  persistSave();
}

export function removeArmy(id: string): boolean {
  const save = loadSave();
  const before = save.armies.length;
  save.armies = save.armies.filter((army) => army.id !== id);
  const changed = save.armies.length !== before;
  if (changed) persistSave();
  return changed;
}

/** 正在開往某城的部隊（含已經到城下的）；`side` 省略 = 兩邊都要 */
export function armiesTo(city: string, side?: Army['side']): CampaignArmy[] {
  return loadSave().armies.filter((army) => army.to === city && (!side || army.side === side));
}

/** 已到城下的部隊（`progress >= 1`）——守城戰的觸發條件 */
export function arrivedAt(city: string, side?: Army['side']): CampaignArmy[] {
  return loadSave().armies.filter(
    (army) => army.to === city && army.progress >= 1 && (!side || army.side === side),
  );
}

/**
 * 推進所有部隊一個月。`speed=3` 表示「這條路短，一個月到」，
 * 與 `core/march.ts` 的倍率約定一致（見該文件開頭）。
 */
export function marchArmies(speed = 3): { arrived: Army[]; still: Army[] } {
  const save = loadSave();
  if (save.armies.length === 0) return { arrived: [], still: [] };
  const result = advanceMarch(save.armies, speed);
  save.armies = [...result.still, ...result.arrived];
  persistSave();
  return result;
}

/**
 * [R102 部隊層] 逐支寫回行軍進度 —— `ArmyLayer.planArmyMoves()` 的結果落到存檔的唯一入口。
 *
 * 為什麼不用 `marchArmies()`：那支走 `core/march.ts` 的 `advance()`，只會「齊頭加一格」，
 * 沒有駐紮凍結、也沒有同段阻擋夾點（core 是 web 同步目錄，禁改）。駐紮那套規則在
 * `ArmyLayer.planArmyMoves()`（web `campaign.html:1346` 的移植），算完把每支的
 * `next` 交給這裏寫回。
 *
 * **不重排**（`marchArmies` 會把 arrived 挪到最後）：部隊層的重疊錯開是「按列表順序」
 * 排九宮格的，一重排就會讓同一份存檔的旗子換位置。順序穩定＝畫面穩定。
 */
export function applyArmyProgress(moves: readonly { id: string; progress: number }[]): number {
  if (!Array.isArray(moves) || moves.length === 0) return 0;
  const save = loadSave();
  const table = new Map<string, number>();
  for (const move of moves) {
    if (!move || typeof move.id !== 'string') continue;
    table.set(move.id, Math.max(0, Math.min(1, numberOr(move.progress, 0))));
  }
  let changed = 0;
  for (const army of save.armies) {
    const next = table.get(army.id);
    if (next === undefined) continue;
    if (Math.abs(next - army.progress) <= 1e-9) continue;
    army.progress = next;
    changed += 1;
  }
  if (changed > 0) persistSave();
  return changed;
}

/** [R102] 取一支在途部隊（找不到 → null） */
export function armyOf(id: string): CampaignArmy | null {
  const army = loadSave().armies.find((row) => row.id === id);
  return army ?? null;
}

/**
 * [R102 部隊層] 改一支部隊的欄位：駐紮 / 軍師 / 改道 / 進度 / 隨軍名單。
 *
 * 只覆蓋 `patch` 裏真的有給的鍵 —— 傳 `undefined` 當「不改」，所以「清空軍師」要傳
 * `{advisor: ''}` 而不是 `{advisor: undefined}`（與 web `armySetAdvisor(a, '')` 同語義）。
 */
export function updateArmy(id: string, patch: Partial<CampaignArmy>): boolean {
  const save = loadSave();
  const army = save.armies.find((row) => row.id === id);
  if (!army) return false;
  if (patch.progress !== undefined) {
    army.progress = Math.max(0, Math.min(1, numberOr(patch.progress, army.progress)));
  }
  if (typeof patch.from === 'string' && patch.from) army.from = patch.from;
  if (typeof patch.to === 'string' && patch.to) army.to = patch.to;
  if (patch.pathIndex !== undefined) {
    army.pathIndex = Math.max(0, Math.floor(numberOr(patch.pathIndex, army.pathIndex)));
  }
  if (patch.troops !== undefined) {
    army.troops = Math.max(0, Math.floor(numberOr(patch.troops, army.troops)));
  }
  if (patch.general !== undefined) army.general = patch.general;
  if (patch.officers !== undefined) army.officers = patch.officers.slice(0, ARMY_OFFICER_CAP);
  if (patch.advisor !== undefined) army.advisor = patch.advisor;
  if (patch.stationed !== undefined) army.stationed = patch.stationed === true;
  if (patch.reported !== undefined) army.reported = patch.reported === true;
  persistSave();
  return true;
}

/**
 * [R102 部隊層] 部隊進城（web `enterCity()`，campaign.html:2982）：守軍收編這支部隊的兵，
 * 上限 `CITY_TROOP_CAP = 600`，部隊從地圖上消失。
 *
 * 呼叫端要先用 `ArmyLayer.armyCanEnterCity()` 判斷「在城上 + 是我方城」——
 * 這裏只做事實檢查（部隊存在、真的在城上、那座城有狀態）。
 */
export function enterCityWithArmy(
  id: string,
  cap = CITY_TROOP_CAP,
): { ok: boolean; city?: string; troops?: number } {
  const save = loadSave();
  const army = save.armies.find((row) => row.id === id);
  if (!army) return { ok: false };
  const city = army.progress >= 1 ? army.to : army.progress <= 0 ? army.from : '';
  const state = city ? save.cities[city] : null;
  if (!city || !state) return { ok: false };
  const add = Math.max(0, Math.floor(numberOr(army.troops, 0)));
  state.troops = Math.min(Math.max(0, cap), Math.max(0, Math.floor(numberOr(state.troops, 0))) + add);
  save.armies = save.armies.filter((row) => row.id !== id);
  persistSave();
  return { ok: true, city, troops: state.troops };
}

/**
 * 战斗结算后写回：胜则占城，败只记败场；与 web main.js 的写回语义一致。
 *
 * 守城戰（`defend=true`，`armyId` 非空）额外两条：
 *   - 守方赢 → 來襲部隊從地圖上撤掉（原地消失，等於被擊退）；
 *   - 守方输 → 城從 `owned` 移除（敵軍破城），部隊同樣撤掉。
 *
 * 第五个参数 `record`：`settle()` 已经用 `updateRecord(world.record, …)` 把这一场算进去了
 * （`core/battle.ts:1636`）。传进来就**以它为准**（胜场/败场/连胜/最高连胜整组覆盖），
 * 不再 `wins += 1` —— 否则同一场会被记两次。不传则沿用旧语义（只 `+1`，连胜按结果推）。
 */
export function recordBattleResult(
  city: string | null,
  winner: 'A' | 'B' | 'draw',
  armyId?: string | null,
  defend = false,
  record?: BattleRecord,
): void {
  if (!city) return;
  const save = loadSave();
  const won = winner === 'A';
  if (record) {
    save.wins = Math.max(0, Math.floor(numberOr(record.wins, save.wins)));
    save.losses = Math.max(0, Math.floor(numberOr(record.losses, save.losses)));
    save.streak = Math.max(0, Math.floor(numberOr(record.streak, save.streak)));
    save.bestStreak = Math.max(0, Math.floor(numberOr(record.bestStreak, save.bestStreak)));
  } else if (won) {
    save.wins += 1;
    save.streak += 1;
    save.bestStreak = Math.max(save.bestStreak, save.streak);
  } else {
    // 旧语义：非胜即记一场败（平手也记，与 web 一致），连胜断掉
    save.losses += 1;
    save.streak = 0;
  }
  if (won) {
    if (!save.owned.includes(city)) save.owned.push(city);
  } else if (defend) {
    // 守城戰輸了要丟城；野戰輸了不掉城（與 web 一致：web 只在 defend 失敗時移除 owned）
    save.owned = save.owned.filter((name) => name !== city);
  }
  if (armyId) save.armies = save.armies.filter((army) => army.id !== armyId);
  persistSave();
}

/**
 * [R228] 兵團抵達空城：直接把城收進 `owned`，部隊併入守軍。
 *
 * 與 `recordBattleResult()` 的「勝則佔城」分開，是因為空城沒有戰鬥可打：
 * 原作大地圖走過去就是接收（沒有守軍就沒有攻城戰）。
 */
export function occupyCity(city: string, armyId?: string | null, cap = CITY_TROOP_CAP): { ok: boolean; troops?: number } {
  const save = loadSave();
  if (!city) return { ok: false };
  if (!save.owned.includes(city)) save.owned.push(city);
  const state = save.cities[city];
  let troops: number | undefined;
  if (state) {
    if (armyId) {
      const army = save.armies.find((row) => row.id === armyId);
      if (army) {
        state.troops = Math.min(Math.max(0, cap), Math.max(0, Math.floor(numberOr(state.troops, 0))) + Math.max(0, Math.floor(numberOr(army.troops, 0))));
        save.armies = save.armies.filter((row) => row.id !== armyId);
      }
    }
    troops = state.troops;
  } else if (armyId) {
    save.armies = save.armies.filter((row) => row.id !== armyId);
  }
  persistSave();
  return { ok: true, troops };
}

/** 调试/测试用：清掉内存缓存（不会删除 sys.localStorage 的存档）。 */
export function resetCache(): void {
  cached = null;
  deployTarget = null;
  deployFrom = null;
  deployEnemy = null;
  deployArmy = null;
  deploySiege = null;
  pendingLaunch = null;
}
