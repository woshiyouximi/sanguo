/**
 * ItemsModel.ts — 物品與裝備的**純邏輯**，逐函式移植自 `game/web/items_model.js`。
 *
 * 移植原則：
 *   1. **導出名一一對應**（6 個常數 + 21 個函式），簽名只加型別、不改行為；
 *   2. **不 import `cc`、不 import DOM、不碰 localStorage** —— 這樣 `work/cocos_items/parity.mjs`
 *      可以把編譯後的 `ItemsModel.js` 直接丟進 node，與 web 版逐項對拍（`items_model.js` 是
 *      純邏輯檔，兩邊必須同結果）；
 *   3. 數值欄位可能是 `""`（原作空字串＝無加成），一律走 `num()` 讀成 0。
 *
 * 四槽：weapon 兵器 / horse 坐騎 / book 兵書 / amulet 寶物（原作只有 Weapon/Horse/Thing 三槽，
 * amulet 是本重製版新增的第 4 槽，用來掛珠寶類忠誠道具）。
 *
 * 兵符（JEWEL_MISC + Force 位掩碼）**不能裝備**：它只解鎖可用兵種，不加任何屬性，
 * `slotOf()` 對它回 null，`bonusOf()` 對它回全 0（與 web 版第一個 early return 同義）。
 *
 * 對應 web：`game/web/items_model.js`（252 行）；資料：`bundles/res/data/items.json`（77 件）。
 */

/** 可裝備的四個槽位。 */
export type Slot = 'weapon' | 'horse' | 'book' | 'amulet';

/** 列表分組鍵：四個槽 + 兩種使用品。 */
export type GroupKey = Slot | 'talisman' | 'formation';

/** 會參與加成的屬性欄位。 */
export type StatKey = 'STR' | 'INT' | 'MaxHP' | 'MaxMP' | 'Speed' | 'HP' | 'MP' | 'Spirit' | 'Loyal' | 'Tire';

/** 原作數值欄位可能是 number / "" / null。 */
export type NumLike = number | string | null | undefined;

/**
 * items.json 的一筆。索引簽名是為了 `bonusOf` 的 `item[k]` 動態讀值；
 * 具名欄位只列出 UI/邏輯真正會碰到的那些。
 */
export interface ItemLike {
  Sequence?: NumLike;
  Name?: string;
  Attrib?: string;
  TYPE?: string;
  WeaponType?: NumLike;
  WeaponObject?: NumLike;
  SearchType?: NumLike;
  Sort?: NumLike;
  Level?: NumLike;
  Sprite?: string;
  Rate?: NumLike;
  STR?: NumLike;
  INT?: NumLike;
  MaxHP?: NumLike;
  MaxMP?: NumLike;
  Speed?: NumLike;
  HP?: NumLike;
  MP?: NumLike;
  Spirit?: NumLike;
  Loyal?: NumLike;
  Tire?: NumLike;
  Force?: NumLike;
  Battle?: NumLike;
  Skill?: NumLike;
  Description?: string;
  [key: string]: unknown;
}

/** 十項屬性 + Force/Battle 位掩碼。 */
export type Bonus = Record<StatKey, number> & { Force: number; Battle: number };

/** 裝備表：`{ 槽位: Sequence }`，一個槽天然只有一個值。 */
export type EquipTable = { [slot: string]: number | undefined };

/** 武將的寬鬆形狀（generals.json 一筆 + 執行期欄位）。 */
export type GeneralLike = { [key: string]: unknown };

/** `applyEquip()` 的輸出：基礎值 + 加成，並掛 `_bonus` / `_equips`。 */
export type AppliedGeneral = { [key: string]: unknown; _bonus: Bonus; _equips: EquipTable };

/** `runtimeGeneral()` 的輸出：MaxHP/MaxMP 已由 BaseHP/BaseMP 補齊。 */
export type RuntimeGeneral = { [key: string]: unknown; MaxHP: number; MaxMP: number };

export const SLOTS: Slot[] = ['weapon', 'horse', 'book', 'amulet'];

export const SLOT_NAMES: Record<Slot, string> = {
  weapon: '兵器',
  horse: '坐騎',
  book: '兵書',
  amulet: '寶物',
};

/** 會參與加成的屬性欄位（順序即 UI 顯示順序）。 */
export const STAT_KEYS: StatKey[] = ['STR', 'INT', 'MaxHP', 'MaxMP', 'Speed', 'HP', 'MP', 'Spirit', 'Loyal', 'Tire'];

export const STAT_NAMES: Record<StatKey, string> = {
  STR: '武力',
  INT: '智力',
  MaxHP: '生命上限',
  MaxMP: '技力上限',
  Speed: '速度',
  HP: '生命',
  MP: '技力',
  Spirit: '士氣',
  Loyal: '忠誠',
  Tire: '疲勞',
};

/** 列表分組順序；'talisman' / 'formation' 是不可裝備的兩類使用品。 */
export const GROUP_ORDER: GroupKey[] = ['weapon', 'horse', 'book', 'amulet', 'talisman', 'formation'];

export const GROUP_LABELS: Record<GroupKey, string> = {
  weapon: '兵 器',
  horse: '坐 騎',
  book: '兵 書',
  amulet: '寶 物',
  talisman: '兵 符',
  formation: '陣 法',
};

/* ---------- 基礎讀值 ---------- */

/** `""` / null / undefined → 0；其餘盡量轉數字。 */
export function num(v: unknown): number {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 把整數拆成位元清單（Force / Battle 都是 1<<k）。 */
export function bitsOf(mask: unknown): number[] {
  const out: number[] = [];
  let m = num(mask);
  for (let k = 0; m > 0 && k < 32; k += 1) {
    if (m & 1) out.push(1 << k);
    m >>>= 1;
  }
  return out;
}

/* ---------- 分類 ---------- */

/** TYPE 大類：JEWEL_WEAPON / JEWEL_HORSE / JEWEL_THING / JEWEL_MISC（原作 4 類）。 */
export function typeOf(item: unknown): string {
  if (!item || typeof item !== 'object') return '';
  const type = (item as ItemLike).TYPE;
  return typeof type === 'string' ? type : '';
}

/** 兵符：JEWEL_MISC 且帶 Force 位掩碼（13 件，只影響可用兵種）。 */
export function isTalisman(item: unknown): boolean {
  if (typeOf(item) !== 'JEWEL_MISC') return false;
  return num((item as ItemLike).Force) > 0;
}

/** 陣法之書：JEWEL_MISC 且帶 Battle 位掩碼（9 件，學會陣形）。 */
export function isFormBook(item: unknown): boolean {
  if (typeOf(item) !== 'JEWEL_MISC') return false;
  return num((item as ItemLike).Battle) > 0;
}

/**
 * 槽位判定，回 'weapon' | 'horse' | 'book' | 'amulet' | null。
 * - JEWEL_WEAPON → weapon（34 件）
 * - JEWEL_HORSE  → horse（8 件）
 * - JEWEL_THING  → book（8 件兵書）
 * - JEWEL_MISC 且 Loyal>0 → amulet（5 件珠寶：布匹/玉器/美女/黃金/珠寶）
 * - 兵符（Force）、陣法之書（Battle）、其餘 → null（使用品，不可裝備）
 */
export function slotOf(item: unknown): Slot | null {
  if (!item || typeof item !== 'object') return null;
  const it = item as ItemLike;
  const type = typeOf(it);
  if (type === 'JEWEL_WEAPON') return 'weapon';
  if (type === 'JEWEL_HORSE') return 'horse';
  if (type === 'JEWEL_THING') return 'book';
  if (type === 'JEWEL_MISC' && num(it.Loyal) > 0) return 'amulet';
  return null;
}

export function isEquippable(item: unknown): boolean {
  return slotOf(item) !== null;
}

/** 列表分組鍵，永遠有值（實際資料 77 件都落在 6 組裡，兜底回 'amulet' 與 web 一致）。 */
export function groupOf(item: unknown): GroupKey {
  const slot = slotOf(item);
  if (slot) return slot;
  if (isTalisman(item)) return 'talisman';
  if (isFormBook(item)) return 'formation';
  return 'amulet';
}

/* ---------- 加成 ---------- */

export function emptyBonus(): Bonus {
  const b: Partial<Bonus> = {};
  for (const k of STAT_KEYS) b[k] = 0;
  b.Force = 0;
  b.Battle = 0;
  return b as Bonus;
}

/**
 * 單件物品對某武將的加成（十項屬性 + Force/Battle 位掩碼）。
 * 兵符：一律回全 0 —— 它的 Force 是「可用兵種」開關，不是屬性。
 * general 目前只作簽名保留（原作有等級門檻，但 generals.json 沒有等級欄位）。
 */
export function bonusOf(item: unknown, general?: unknown): Bonus {
  void general; // 簽名保留：與 web 版一致
  const b = emptyBonus();
  if (!item || typeof item !== 'object') return b;
  const it = item as ItemLike;
  if (isTalisman(it)) return b; // 兵符不加屬性
  for (const k of STAT_KEYS) b[k] = num(it[k]);
  b.Force = num(it.Force);
  b.Battle = num(it.Battle);
  return b;
}

/* ---------- 物品註冊表（給 applyEquip 解析 Sequence 用） ---------- */

let REGISTRY = new Map<number, ItemLike>();

/** 用整份 items.json 建立 Sequence → item 的索引。 */
export function registerItems(items: readonly unknown[] | null | undefined): number {
  const list = Array.isArray(items) ? items : [];
  REGISTRY = new Map(list.map((it) => [Number((it as ItemLike).Sequence), it as ItemLike]));
  return REGISTRY.size;
}

export function itemOf(seq: unknown): ItemLike | null {
  const found = REGISTRY.get(Number(seq));
  return found ?? null;
}

export function allItems(): ItemLike[] {
  // 必須用 Array.from，不能寫 [...REGISTRY.values()]：
  // Creator 的 Babel 會把陣列展開降級成 `[].concat(REGISTRY.values())`，而 concat 只攤平
  // 陣列、不會攤平 Map iterator，結果回傳 `[MapIterator]`（長度 1）—— 面板就會變成
  // 「共 1 件」且品名顯示「—」。2026-11-25 的線上建置產物正是 `[].concat(m.values())`。
  return Array.from(REGISTRY.values());
}

/* ---------- 裝備表操作 ---------- */

/**
 * 收斂裝備表：只留四槽、槽位必須與物品相符、Sequence 必須存在。
 * 形狀是 `{ 槽位: Sequence }`，一個槽天然只有一個值 —— 這就是「同槽只能一件」的來源。
 */
export function normalizeEquips(equips: unknown): EquipTable {
  const out: EquipTable = {};
  if (!equips || typeof equips !== 'object') return out;
  const table = equips as EquipTable;
  for (const slot of SLOTS) {
    if (!(slot in table)) continue;
    const seq = Number(table[slot]);
    const item = itemOf(seq);
    if (!item) continue;
    if (slotOf(item) !== slot) continue;
    out[slot] = seq;
  }
  return out;
}

/** 裝上（同槽直接取代，回傳新表；被取代的那件自動回背包，因為背包是「擁有」清單）。 */
export function equipItem(equips: unknown, seq: unknown): EquipTable {
  const item = itemOf(seq);
  const slot = slotOf(item);
  const next = normalizeEquips(equips);
  if (!slot) return next; // 兵符/陣法書 → 原樣返回
  next[slot] = Number(seq);
  return next;
}

/** 卸下某槽，回傳新表。 */
export function unequipSlot(equips: unknown, slot: string): EquipTable {
  const next = normalizeEquips(equips);
  delete next[slot];
  return next;
}

/** 某件物品是不是正裝備在某張裝備表上，回傳槽位或 null。 */
export function equippedSlot(equips: unknown, seq: unknown): Slot | null {
  const clean = normalizeEquips(equips);
  const n = Number(seq);
  for (const slot of SLOTS) if (clean[slot] === n) return slot;
  return null;
}

/** 四槽加成合計。 */
export function totalBonus(equips: unknown): Bonus {
  const clean = normalizeEquips(equips);
  const sum = emptyBonus();
  for (const slot of SLOTS) {
    const item = itemOf(clean[slot]);
    if (!item) continue;
    const b = bonusOf(item);
    for (const k of STAT_KEYS) sum[k] += b[k];
  }
  return sum;
}

/**
 * 套用裝備：回傳「新」武將物件（不修改傳入者），屬性 = 基礎 + 四槽加成。
 * 額外掛 `_bonus`（各項加總）與 `_equips`（實際生效的 `{槽:Sequence}`）。
 * 生命/技力上限請在呼叫前把武將的 MaxHP/MaxMP 設成 BaseHP/BaseMP（面板用 runtimeGeneral() 做）。
 */
export function applyEquip(general: unknown, equips: unknown): AppliedGeneral {
  const base: GeneralLike = general && typeof general === 'object' ? (general as GeneralLike) : {};
  const clean = normalizeEquips(equips);
  const bonus = emptyBonus();
  const used: EquipTable = {};

  for (const slot of SLOTS) {
    const seq = clean[slot];
    if (seq === undefined) continue;
    const item = itemOf(seq);
    if (!item) continue;
    const b = bonusOf(item, base);
    for (const k of STAT_KEYS) bonus[k] += b[k];
    bonus.Force |= b.Force;
    bonus.Battle |= b.Battle;
    used[slot] = seq;
  }

  const out: AppliedGeneral = { ...base, _bonus: bonus, _equips: used };
  for (const k of STAT_KEYS) out[k] = num(base[k]) + bonus[k];
  return out;
}

/** 把 generals.json 的一筆轉成「可套裝備」的形狀：MaxHP/MaxMP 取 BaseHP/BaseMP。 */
export function runtimeGeneral(g: unknown): RuntimeGeneral {
  const base: GeneralLike = g && typeof g === 'object' ? (g as GeneralLike) : {};
  return {
    ...base,
    MaxHP: num(base.MaxHP) || num(base.BaseHP),
    MaxMP: num(base.MaxMP) || num(base.BaseMP),
  };
}

/** 加成表的可讀字串，例如 "武力 +30 · 智力 +20"；全 0 時回 "無屬性加成"。 */
export function bonusText(item: unknown): string {
  const b = bonusOf(item);
  const parts: string[] = [];
  for (const k of STAT_KEYS) if (b[k]) parts.push(`${STAT_NAMES[k]} ${b[k] > 0 ? '+' : ''}${b[k]}`);
  return parts.length ? parts.join(' · ') : '無屬性加成';
}
