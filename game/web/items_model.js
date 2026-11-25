/**
 * items_model.js — 物品與裝備的**純邏輯**（無 DOM、無 fetch、無 localStorage）。
 *
 * 資料形狀來自 data/items.json（原作 SANGO.INI 的 [ITEM] 段落，77 件）：
 *   Sequence / Name / Attrib / TYPE / WeaponType / WeaponObject / SearchType / Sort /
 *   Level / Sprite / Rate / STR / INT / MaxHP / MaxMP / Force / Battle / Skill / Speed /
 *   HP / MP / Spirit / Loyal / Tire / Description
 * 數值欄位可能是 ""（原作空字串＝無加成），統一用 num() 讀成 0。
 *
 * 四槽：weapon 兵器 / horse 坐騎 / book 兵書 / amulet 寶物（原作只有 Weapon/Horse/Thing 三槽，
 * amulet 是本重製版新增的第 4 槽，用來掛珠寶類忠誠道具）。
 *
 * 兵符（JEWEL_MISC + Force 位掩碼）**不能裝備**：它只解鎖可用兵種，不加任何屬性，
 * slotOf() 對它回 null，bonusOf() 對它回全 0（見 bonusOf 的第一個 early return）。
 */

export const SLOTS = ['weapon', 'horse', 'book', 'amulet'];

export const SLOT_NAMES = { weapon: '兵器', horse: '坐騎', book: '兵書', amulet: '寶物' };

/** 會參與加成的屬性欄位（順序即 UI 顯示順序）。 */
export const STAT_KEYS = ['STR', 'INT', 'MaxHP', 'MaxMP', 'Speed', 'HP', 'MP', 'Spirit', 'Loyal', 'Tire'];

export const STAT_NAMES = {
  STR: '武力', INT: '智力', MaxHP: '生命上限', MaxMP: '技力上限', Speed: '速度',
  HP: '生命', MP: '技力', Spirit: '士氣', Loyal: '忠誠', Tire: '疲勞',
};

/** 列表分組順序；'talisman' / 'formation' 是不可裝備的兩類使用品。 */
export const GROUP_ORDER = ['weapon', 'horse', 'book', 'amulet', 'talisman', 'formation'];

export const GROUP_LABELS = {
  weapon: '兵 器', horse: '坐 騎', book: '兵 書', amulet: '寶 物',
  talisman: '兵 符', formation: '陣 法',
};

/* ---------- 基礎讀值 ---------- */

/** "" / null / undefined → 0；其餘盡量轉數字。 */
export function num(v) {
  if (v === '' || v === null || v === undefined) return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** 把整數拆成位元清單（Force / Battle 都是 1<<k）。 */
export function bitsOf(mask) {
  const out = [];
  let m = num(mask);
  for (let k = 0; m > 0 && k < 32; k += 1) {
    if (m & 1) out.push(1 << k);
    m >>>= 1;
  }
  return out;
}

/* ---------- 分類 ---------- */

/** TYPE 大類：JEWEL_WEAPON / JEWEL_HORSE / JEWEL_THING / JEWEL_MISC（原作 4 類）。 */
export function typeOf(item) {
  return item && typeof item.TYPE === 'string' ? item.TYPE : '';
}

/** 兵符：JEWEL_MISC 且帶 Force 位掩碼（13 件，只影響可用兵種）。 */
export function isTalisman(item) {
  return typeOf(item) === 'JEWEL_MISC' && num(item && item.Force) > 0;
}

/** 陣法之書：JEWEL_MISC 且帶 Battle 位掩碼（9 件，學會陣形）。 */
export function isFormBook(item) {
  return typeOf(item) === 'JEWEL_MISC' && num(item && item.Battle) > 0;
}

/**
 * 槽位判定，回 'weapon' | 'horse' | 'book' | 'amulet' | null。
 * - JEWEL_WEAPON → weapon（34 件）
 * - JEWEL_HORSE  → horse（8 件）
 * - JEWEL_THING  → book（8 件兵書）
 * - JEWEL_MISC 且 Loyal>0 → amulet（5 件珠寶：布匹/玉器/美女/黃金/珠寶）
 * - 兵符（Force）、陣法之書（Battle）、其餘 → null（使用品，不可裝備）
 */
export function slotOf(item) {
  if (!item || typeof item !== 'object') return null;
  const type = typeOf(item);
  if (type === 'JEWEL_WEAPON') return 'weapon';
  if (type === 'JEWEL_HORSE') return 'horse';
  if (type === 'JEWEL_THING') return 'book';
  if (type === 'JEWEL_MISC' && num(item.Loyal) > 0) return 'amulet';
  return null;
}

export function isEquippable(item) {
  return slotOf(item) !== null;
}

/** 列表分組鍵，永遠有值（不認識的歸 'weapon' 之外另設 'other' 保險，實際資料 77 件都落在前 6 組）。 */
export function groupOf(item) {
  const slot = slotOf(item);
  if (slot) return slot;
  if (isTalisman(item)) return 'talisman';
  if (isFormBook(item)) return 'formation';
  return 'amulet';
}

/* ---------- 加成 ---------- */

export function emptyBonus() {
  const b = {};
  for (const k of STAT_KEYS) b[k] = 0;
  b.Force = 0;
  b.Battle = 0;
  return b;
}

/**
 * 單件物品對某武將的加成（十項屬性 + Force/Battle 位掩碼）。
 * 兵符：一律回全 0 —— 它的 Force 是「可用兵種」開關，不是屬性。
 * general 目前只作簽名保留（原作有等級門檻，但 generals.json 沒有等級欄位，見文件已知缺陷）。
 */
export function bonusOf(item, general) { // eslint-disable-line no-unused-vars
  const b = emptyBonus();
  if (!item || typeof item !== 'object') return b;
  if (isTalisman(item)) return b;         // 兵符不加屬性
  for (const k of STAT_KEYS) b[k] = num(item[k]);
  b.Force = num(item.Force);
  b.Battle = num(item.Battle);
  return b;
}

/* ---------- 物品註冊表（給 applyEquip 解析 Sequence 用） ---------- */

let REGISTRY = new Map();
let BY_NAME = new Map();

/** 用整份 items.json 建立 Sequence → item 與 Name → item 兩張索引。 */
export function registerItems(items) {
  REGISTRY = new Map((items || []).map((it) => [Number(it.Sequence), it]));
  BY_NAME = new Map();
  for (const it of REGISTRY.values()) {
    const name = typeof it.Name === 'string' ? it.Name.trim() : '';
    if (name && !BY_NAME.has(name)) BY_NAME.set(name, it);
  }
  return REGISTRY.size;
}

export function itemOf(seq) {
  return REGISTRY.get(Number(seq)) || null;
}

/** 用物品**名**查（存檔的 `weapon/horse/thing/equip` 存的是名字，不是 Sequence）。 */
export function itemByName(name) {
  const n = typeof name === 'string' ? name.trim() : '';
  return n ? (BY_NAME.get(n) || null) : null;
}

export function allItems() {
  return [...REGISTRY.values()];
}

/* ---------- 裝備表操作 ---------- */

/**
 * 收斂裝備表：只留四槽、槽位必須與物品相符、Sequence 必須存在。
 * 形狀是 { 槽位: Sequence }，一個槽天然只有一個值 —— 這就是「同槽只能一件」的來源。
 */
export function normalizeEquips(equips) {
  const out = {};
  if (!equips || typeof equips !== 'object') return out;
  for (const slot of SLOTS) {
    if (!(slot in equips)) continue;
    const seq = Number(equips[slot]);
    const item = itemOf(seq);
    if (!item) continue;
    if (slotOf(item) !== slot) continue;
    out[slot] = seq;
  }
  return out;
}

/** 裝上（同槽直接取代，回傳新表；被取代的那件自動回背包，因為背包是「擁有」清單）。 */
export function equipItem(equips, seq) {
  const item = itemOf(seq);
  const slot = slotOf(item);
  const next = normalizeEquips(equips);
  if (!slot) return next;                 // 兵符/陣法書 → 原樣返回
  next[slot] = Number(seq);
  return next;
}

/** 卸下某槽，回傳新表。 */
export function unequipSlot(equips, slot) {
  const next = normalizeEquips(equips);
  delete next[slot];
  return next;
}

/** 某件物品是不是正裝備在某張裝備表上，回傳槽位或 null。 */
export function equippedSlot(equips, seq) {
  const clean = normalizeEquips(equips);
  const n = Number(seq);
  for (const slot of SLOTS) if (clean[slot] === n) return slot;
  return null;
}

/** 四槽加成合計。 */
export function totalBonus(equips) {
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
 * 額外掛 _bonus（各項加總）與 _equips（實際生效的 {槽:Sequence}）。
 * 生命/技力上限請在呼叫前把武將的 MaxHP/MaxMP 設成 BaseHP/BaseMP（頁面用 runtimeGeneral() 做）。
 */
export function applyEquip(general, equips) {
  const base = general && typeof general === 'object' ? general : {};
  const clean = normalizeEquips(equips);
  const bonus = emptyBonus();
  const used = {};

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

  const out = { ...base };
  for (const k of STAT_KEYS) out[k] = num(base[k]) + bonus[k];
  out._bonus = bonus;
  out._equips = used;
  return out;
}

/** 把 generals.json 的一筆轉成「可套裝備」的形狀：MaxHP/MaxMP 取 BaseHP/BaseMP。 */
export function runtimeGeneral(g) {
  const base = g || {};
  return {
    ...base,
    MaxHP: num(base.MaxHP) || num(base.BaseHP),
    MaxMP: num(base.MaxMP) || num(base.BaseMP),
  };
}

/** 加成表的可讀字串，例如 "武力 +30 · 智力 +20"；全 0 時回 "無屬性加成"。 */
export function bonusText(item) {
  const b = bonusOf(item);
  const parts = [];
  for (const k of STAT_KEYS) if (b[k]) parts.push(`${STAT_NAMES[k]} ${b[k] > 0 ? '+' : ''}${b[k]}`);
  return parts.length ? parts.join(' · ') : '無屬性加成';
}

/* ---------- R86 S2-2：items.html ↔ 存檔 的橋 ---------- */
//
// items.html（凍結）把裝備寫在 localStorage 的 `sanguo_items_v1` 裡，形狀
//   { equip: { 將名: { 槽: Sequence } }, bag: [Sequence...] }
// 而存檔（saves.js 的 v3）用**物品名**：`weapon/horse/thing` 三張鏡像表 + 可選的
// `equip = { 將名: {weapon,horse,book,amulet} }`。下面這幾個純函數就是兩邊的翻譯層：
// 頁面不需要知道 Sequence，存檔不需要知道 items.json 的索引。

/** items.html / city_model.js 共用的背包鍵（同一個 localStorage key）。 */
export const EQUIP_KEY = 'sanguo_items_v1';

/** 收斂頁面存下來的 `equip` 表：`{將名:{槽:Sequence}}` → 只留合法槽與存在的物品。 */
export function normalizeBagEquip(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, row] of Object.entries(raw)) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n || !row || typeof row !== 'object' || Array.isArray(row)) continue;
    const clean = normalizeEquips(row);
    if (Object.keys(clean).length) out[n] = clean;
  }
  return out;
}

/** `{槽: Sequence}` → `{槽: 物品名}`（存檔口徑；未知/錯槽的序號直接丟掉）。 */
export function equipNames(equips) {
  const out = {};
  const clean = normalizeEquips(equips);
  for (const slot of SLOTS) {
    const item = itemOf(clean[slot]);
    if (!item) continue;
    const name = typeof item.Name === 'string' ? item.Name.trim() : '';
    if (name) out[slot] = name;
  }
  return out;
}

/** `{槽: 物品名}` → `{槽: Sequence}`（寫回 items.html 用；名字不認得就丟）。 */
export function equipSeqs(names) {
  const out = {};
  if (!names || typeof names !== 'object' || Array.isArray(names)) return out;
  for (const slot of SLOTS) {
    const item = itemByName(names[slot]);
    if (!item || slotOf(item) !== slot) continue;
    out[slot] = Number(item.Sequence);
  }
  return out;
}

/** 四槽（物品名口徑）的加成合計；簽名與 `totalBonus` 同形狀。 */
export function bonusOfNames(names) {
  return totalBonus(equipSeqs(names));
}

/** 套裝備（物品名口徑）：回傳新武將物件，屬性 = 基礎 + 四槽。 */
export function applyEquipNames(general, names) {
  return applyEquip(general, equipSeqs(names));
}
