/**
 * 兵種圖集（`anim/units`）的「按陣營選哪一套幀」純函數——與 web 的
 * `game/src/view/unitFrames.ts` 同源同契約，只保留 Cocos 側需要的部分。
 *
 * 原作 `SHAPE\FORCE` 的士兵造型有 **兩套調色盤**（project/63_士兵造型.md）：
 *  - `M` = 藍軍 → 我方 `side==='A'`，幀名 `{group}_walk_NN`（背視，`groups.<g>.back`）
 *  - `N` = 紅軍 → 敵方 `side==='B'`，幀名 `{group}_ewalk_NN`（正視，`groups.<g>.front`）
 * 同一姿勢、同一 alpha 掩膜，只有 RGB 不同，所以「換陣營」= **換一組幀**，
 * 壓根不需要（也不允許）在渲染層疊紅色 tint：web 當年的 `rgba(206,52,40,0.46)`
 * 紅染會把黃巾染成粉色（project/63 §6.3 已列為反面教材）。
 *
 * 本檔**不 import 'cc'**，只有幀名字符串與 hold，好處是能在 Node 裡直接跑單測；
 * 真正的 SpriteFrame 由 `BattleRoot` 按這裡給出的名字去圖集裡取。
 */

/** `units.json` 的 `groups.<name>`：FORCE 造型組（對象）；舊圖集裡也有純幀名數組的組 */
export interface UnitsGroup {
  /** 我方（M 藍軍）走路循環 */
  back?: string[];
  /** 敵方（N 紅軍）走路循環 */
  front?: string[];
  /** 我方攻擊循環；缺省時退回 back */
  attack?: string[];
  /** 敵方攻擊循環；缺省時退回 attack */
  attackEnemy?: string[];
  /** 每幀停留 tick；缺省 {@link UNIT_HOLD} */
  hold?: number;
}

/** `units.json.groups` 的原始形態：既有對象組（FORCE），也有純幀名數組（`walk_side`） */
export type UnitsGroups = Record<string, unknown>;

/** 組缺 `hold` 時的每幀停留 tick（`units.json` 的 `archer.hold = 5` 口徑） */
export const UNIT_HOLD = 5;

/**
 * 兵種號 → 圖集組名。索引 = `bundles/res/data/troops.json` 的 `names` 下標，
 * 依次對應原作兵符字母 A/C/D/F/I/H/J/K/E/L/M/B/G（project/63 §2 的映射表）。
 * 弓（3）與弩（11）是**兩套不同造型**（F 弓箭 / B 弩兵），不共用組。
 */
export const GROUP_BY_TROOP: Readonly<Record<number, string>> = {
  0: 'podao', // 朴刀 A
  1: 'changqiang', // 長槍 C
  2: 'dadao', // 大刀 D
  3: 'archer', // 弓箭 F
  4: 'lianchui', // 鍊錘 I
  5: 'feidao', // 飛刀 H
  6: 'wudou', // 武鬥 J
  7: 'manzu', // 蠻族 K
  8: 'tiechui', // 鐵鎚 E
  9: 'tengjia', // 籐甲 L
  10: 'huangjin', // 黃巾 M
  11: 'nu', // 弩兵 B
  12: 'nvbing', // 女兵 G
};

/** 兵種號 → 組名；越界/非整數返回 null（調用方保留舊 walk 幀降級） */
export function unitGroupOf(troop: number): string | null {
  if (!Number.isInteger(troop) || troop < 0) return null;
  return GROUP_BY_TROOP[troop] ?? null;
}

/** 選中的一組幀名（還沒換成 SpriteFrame） */
export interface PickedFrames {
  /** 命中的組名，便於日誌/報告 */
  group: string;
  /** 走路循環（A=back 藍軍 / B=front 紅軍） */
  walk: string[];
  /** 攻擊循環（A=attack / B=attackEnemy ?? attack）；空數組 = 沒有專門攻擊幀 */
  attack: string[];
  /** 每幀停留 tick */
  hold: number;
}

/**
 * 這個 `groups` 是不是原作 FORCE 版圖集：只要有一個對象組帶 `back` 或 `front` 數組就算。
 * 舊的 AI 圖集（`archer_back_f000..` 那種）只有純名字段和數組組，返回 false，
 * 調用方照舊走 `walk_back`/`walk_front` 降級。
 */
export function hasForceSchema(groups: UnitsGroups | null | undefined): boolean {
  if (!groups) return false;
  for (const key of Object.keys(groups)) {
    const g = groups[key] as UnitsGroup | null;
    if (!g || typeof g !== 'object' || Array.isArray(g)) continue;
    if (Array.isArray(g.back) || Array.isArray(g.front)) return true;
  }
  return false;
}

/**
 * 給「某一側的某個兵種」挑幀。
 *
 * @param groups  `units.json` 的 `groups`
 * @param troop   兵種號（`world.sides[side].troop`）
 * @param side    `'A'` 我方（M 藍軍）/ `'B'` 敵方（N 紅軍）
 * @param hasFrame 可選：幀是否真的在圖集頁裡（缺幀就丟掉，絕不讓調用方拿到 undefined）
 * @returns 沒有組 / 沒有可用走路幀 → null（調用方降級）
 */
export function pickUnitFrames(
  groups: UnitsGroups | null | undefined,
  troop: number,
  side: 'A' | 'B',
  hasFrame?: (name: string) => boolean,
): PickedFrames | null {
  const groupName = unitGroupOf(troop);
  if (!groupName || !groups) return null;
  const raw = groups[groupName];
  // `walk_side` 這種純幀名數組不是「分陣營」的組，當缺組處理
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const group = raw as UnitsGroup;
  const walk = resolveNames(side === 'A' ? group.back : group.front, hasFrame);
  if (walk.length === 0) return null;
  const attack = resolveNames(side === 'A' ? group.attack : (group.attackEnemy ?? group.attack), hasFrame);
  return { group: groupName, walk, attack, hold: positiveInt(group.hold) ?? UNIT_HOLD };
}

/** 只留真有的幀名，順序保持 `units.json` 原序（走路相位靠下標，亂序會跳幀） */
function resolveNames(list: unknown, hasFrame?: (name: string) => boolean): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const name of list) {
    if (typeof name !== 'string' || name.length === 0) continue;
    if (hasFrame && !hasFrame(name)) continue;
    out.push(name);
  }
  return out;
}

function positiveInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
}
