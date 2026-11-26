/**
 * equip_bonus.ts — 裝備加成（F-05）：把「武將基礎屬性 + 身在四槽的裝備」算成有效屬性。
 *
 * ## 為什麼要有這一支
 *
 * web 版把「裝備 → 屬性」寫在 `game/web/items_model.js`（`bonusOf / totalBonus /
 * applyEquip / normalizeEquips / equipNames / equipSeqs`）與 `game/web/campaign.html`
 * 的 `[[EQUIP_CORE]]` 段（`combatStatsOf / equipNamesOf`）；Cocos 版原本只宣告了
 * `save.equip` 欄位、**沒有任何消費點**，於是「裝了刀武力不漲」（parity_sweep F-05）。
 * 本次把公式搬進 core 一份，Cocos 的名冊（`GeneralBook`）與出征（`GameState.startBattle`）
 * 都調這裡，不再各寫一份。
 *
 * ## 公式來源（照抄 web，不發明）
 *
 * 1. **物品加成** = `bonusOf(item)`：對每個屬性鍵取 `num(item[key])`；`Force`/`Battle`
 *    是位掩碼（兵符/陣法書），**不算屬性**。兵符（`TYPE='JEWEL_MISC'` 且 `Force>0`）
 *    整個早退成全 0（`items_model.js` 的 `isTalisman` 判據）。
 *    五個屬性對應的物品鍵：武力 `STR`、智力 `INT`、生命上限 `MaxHP`、技力上限 `MaxMP`、
 *    速度 `Speed`（web `STAT_KEYS` 的前五項；`HP/MP/Spirit/Loyal/Tire` 是「當前值/士氣/
 *    忠誠/疲勞」，裝備加成不落在這五項的計算裡，`Loyal` 只用來判「珠寶 → amulet 槽」）。
 * 2. **槽位** = `slotOf(item)`：`JEWEL_WEAPON→weapon`（兵器）、`JEWEL_HORSE→horse`（坐騎）、
 *    `JEWEL_THING→book`（兵書）、`JEWEL_MISC` 且 `Loyal>0→amulet`（寶物）；其餘 null
 *    （兵符、陣法書不進槽）。四槽各一件，同槽多件在 web 的 `normalizeEquips` 也是「後寫的
 *    覆蓋」（這裡只吃一張 `{槽: ...}` 表，天然一件一槽）。
 * 3. **有效值** = `combatStatsOf`：`max(0, trunc(基礎) + trunc(加成))`——web 戰鬥只吃
 *    `str/int`，且對「基礎 + 加成」做了 `Math.trunc` 與下夾 0（**沒有上夾**：武將 999 再
 *    戴 +30 的刀就是 1029，名冊顯示才在 UI 層夾 999）。本檔對生命/技力/速度用同一口徑
 *    （`max(0, trunc(base)+trunc(bonus))`），因為它們在 web 是「卡片十項」的展示值，
 *    沒有另一套夾法可抄。
 * 4. **無裝備 = 原值 + 0**：空表/空槽/未知槽/錯槽（兵書放進兵器槽）一律不給加成，
 *    與 web `normalizeEquips` 的「Sequence 查不到或 slotOf 不匹配就丟」一致。
 *
 * ## 兩張「名字表」的來源（web 同名函數的移植）
 *
 * - `equipNamesFromBag(save, 名, items)` = web `items_model.js` 的
 *   `normalizeBagEquip` + `equipNames`：Cocos/網頁的物品存檔
 *   `{equip:{武將名:{槽:Sequence}}, bag}`，把 Sequence 換成 `item.Name`。
 *   將名不在表裡（= 從沒在物品頁動過該將）回 `null`，讓呼叫端回落存檔名表。
 * - `equipNamesOfSave(save, 名)` = web `campaign.html:equipNamesOf` +
 *   `saves.js:equipSlotsOf`：`save.equip[名][槽]` 的**名字**優先，缺失時回落三張舊表
 *   `save.weapon / save.horse / save.thing`（其中 `book` 回落 `thing`，`amulet` 只看
 *   `save.equip`）。空字串 / `---` / `—` 都算「沒裝」，與 `saves.js` 的 `equipText` 同口徑。
 *
 * ## 純函數 / 零依賴
 *
 * 本檔不 import 任何東西（無 DOM、無 `cc`、無 fs），sync_core3 會原樣鏡像到
 * `game/cocos/assets/scripts/core/equip_bonus.ts`。從 localStorage / bundle 讀檔的 IO
 * 留在 Cocos 的呼叫端（`GeneralBook.buildBook` 與 `GameState.startBattle`），本檔只做
 * 「把讀到的字串 JSON.parse 成表」（`equipRowsFromJson / equipBagFromJson`）這種純轉換。
 *
 * ## 物品表的同步通道（跨模組約定）
 *
 * Cocos 的裝備權威 = localStorage `sanguo_items_v1`（`{equip:{名:{槽:Sequence}}, bag}`），
 * 由 `ItemsPanel` 寫；但「Sequence → 物品數值」需要整張 `data/items.json`，而名冊/戰鬥
 * 拿不到 `DataLoader` 的 GameData（一個是純模型、一個被 `work/cocos_officers85` 的
 * 「GameState 只准有一條 `from 'cc'`」契約鎖住）。所以 `ItemsPanel.open()` 會把整張物品表
 * 另存一份到 `EQUIP_ITEMS_CACHE_KEY`（物品頁是唯一擁有整張表、也是唯一能改裝備的地方，
 * 快照因此永遠與 `sanguo_items_v1` 同步）。名冊與出征都從這份快照取表。
 */

/* =====================================================================
 * §0 常量 / 型別
 * =================================================================== */

/** 四槽，順序與 web `items_model.js:SLOTS` 一致（累加與顯示都按這個順序） */
export const EQUIP_SLOTS = ['weapon', 'horse', 'book', 'amulet'] as const;

/** 槽位鍵（`weapon | horse | book | amulet`） */
export type EquipSlot = (typeof EQUIP_SLOTS)[number];

/** 槽位中文名（同 web `SLOT_NAMES`） */
export const EQUIP_SLOT_NAMES: Readonly<Record<EquipSlot, string>> = Object.freeze({
  weapon: '兵器',
  horse: '坐騎',
  book: '兵書',
  amulet: '寶物',
});

/**
 * 物品存檔（裝備權威）的 localStorage 鍵。
 * 與 `ItemsPanel.ITEM_SAVE_KEY`、`CityModel.BAG_KEY` 同值——repo 慣例是「同鍵多處寫字面量」，
 * 這裡放 core 是給名冊/戰鬥的讀取端引用，避免第三份字面量。
 */
export const EQUIP_SAVE_KEY = 'sanguo_items_v1';

/**
 * 物品表快照的 localStorage 鍵：`ItemsPanel.open()` 寫入 `JSON.stringify(items)`。
 * 名冊/出征跨場景（以及跨會話）靠它把裝備 Sequence 解成數值。
 */
export const EQUIP_ITEMS_CACHE_KEY = 'sanguo_equip_items_v1';

/** 五個受裝備影響的屬性（web 的 STR/INT/MaxHP/MaxMP/Speed 投影） */
export interface EquipStats {
  str: number;
  int: number;
  hp: number;
  mp: number;
  speed: number;
}

/** 四槽的名字表（空字串 = 該槽沒裝），形狀同 web `equipNames()` 的補齊版 */
export interface EquipNames {
  weapon: string;
  horse: string;
  book: string;
  amulet: string;
}

/** 物品列（`data/items.json` 的一行）；只聲明本檔會讀的鍵，其餘原樣帶過 */
export interface EquipItemLike {
  readonly Sequence?: unknown;
  readonly Name?: unknown;
  readonly TYPE?: unknown;
  readonly STR?: unknown;
  readonly INT?: unknown;
  readonly MaxHP?: unknown;
  readonly MaxMP?: unknown;
  readonly Speed?: unknown;
  readonly Loyal?: unknown;
  readonly Force?: unknown;
  readonly Battle?: unknown;
  readonly [key: string]: unknown;
}

/**
 * `equipBonusOf()` 能吃的东西：
 * - 單件物品（`data/items.json` 一行）
 * - 物品名（string）或 Sequence（number）——需要 `items` 表才解得開
 * - 四槽表 `{weapon: 名/Sequence/物品, horse: …}`（存檔 `save.equip[名]`、物品存檔的
 *   `equip[名]`、或 `equipNamesForGeneral()` 的產物都是這個形狀）
 *
 * `EquipNames` 也直接收（它是四槽表的型別化版本；因為是 interface 沒有索引簽名，
 * 不列進來的話呼叫端在 strict 下會報 TS2345——Cocos 的 `tsconfig.check.json` 就是）。
 */
export type EquipBonusSource =
  | EquipNames
  | Readonly<Record<string, unknown>>
  | string
  | number
  | null
  | undefined;

/* =====================================================================
 * §1 基礎工具（逐行對齊 web items_model.js）
 * =================================================================== */

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** web `num()`：`'' / null / undefined` 是 0，其餘 `Number()` 後非有限也回 0 */
export function numOf(value: unknown): number {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 把任意值當「名字」讀：非字串回 ''，trim 後回傳（`saves.js:equipText` 的寬鬆版） */
function textOf(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (text === '' || text === '---' || text === '—' || text === '-') return '';
  return text;
}

/** 查表用的鍵（存檔裡的武將名） */
function textKey(value: unknown): string {
  return typeof value === 'string' ? value.trim() : String(value ?? '').trim();
}

/** web `typeOf()` */
function typeOf(item: unknown): string {
  if (!isRecord(item)) return '';
  return typeof item.TYPE === 'string' ? item.TYPE : '';
}

/** web `isTalisman()`：兵符（`JEWEL_MISC` 且 `Force>0`）不給屬性加成 */
export function isTalismanOf(item: unknown): boolean {
  if (!isRecord(item)) return false;
  return typeOf(item) === 'JEWEL_MISC' && numOf(item.Force) > 0;
}

/** web `slotOf()`：物品能進哪個槽；兵符/陣法書/未知類型回 null */
export function itemSlotOf(item: unknown): EquipSlot | null {
  if (!isRecord(item)) return null;
  const type = typeOf(item);
  if (type === 'JEWEL_WEAPON') return 'weapon';
  if (type === 'JEWEL_HORSE') return 'horse';
  if (type === 'JEWEL_THING') return 'book';
  if (type === 'JEWEL_MISC' && numOf(item.Loyal) > 0) return 'amulet';
  return null;
}

/** 全 0 加成 */
export function emptyEquipStats(): EquipStats {
  return { str: 0, int: 0, hp: 0, mp: 0, speed: 0 };
}

/** 全空名字表 */
export function emptyEquipNames(): EquipNames {
  return { weapon: '', horse: '', book: '', amulet: '' };
}

function addStats(target: EquipStats, delta: EquipStats): void {
  target.str += delta.str;
  target.int += delta.int;
  target.hp += delta.hp;
  target.mp += delta.mp;
  target.speed += delta.speed;
}

/**
 * 單件物品的五屬性加成（web `bonusOf()` 的前五項投影）。
 *
 * - 非物件 / 兵符 → 全 0；
 * - 其餘逐鍵 `num(item[key])`，`''` 空字串代表「這件不加該項」→ 0。
 */
export function bonusOfItem(item: unknown): EquipStats {
  const out = emptyEquipStats();
  if (!isRecord(item)) return out;
  if (isTalismanOf(item)) return out;
  out.str = numOf(item.STR);
  out.int = numOf(item.INT);
  out.hp = numOf(item.MaxHP);
  out.mp = numOf(item.MaxMP);
  out.speed = numOf(item.Speed);
  return out;
}

/* =====================================================================
 * §2 物品表解析（Sequence / 名字 → 物品列）
 * =================================================================== */

function findItem(
  rows: readonly unknown[],
  predicate: (item: Record<string, unknown>) => boolean,
): Record<string, unknown> | null {
  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    if (!isRecord(row)) continue;
    if (predicate(row)) return row;
  }
  return null;
}

function itemByName(rows: readonly unknown[], name: string): Record<string, unknown> | null {
  if (!name) return null;
  return findItem(rows, (item) => textOf(item.Name) === name);
}

function itemBySequence(rows: readonly unknown[], sequence: number): Record<string, unknown> | null {
  if (!Number.isFinite(sequence)) return null;
  return findItem(rows, (item) => numOf(item.Sequence) === sequence);
}

/** 把「物品物件 / 名字 / Sequence」統一解成物品列；解不開回 null */
function itemOfValue(value: unknown, rows: readonly unknown[]): Record<string, unknown> | null {
  if (isRecord(value)) return value;
  const text = textOf(value);
  if (text) {
    const byName = itemByName(rows, text);
    if (byName) return byName;
  }
  if (typeof value === 'number' || typeof value === 'string') {
    const bySeq = itemBySequence(rows, Number(value));
    if (bySeq) return bySeq;
  }
  return null;
}

/* =====================================================================
 * §3 加成計算
 * =================================================================== */

function isSlotTable(source: Record<string, unknown>): boolean {
  for (let i = 0; i < EQUIP_SLOTS.length; i += 1) {
    if (Object.prototype.hasOwnProperty.call(source, EQUIP_SLOTS[i])) return true;
  }
  return false;
}

/** 四槽表取某槽的裝備：值 → 物品列，且槽位必須對得上（web `normalizeEquips` 同判據） */
function equipItemAt(
  table: Record<string, unknown>,
  slot: EquipSlot,
  rows: readonly unknown[],
): Record<string, unknown> | null {
  if (!Object.prototype.hasOwnProperty.call(table, slot)) return null;
  const value = table[slot];
  if (value === null || value === undefined || value === '') return null;
  const item = itemOfValue(value, rows);
  if (!item) return null;
  if (itemSlotOf(item) !== slot) return null;
  return item;
}

/**
 * 裝備加成（五屬性合計）。
 *
 * @param source 單件物品 / 物品名 / Sequence / 四槽表
 * @param items  `data/items.json` 的列（名字與 Sequence 解析用；吃單件物品時可省略）
 */
export function equipBonusOf(
  source: EquipBonusSource,
  items: readonly unknown[] | null = null,
): EquipStats {
  const total = emptyEquipStats();
  if (source === null || source === undefined) return total;
  const rows: readonly unknown[] = Array.isArray(items) ? items : [];

  if (typeof source === 'string' || typeof source === 'number') {
    const item = itemOfValue(source, rows);
    return item ? bonusOfItem(item) : total;
  }
  if (!isRecord(source)) return total;

  if (!isSlotTable(source)) return bonusOfItem(source);

  for (let i = 0; i < EQUIP_SLOTS.length; i += 1) {
    const slot = EQUIP_SLOTS[i];
    const item = equipItemAt(source, slot, rows);
    if (!item) continue;
    addStats(total, bonusOfItem(item));
  }
  return total;
}

/**
 * 四槽的有效屬性 = 基礎屬性 + 裝備加成。
 *
 * `general` 可以是本專案的任一種「武將屬性物件」：
 * - 小寫運行時形狀 `{str, int, hp, mp, speed}`（名冊/戰鬥用的就是它）；
 * - 資料表形狀 `{STR, INT, BaseHP, BaseMP, Speed}`；
 * - 混合也可以，取鍵順序見 `baseStatOf / baseHpOf / baseMpOf`。
 *
 * 口徑同 web `campaign.html:combatStatsOf`：`max(0, trunc(base) + trunc(bonus))`，
 * 無裝備（空表 / 空槽 / 錯槽 / 未知物品）就是原值 + 0。
 */
export function effectiveStatsOf(
  general: unknown,
  equip: EquipBonusSource = null,
  items: readonly unknown[] | null = null,
): EquipStats {
  const base = isRecord(general) ? general : {};
  const bonus = equipBonusOf(equip, items);
  return {
    str: combineStat(baseStatOf(base, ['str', 'STR']), bonus.str),
    int: combineStat(baseStatOf(base, ['int', 'INT']), bonus.int),
    hp: combineStat(baseHpOf(base), bonus.hp),
    mp: combineStat(baseMpOf(base), bonus.mp),
    speed: combineStat(baseStatOf(base, ['speed', 'Speed']), bonus.speed),
  };
}

function combineStat(base: number, bonus: number): number {
  return Math.max(0, Math.trunc(base) + Math.trunc(bonus));
}

/** 依鍵序找第一個「真的有值」的屬性（`''/null/undefined` 視為沒寫） */
function baseStatOf(record: Record<string, unknown>, keys: readonly string[]): number {
  for (let i = 0; i < keys.length; i += 1) {
    const value = record[keys[i]];
    if (value === '' || value === null || value === undefined) continue;
    return numOf(value);
  }
  return 0;
}

/** 生命上限：`hp` → `MaxHP` → `BaseHP`（web `runtimeGeneral` 的 `MaxHP || BaseHP` 口徑） */
function baseHpOf(record: Record<string, unknown>): number {
  const direct = record.hp;
  if (direct !== '' && direct !== null && direct !== undefined) return numOf(direct);
  const maxHp = numOf(record.MaxHP);
  if (maxHp !== 0) return maxHp;
  return numOf(record.BaseHP);
}

/** 技力上限：`mp` → `MaxMP` → `BaseMP` */
function baseMpOf(record: Record<string, unknown>): number {
  const direct = record.mp;
  if (direct !== '' && direct !== null && direct !== undefined) return numOf(direct);
  const maxMp = numOf(record.MaxMP);
  if (maxMp !== 0) return maxMp;
  return numOf(record.BaseMP);
}

/* =====================================================================
 * §4 名字表：物品存檔（Sequence）→ 存檔（名字）
 * =================================================================== */

/** 從 `{名: 行}` 映射裡取某將的行，容忍 key 前後空白 */
function rowOfMap(map: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(map) || !key) return null;
  if (Object.prototype.hasOwnProperty.call(map, key)) {
    const row = map[key];
    return isRecord(row) ? row : null;
  }
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    if (textKey(keys[i]) !== key) continue;
    const row = map[keys[i]];
    return isRecord(row) ? row : null;
  }
  return null;
}

/**
 * 物品存檔 → 四槽名字表（web `normalizeBagEquip` + `equipNames` 的移植）。
 *
 * `itemsSave` 是 `sanguo_items_v1` 的 JSON：`{equip:{武將名:{槽:Sequence}}, bag}`。
 * - 存檔是壞的 / 沒有 `equip` 物件 / 該將沒有紀錄 → 回 `null`（呼叫端回落存檔名表）；
 * - 有紀錄就以它為準（Cocos 的「卸下」會留一行空表，所以缺槽 = 沒裝）；
 * - `items` 表是空的（快照缺失）→ 回 `null`，不要用「解不開」冒充「沒裝」。
 */
export function equipNamesFromBag(
  itemsSave: unknown,
  name: string,
  items: readonly unknown[] | null = null,
): EquipNames | null {
  if (!isRecord(itemsSave) || !isRecord(itemsSave.equip)) return null;
  const key = textKey(name);
  if (!key) return null;
  const row = rowOfMap(itemsSave.equip, key);
  if (!row) return null;
  const rows: readonly unknown[] = Array.isArray(items) ? items : [];
  if (rows.length === 0) return null;

  const out = emptyEquipNames();
  for (let i = 0; i < EQUIP_SLOTS.length; i += 1) {
    const slot = EQUIP_SLOTS[i];
    if (!Object.prototype.hasOwnProperty.call(row, slot)) continue;
    const sequence = Number(row[slot]);
    if (!Number.isFinite(sequence)) continue;
    const item = itemBySequence(rows, sequence);
    if (!item) continue;
    if (itemSlotOf(item) !== slot) continue;
    out[slot] = textOf(item.Name);
  }
  return out;
}

/**
 * 戰役存檔 → 四槽名字表（web `campaign.html:equipNamesOf` + `saves.js:equipSlotsOf`）。
 *
 * 優先 `save.equip[名][槽]`（新格式，名字）；缺的槽回落三張舊表：
 * `weapon → save.weapon[名]`、`horse → save.horse[名]`、`book → save.thing[名]`；
 * `amulet` 只有新格式（舊表沒有寶物欄位）。
 */
export function equipNamesOfSave(save: unknown, name: string): EquipNames {
  const out = emptyEquipNames();
  if (!isRecord(save)) return out;
  const key = textKey(name);
  if (!key) return out;
  const slots = rowOfMap(save.equip, key);
  const legacyWeapon = textOf(legacyRowValue(save, 'weapon', key));
  const legacyHorse = textOf(legacyRowValue(save, 'horse', key));
  const legacyThing = textOf(legacyRowValue(save, 'thing', key));
  out.weapon = (slots ? textOf(slots.weapon) : '') || legacyWeapon;
  out.horse = (slots ? textOf(slots.horse) : '') || legacyHorse;
  out.book = (slots ? textOf(slots.book) : '') || legacyThing;
  out.amulet = slots ? textOf(slots.amulet) : '';
  return out;
}

/** 舊鏡像表 `save.weapon/horse/thing` 是「扁平 {名: 物品名}」，值不是物件 */
function legacyRowValue(save: Record<string, unknown>, field: string, key: string): unknown {
  const map = save[field];
  if (!isRecord(map) || !key) return '';
  if (Object.prototype.hasOwnProperty.call(map, key)) return map[key];
  const keys = Object.keys(map);
  for (let i = 0; i < keys.length; i += 1) {
    if (textKey(keys[i]) !== key) continue;
    return map[keys[i]];
  }
  return '';
}

/**
 * 某將「身上四槽裝備名」的統一入口：
 * 物品存檔有該將紀錄就用它（Cocos 的裝備權威），否則回落戰役存檔的名字表。
 */
export function equipNamesForGeneral(
  generalName: string,
  save: unknown,
  items: readonly unknown[] | null = null,
  itemsSave: unknown = null,
): EquipNames {
  const fromBag = equipNamesFromBag(itemsSave, generalName, items);
  if (fromBag !== null) return fromBag;
  return equipNamesOfSave(save, generalName);
}

/* =====================================================================
 * §5 儲存字串解析（純轉換；真正讀 localStorage 的是 Cocos 呼叫端）
 * =================================================================== */

/** 物品表快照字串（`ItemsPanel.open()` 寫的那份）→ 物品列陣列；壞 JSON / 非陣列 → 空 */
export function equipRowsFromJson(raw: string | null | undefined): EquipItemLike[] {
  if (typeof raw !== 'string' || raw === '') return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: EquipItemLike[] = [];
  for (let i = 0; i < parsed.length; i += 1) {
    const row = parsed[i];
    if (isRecord(row)) out.push(row);
  }
  return out;
}

/** `sanguo_items_v1` 字串 → 物件；壞 JSON / 非物件 → null */
export function equipBagFromJson(raw: string | null | undefined): unknown {
  if (typeof raw !== 'string' || raw === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}
