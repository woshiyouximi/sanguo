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
import type { General } from './types';

export const SAVE_KEY = 'sanguo_campaign_v1';

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
  gold: number;
  seeded: boolean;
  /**
   * 开局选择的指纹（`剧本序号:君主名`，由 `RunSetup` 生成）。
   * 只用来判断「换剧本/换君主时要重开一局」，旧档没有这个字段 → 视为未设置、不触发重置。
   */
  runKey?: string;
  cities: Record<string, CityRuntime>;
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
  return cached;
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
function isGateCity(city: { RATE?: number; POPULATION?: number } | null | undefined): boolean {
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
 * 月推进：换月 + 年度税（与 web `advanceMonth` 同口径，见 `project\31` §一之補13）。
 *
 * 原作金钱只有**一个**产出口：`0x423824` 的年度税 `pop×75/10000 + 2250`（每城、跳过关城），
 * 在正月的年度结算里发一次；没有月度收入、没有月度复利、没有俸禄（web 侧 `project\108` 已收口）。
 * 人口也没有「每月 +1%」这种自然增长（04c §7-4 未定位），只由「開發」与两处衰减事件改动。
 * 早先这里写的是「月度 `pop/5000*4` + `money*1.01+20` + `pop*1.01`」，三项都是自订近似，已全部移除。
 */
export function advanceMonth(cities: CampaignCity[]): number {
  const save = loadSave();
  save.month += 1;
  let income = 0;
  const yearStart = (save.month - 1) % 12 === 0;   // 与 Saves.isYearStart 同义：进入正月
  if (yearStart) {
    for (const name of save.owned) {
      const state = save.cities[name];
      if (!state) continue;
      const def = cities.find((c) => c.NAME === name);
      if (def && isGateCity(def)) continue;        // 关城不缴年税（0x405499）
      const tax = Math.floor(state.pop * 75 / 10000) + 2250;
      state.money = Math.floor(state.money) + tax;
      income += tax;
    }
  }
  save.gold += income;
  // 守军自然回补：与 web `advanceMonth` 同一口径 —— 上限 = min(人口/2500 + 110, 600)，
  // 每月按上限的 2% 缓慢补（600 上限 → 每月 +12），不分敌我、补到上限为止。
  // 旧码是「敌方 +6、硬夹 600」，与 web 不一致（project\31 §一之補13）。
  for (const city of cities) {
    const state = save.cities[city.NAME];
    if (!state) continue;
    const cap = Math.min(600, Math.floor((Number(state.pop) || 0) / 2500) + 110);
    const cur = Math.floor(Number(state.troops) || 0);
    if (cur >= cap) continue;
    const step = Math.max(1, Math.ceil(cap * 0.02));
    state.troops = Math.min(cap, cur + step);
  }
  persistSave();
  return income;
}

export function recruit(name: string): { ok: boolean; message: string } {
  const save = loadSave();
  if (save.gold < 500) return { ok: false, message: '國庫不足：徵兵要 500 金。' };
  const state = cityRuntime(name);
  save.gold -= 500;
  state.troops = Math.min(600, state.troops + 40);
  persistSave();
  return { ok: true, message: `${name}：兵 +40（${state.troops}）` };
}

export function develop(name: string): { ok: boolean; message: string } {
  const save = loadSave();
  if (save.gold < 400) return { ok: false, message: '國庫不足：開發要 400 金。' };
  const state = cityRuntime(name);
  save.gold -= 400;
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

/** 调试/测试用：清掉内存缓存（不会删除 sys.localStorage 的存档）。 */
export function resetCache(): void {
  cached = null;
  deployTarget = null;
  deployFrom = null;
  deployEnemy = null;
  deployArmy = null;
  pendingLaunch = null;
}
