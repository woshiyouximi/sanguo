/**
 * 敵方主將取數（Cocos 側唯一入口）。
 *
 * 為什麼要這一層：
 *   - `core/garrison.ts` 的 `battleSetup()` 是 **web 與 Cocos 共用的同一份代碼**
 *     （`game/src/core/garrison.ts` 的逐字副本，兩邊必須一致），它對「城裏沒有武將」
 *     的城只能返回 `{name:'守將', str:0, int:0}`。
 *   - 但劇本 0 的 60 座城裏有一批是無主/空城（`garrison.json` 的 `officers: []`）：
 *     晉陽、易京、襄平…… 開局 3 城的接壤目標恰好就是晉陽與易京，於是編成屏
 *     天天顯示「敵將 守將（武 0 / 智 0）」——看着像取數斷了，實際是數據裏沒有守將。
 *
 * 這一層只做**表現層兜底**，不動 core：
 *   1. 有守將 → 原樣用 `battleSetup()` 的主將（和 web deploy.html 完全一致）；
 *   2. 沒有守將 → 折算成一支「守備隊」：武力/智力由城防 `DEFENSE` 推出，
 *      兵力仍用 `garrison.json` 的守軍數，讓空城也有可打的敵將，而不是 0/0。
 *
 * 統一入口還讓大地圖（城市卡/出征按鈕）、編成屏（敵情兩行）、戰鬥屏（B 方主將）
 * 三處拿到**同一份**數字，不會再出現「地圖上寫守軍 145、編成屏寫 60」這種分歧。
 */
import { battleSetup, garrisonOf } from './core/garrison';
import type { GameData } from './types';

export interface EnemyOfficer {
  name: string;
  str: number;
  int: number;
}

export interface EnemyIntel {
  /** 敵方主將名；無守將時是 `DEFENDER_FALLBACK_NAME` */
  name: string;
  str: number;
  int: number;
  /** 戰鬥內兵力 60..100（與 BattleRoot 的 `bsoldiers` 同口徑） */
  troops: number;
  /** 城防（`scenarios[].cities[].DEFENSE`），空城折算屬性用它 */
  defense: number;
  /** 勢力（`garrison.json` 的 owner，空城是空串） */
  owner: string;
  /** 上陣守將（最多 3 名），空城是 `[]` */
  officers: EnemyOfficer[];
  /** true = 數據裏沒有守將，name/str/int 由城防折算而來 */
  fallback: boolean;
}

/** 空城守備隊的名字（顯示成「敵將 守備隊（武 49 / 智 34）」） */
export const DEFENDER_FALLBACK_NAME = '守備隊';

/** 戰鬥內兵力下限/上限：web 的 `bsoldiers` 也是這個區間 */
export const ENEMY_TROOPS_MIN = 60;
export const ENEMY_TROOPS_MAX = 100;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function numOf(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function textOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

/** 從 `scenarios[index].cities` 讀一座城的原始行（`types.ts` 裏 cities 是 `unknown[]`） */
function cityRow(data: GameData | null | undefined, scenario: number, cityName: string): Record<string, unknown> | null {
  try {
    const rows = data?.scenarios?.[scenario]?.cities;
    if (!Array.isArray(rows)) return null;
    for (const raw of rows) {
      if (typeof raw !== 'object' || raw === null) continue;
      const row = raw as Record<string, unknown>;
      if (textOf(row.NAME) === cityName) return row;
    }
  } catch {
    /* 数据缺失按 0 处理 */
  }
  return null;
}

/** 城防值：編成屏與大地圖都用它兜底，所以單獨導出 */
export function cityDefense(data: GameData | null | undefined, scenario: number, cityName: string): number {
  const row = cityRow(data, scenario, cityName);
  return row ? numOf(row.DEFENSE) : 0;
}

/**
 * 空城守備隊的屬性折算。
 *
 * 只用城防（`DEFENSE`，劇本 0 大約 100..400）推，不引入新數據：
 *   武力 = 28 + DEFENSE×0.10（100→38 / 297→58 / 400→68）
 *   智力 = 20 + DEFENSE×0.06（100→26 / 297→38 / 400→44）
 * 都夾在 24..72 / 20..60：空城不該比真正的三流武將還強。
 */
function fallbackStats(defense: number): { str: number; int: number } {
  return {
    str: clamp(Math.round(28 + defense * 0.1), 24, 72),
    int: clamp(Math.round(20 + defense * 0.06), 20, 60),
  };
}

/**
 * 取某劇本某城的敵方主將/兵力。
 *
 * 永遠返回可用值（不返回 null、不拋錯）：數據整張缺失時退成「守備隊 + 城防 300」，
 * 至少不會把 0/0 遞到 UI 上。`mine` 是我方上陣兵力，只在數據完全缺失時用來算兜底兵力。
 */
export function resolveEnemyIntel(
  data: GameData | null | undefined,
  scenario: number,
  cityName: string,
  mine = ENEMY_TROOPS_MAX,
): EnemyIntel {
  const defense = cityDefense(data, scenario, cityName);
  let owner = '';
  let officers: EnemyOfficer[] = [];
  let troops = clamp(Math.round(mine * 0.6), 1, ENEMY_TROOPS_MAX);
  let name = '';
  let str = 0;
  let int = 0;

  try {
    const garrison = garrisonOf(data as GameData, scenario, cityName);
    if (garrison) {
      owner = garrison.owner || '';
      officers = garrison.officers.slice(0, 3).map((officer) => ({
        name: officer.name,
        str: officer.str,
        int: officer.int,
      }));
      if (garrison.garrison > 0) {
        troops = clamp(Math.round(garrison.garrison / 6), ENEMY_TROOPS_MIN, ENEMY_TROOPS_MAX);
      }
    }
  } catch {
    /* 缺表：下面走守備隊 */
  }

  try {
    const setup = battleSetup(data as GameData, scenario, cityName, mine);
    name = setup.enemyGeneral.name;
    str = setup.enemyGeneral.str;
    int = setup.enemyGeneral.int;
    troops = clamp(Math.round(setup.enemyTroops), 1, ENEMY_TROOPS_MAX);
    if (setup.enemyOfficers.length > 0) {
      officers = setup.enemyOfficers.slice(0, 3).map((officer) => ({
        name: officer.name,
        str: officer.str,
        int: officer.int,
      }));
    }
  } catch {
    /* 缺表：下面走守備隊 */
  }

  // 有守将 → 原樣（與 web 同一份 battleSetup 結果）；空城 → 守備隊
  const hasGeneral = str > 0 || int > 0;
  if (hasGeneral && name && name !== '守將') {
    return { name, str, int, troops, defense, owner, officers, fallback: false };
  }

  const stats = fallbackStats(defense > 0 ? defense : 300);
  return {
    name: DEFENDER_FALLBACK_NAME,
    str: stats.str,
    int: stats.int,
    troops,
    defense,
    owner,
    officers,
    fallback: true,
  };
}

/**
 * 兵力提示用的整數：`garrison.json` 的守軍總數（不是戰鬥內 60..100）。
 *
 * 大地圖城市卡/「守軍約 N 兵」要的是總數，和編成屏的 `bsoldiers` 不是一個口徑；
 * 單獨算一次，免得各屏各自 `garrisonOf` 出不同結果。
 */
export function cityGarrisonTroops(
  data: GameData | null | undefined,
  scenario: number,
  cityName: string,
): number {
  try {
    const garrison = garrisonOf(data as GameData, scenario, cityName);
    if (garrison && garrison.garrison > 0) return garrison.garrison;
  } catch {
    /* 缺表：退回人口估算 */
  }
  const row = cityRow(data, scenario, cityName);
  const pop = row ? numOf(row.POPULATION) : 0;
  return Math.min(Math.floor(pop / 2500) + 110, 600);
}
