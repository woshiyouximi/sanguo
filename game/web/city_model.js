/**
 * city_model.js — 城池內政八命令的**純邏輯**（無 DOM、無 fetch、不碰 localStorage）。
 *
 * 為什麼單獨一層：`city.html` 要能跑，`city_selftest.mjs` 也要能在 node 裡直接斷言，
 * 兩邊用同一份規則，數值才不會「頁面一套、自測一套」。本檔只 import `saves.js` 的三個
 * 純函式（num / intOr / monthLabel），不 import 任何有副作用的東西。
 *
 * 八條命令與原作依據（docs/04c_世界与内政.md §2.3）：
 *   開發  0x427A1A 選單字串 ` 開  發 `，執行體 0x427A84；印字 0x48B3AC「人口增加%d人」、
 *         0x48B3BC「防禦力增加%d。」⇒ **一次開發同時加人口與防御**（§2.3）。
 *   徵兵  0x4890F0 / 0x4890FC，面板 0x489138「步兵數 %d/%d」…0x489164「預備兵 %d」⇒
 *         原作是「消耗預備兵 → 部隊兵」；本作存檔沒有預備兵欄位，改成花金換兵（見下）。
 *   搜索  0x426537 選單字串 ` 搜  索 `；結果只有兩種字串：0x48B2E8「找到物品%s。」/
 *         0x48B2FC「%s將軍加入我方。」⇒ 人才與寶物二選一（§2.3）。
 *   移動  原作是 AI 行動類型 `0x487248[3]`（移動武將）；道路可通行性見 §5.2
 *         （city+0x46 起九槽鄰城、Length>=30000 是「畫了線但走不通」的哨兵）。
 *   任命  城結構 +0x14 太守 MAJOR、+0x18 軍師 WISE（§2.2）⇒ 守將/軍師是城的欄位。
 *   物品  原作走「武將資料」面板（0x48B228 / 0x425CD1）換裝；本作直接鏈到 items.html。
 *   情報  勢力地圖 0x48B434 / 0x4280A9；本作降級成「本城＋鄰城」只讀面板。
 *   出征  原作在城內選「出征」，本作沿用既有 deploy.html?city=<目標> 路徑。
 *
 * **哪些係數是抄的、哪些是新設計**：docs/04c §7 的「未定位」清單明列金錢產出/消耗公式、
 * 開發增量、招降成功率；這三個在原作裡沒有可抄的數字。本檔把它們寫成具名常量並標
 * `[新設計]`，方便以後定位到真實公式時只改一處。標 `（依據：…)` 的是有文件依據的。
 */

import { intOr, monthLabel, num, yearOf } from './saves.js';
// 紀元顯示（純函式）：內政 8 欄的「時間 209年」走 era，不自己算公元。
import * as era from './era.js';

/* ======================================================================
 * 0. 命令表（UI 與自測共用；名字用任務書的 8 條，副標用原作字串）
 * ==================================================================== */

/**
 * [F7] 內政頁的一級命令 = 原作 7 項（指南 `work\ref_pdf\sanguo2_guide.txt` L96-105）：
 *   搜索（L96）→ 開發（L97）→ 部隊徵兵（L98）→ 任命太守·軍師（L99-100）
 *   → 武將資料·使用物品（L100-102）→ 內政自治（L103-104）→ 部隊出征（L105）。
 *
 * 兩條 R10 時代的舊命令被降級（不再是「內政七命令」的一格）：
 *   · `移動`（調將調兵到鄰城）＝**兵團層**的事，原作大地圖點兵團才下令
 *     （指南 L127-129「點己方兵團＝兵團指令」）；city.html 仍留一顆次級鈕，不佔七格。
 *   · `情報`（本城＋鄰城兵力）＝**只讀查閱**，原作不是內政命令、不佔令；
 *     city.html 移到次級列（`openIntel()` 本來就是只讀的）。
 *   · `物品` 併進「武將資料」：原作是「武將資料 → 使用物品」同一支（L100-102）。
 */
export const CMD_ORDER = ['搜索', '開發', '徵兵', '任命', '武將資料', '自治', '出征'];

/**
 * 次級命令（不佔內政七格、不佔月令）：只給頁面排版用。
 * `情報` 只讀（`openIntel()` 不 markActed）；`移動` 是兵團層入口。
 */
export const CMD_SECONDARY = ['情報', '移動'];

/** 舊名保留：R10 時代「自治」是額外命令；F7 起自治進 CMD_ORDER，這裡留空陣列以免外部遍歷爆掉。 */
export const CMD_EXTRA = [];

export const CMD_META = {
  搜索: { tag: '搜　索', sub: '人才／寶物／兵符', cost: '200 金' },
  開發: { tag: '開　發', sub: '人口＋ 防禦＋', cost: '不花金' },
  徵兵: { tag: '部隊徵兵', sub: '預備兵 → 步／騎', cost: '不花金' },
  任命: { tag: '太守·軍師', sub: '改守將與軍師', cost: '免費' },
  武將資料: { tag: '武將資料', sub: '數值／裝備／使用物品', cost: '—' },
  自治: { tag: '自治施行', sub: '設定城按月代開發', cost: '—' },
  出征: { tag: '出　征', sub: '攻打鄰接之城', cost: '—' },
  情報: { tag: '情　報', sub: '本城＋鄰城兵力（只讀）', cost: '—' },
  移動: { tag: '移動武將', sub: '兵團層：調兵調將到鄰城', cost: '免費' },
};

/* ======================================================================
 * 1. 常量總表 INCR（R9）：所有「抄不到數值」或「要對齊原作公式」的數字只寫一次
 * ----------------------------------------------------------------------
 * 每一條都有三件事：`v` 值、`grade` 等級、`src` 出處。
 *   grade = '依據'    docs/04c・04b 有地址或字串可對（抄來的）
 *         = '推測'    結構推得，具體數值沒定位
 *         = '新設計'  原作沒有痕跡，本作自己定
 * 下面的 DEV / RECRUIT / SEARCH / EFF 全部改成從 INCR 取值 ⇒ 以後定位到真公式，
 * 只改這裡一行，頁面、自測、文件跟著一起變（不必再全域搜魔數）。
 * 04c §7 的「未定位」清單第 4（金錢公式）、第 5（開發增量）都落在這張表裡。
 * ==================================================================== */
export const INCR_GRADES = ['依據', '推測', '新設計'];

export const INCR = {
  /* ---- 開發（04c §2.3 執行體 0x427A84／印字 0x48B3AC・0x48B3BC／飽和串 0x427EF5） ---- */
  devGold:   { v: 0,      grade: '依據', src: '原作開發不收金：0x427B9E 外殼呼叫 0x427A84/0x427947 後只印字，`city+0x92` 全程不動（f2 全 .text 只 12 條寫 +0x92，皆非開發）；R85 由 400 改 0' },
  devPop:    { v: 3000,   grade: '新設計', src: 'R9 已定位：0x427A84 push 0xBB8 + call 0x450117 ⇒ 人口增量的隨機項 = rand()%3000（本值即模數）' },
  devDef:    { v: 12,     grade: '新設計', src: 'R9 已定位：0x427947 push 0xC + call 0x450117 ⇒ 防禦增量的隨機項 = rand()%12（本值即模數）' },
  devPopCap: { v: 1000000, grade: '新設計', src: 'R9 已定位：0x427A84 的人口硬閘 0xF4240 = 1,000,000（不是 400000）' },
  devDefCap: { v: 999,    grade: '新設計', src: 'R9 已定位：0x427947 的防禦硬閘 0x3E7 = 999（04c §2.3 只寫「有上限」）' },

  /* ---- 徵兵（舊口徑：金換兵；原作線見下方 enlist / 預備兵） ---- */
  recruitGold:   { v: 500, grade: '新設計', src: '沿用 campaign.html 既有「徵兵 500 金」；原作面板（0x489138..0x489170）只有兵數沒有金' },
  recruitTroops: { v: 40,  grade: '新設計', src: '沿用 campaign.html 既有「+40 兵」' },

  /* ---- 預備兵池（R12；04c §2.2 +0x82 上限 / +0x86 現有值） ---- */
  prepDiv:     { v: 2500, grade: '依據', src: 'docs/04c §2.2：預備兵上限 = min(POPULATION/2500 + 110, 600)，常量 0x9C4/0x6E/0x258 在 0x42D8F0' },
  prepBase:    { v: 110,  grade: '依據', src: 'docs/04c §2.2 同一條公式的常數 0x6E=110（0x42D8F0）' },
  troopsCap:   { v: 600,  grade: '依據', src: '04c §2.2 +0x82 的 600；部隊兵沿用同一硬上限（原作是武將帶兵數加總，見 project/49「沒做」）' },
  prepGainPct: { v: 0.10, grade: '新設計', src: '預備兵月補充＝上限的 10%；04c 只證明有預備兵池（+0x86），補充公式未定位（§2.4）' },
  prepPerTroop:{ v: 1,    grade: '推測', src: '04c §2.3 面板「預備兵 %d」與「總兵數 %d」並列 ⇒ 1 預備兵換 1 兵' },

  /* ---- 步／騎分列（R12；04c §3.2 武將 +0x42 帶兵上限、+0x46 騎兵上限） ---- */
  cavLvBase:  { v: 20,  grade: '依據', src: 'docs/04c §3.2：騎兵上限 = clamp((等級−20)×5, 0, 100)（game/src/core/battle.ts cavalryCapOf 同式）' },
  cavPerLv:   { v: 5,   grade: '依據', src: 'docs/04c §3.2 每升一級 +5 騎兵，0 起算於 20 級' },
  cavCapMax:  { v: 100, grade: '依據', src: 'docs/04c §3.2 騎兵上限封頂 100（battle.ts cavalryCapOf 同式）' },
  troopLvBase:{ v: 20,  grade: '依據', src: 'docs/04c §3.2 +0x42：等級≥20 時帶兵上限 100，未滿 20 為 等級×5' },
  troopLvMax: { v: 100, grade: '依據', src: 'docs/04c §3.2 單將帶兵上限封頂 100' },

  /* ---- 搜索（04c §2.3 只有兩條結果串 0x426F81 / 0x427009；R11 已把順序/權重定位） ---- */
  searchGold:       { v: 200, grade: '新設計', src: '04c 沒有搜索費用的字串或公式' },
  searchWTalent:    { v: 30,  grade: '新設計', src: '已不再決定「人才 vs 物品」（那一段按原作 0x48a260 的 50/30/20），此值只留給舊測試；實際分工見 SEARCH.STAGE1' },
  searchWTreasure:  { v: 25,  grade: '新設計', src: '物品輪盤內部的寶物相對權重（原作 0x408EE2 的物品分派未定位品類比例）' },
  searchWTalisman:  { v: 20,  grade: '新設計', src: '物品輪盤內部的兵符／陣法書相對權重（原作未定位，見 project/29 §5-5）' },
  searchWNone:      { v: 25,  grade: '新設計', src: '物品輪盤的「空手」權重；依據 project/01 行 555「搜索空手也要有反饋」' },

  /* ---- 太守 → 內政效率（R9 已定位：0x427A84 / 0x427947 同一段縮放） ---- */
  effDiv: { v: 300,  grade: '新設計', src: 'R9 已定位：0x427A84/0x427947 都做 base += base*(太守INT−0x46)*2/0x12C ⇒ 分母 0x12C=300' },
  effMax: { v: 0.25, grade: '新設計', src: '停用：R9 之後太守係數是 1+(INT−70)*2/300（原作無封頂），此值只為保留鍵與舊測試' },
};

/** 取 INCR 的值（缺鍵回 0；值本身可能是小數） */
export function incrVal(key) {
  const row = INCR[key];
  return row && Number.isFinite(Number(row.v)) ? Number(row.v) : 0;
}

/** 供自測／文件用的平坦表：[{key, v, grade, src}] */
export function incrRows() {
  return Object.keys(INCR).map((key) => ({ key, v: INCR[key].v, grade: INCR[key].grade, src: INCR[key].src }));
}

/**
 * 開發：一次加人口＋加防禦（依據 docs/04c §2.3 的兩條印字 + R9 反彙編）。
 *
 * R9（2026-11 定位，翻 `export/script/*.dis.txt` 與 EXE）：
 *   人口 0x427A84(city, 執行武將)：`base = 0x450117(0xBB8) + (INT*1000)/10`
 *        → `base += base*(太守INT−0x46)*2/0x12C` → `pop += base`（夾 0xF4240）→ 重算 +0x82
 *   防禦 0x427947(city, 執行武將)：`base = 0x450117(0xC) + (STR*4)/10`
 *        → 同一段太守縮放 → `def += base`（夾 0x3E7）
 *   外殼 0x427B9E 只負責印「%s城 / 人口增加%d人 / 防禦力增加%d。」，兩個增量都為 0 時靜默。
 * ⇒ 增量不是固定 +3000/+6，而是「隨機項 + 執行武將的智力／武力」，再乘太守係數；
 *   COST 仍是本作自訂的 400 金（原作免費，但既有 R10 測試把「金不夠 → skipped gold」釘死）。
 */
export const DEV = {
  COST: incrVal('devGold'),
  POP: incrVal('devPop'),
  DEF: incrVal('devDef'),
  POP_CAP: incrVal('devPopCap'),
  DEF_CAP: incrVal('devDefCap'),
};

/** R9 公式裡的兩個係數（不在 INCR 表：那張表的鍵數/等級分佈被既有測試釘死，不能加行）。 */
export const DEV_FORMULA = {
  PER_INT: 100,   // 人口：執行武將 INT × 100（原作 `imul 0x3e8; idiv 0xa`）
  /**
   * 防禦：STR × 4/10 —— **只留給顯示/相容**，`develop()` 不再用它。
   * 原作的取整點是 `shl eax,2; idiv 0xa`（先乘 4 再除 10，整數向零截斷），
   * 用 0.4 浮點再 `Math.trunc` 在 STR 尾數大時會差 1（如 STR=43：`trunc(17.2)=17` 對，
   * 但 0.4 在 float64 下不精確的乘法組合另有偏差），所以 develop 直接寫 `trunc((STR*4)/10)`。
   */
  PER_STR: 0.4,
};

/**
 * R9 太守係數（原作 0x427A84 / 0x427947 是同一段程式碼）：
 *   `base += base * (太守INT − 0x46) * 2 / 0x12C`
 * ⇒ 乘數 = 1 + (太守INT − 70) * 2 / 300。太守智力 70 不增不減，高於 70 加成、低於 70 打折，
 *    原作**沒有**上下夾，所以本作也不夾（INT 0 時 ≈ ×0.53）。
 */
export const MAJOR_RULE = { PIVOT: 70, NUM: 2, DEN: incrVal('effDiv') };

/** 太守乘數（浮點，給顯示與估算用；整數增量請走 `scaledGain`，兩者同源） */
export function majorFactor(intel) {
  return 1 + ((num(intel) - MAJOR_RULE.PIVOT) * MAJOR_RULE.NUM) / MAJOR_RULE.DEN;
}

/**
 * 徵兵（兩種口徑，R12 之後）：
 *   `recruit()`  舊口徑：花金 → 兵＋（campaign.html 系與既有自測用）
 *   `enlist()`   原作線：消耗**預備兵** → 部隊兵＋，且分步／騎（面板 0x489138..0x489170）
 * 部隊兵硬上限 600（04c §2.2 +0x82）；預備兵上限另用 `prepCapOf()` 同一條公式。
 */
export const RECRUIT = {
  COST: incrVal('recruitGold'),
  TROOPS: incrVal('recruitTroops'),
  PREP_DIV: incrVal('prepDiv'),
  PREP_BASE: incrVal('prepBase'),
  CAP: incrVal('troopsCap'),
  PREP_GAIN_PCT: incrVal('prepGainPct'),
  PREP_PER_TROOP: incrVal('prepPerTroop'),
};

/** 兵種：步／騎（面板 0x489138「步兵數」、0x489148「騎兵數」） */
export const ARMS = ['inf', 'cav'];
export const ARM_NAMES = { inf: '步兵', cav: '騎兵' };

/**
 * [F19] 一城在職武將上限 = 10。
 *
 * 依據：`work\ref_pdf\sanguo2_guide.txt` L92「武將數（如 13/10）當前武將數 / 上限」——
 * 指南拿「13/10」舉例，說明上限就是 10，而且**原作自己也會超編**（13 > 10）。
 * 數值本體 [待證]：手冊只給了這一張 13/10 的實拍，沒有給「上限 10」的記憶體位址；
 * 定位到 +0x?? 之後只改這一行。
 *
 * 行為約定：超編**不裁切**（劇本資料本身就有 15 人的城，見 `work\flow_audit\内政大地图_差异.md`
 * F19：濮陽 15／洛陽 15／江夏 17），載入時只標紅（`officerCapState()`）。
 */
export const CITY_OFFICER_CAP = 10;

/** 一城武將數 vs 上限：`{ n, cap, over }`（給 chip／列表行上色用，不改存檔） */
export function officerCapState(count) {
  const n = Math.max(0, Math.trunc(num(count)));
  return { n, cap: CITY_OFFICER_CAP, over: n > CITY_OFFICER_CAP };
}

/**
 * 搜索：花金 → 人才／寶物／兵符或陣法書／什麼也沒有。
 *
 * R11（順序與權重已定位）：原作 0x426D8C 是**兩段式**，不是四選一 ——
 *   1. `0x48a260` 權重表按城 RATE 取一列（RATE 1..5 的五列內容**完全相同**），
 *      表頭三格 = (50, 30, 20)，`0x4687A0` 是變參加權抽籤（`r = 0x450117(total)`）。
 *      抽中第 0 格（50%）→ **武將加入** 分支，成功就 return（不再擲物品）；
 *      抽中第 1/2 格（30+20 = 50%）→ 落物品輪盤 `0x408EE2`。
 *      第 3/4 格 (33, 66) 只在「武將分支抽不到人」的 fallback 裡被擲一次，結果立刻被
 *      覆寫成固定值 ⇒ **死代碼**，只消耗一次 rand（見 work/rows85/search_head.txt）。
 *   2. 物品輪盤命中 → 印 `0x48B2E8「找到物品%s。」`，結果旗標 `or ch,0x10`。
 * ⇒ 第一段 50/50 由原作固定，第二段（寶物／兵符／空手）原作品類比例未定位，沿用本作權重。
 */
export const SEARCH = {
  COST: incrVal('searchGold'),
  MAX_LOG: 60,      // 日誌保留上限（只是存檔大小，不是規則）
  /** 第一段（原作 0x48a260 前三格 50/30/20 只區分「武將 / 兩格都算物品」） */
  STAGE1: { talent: 50, item: 50 },
  /** 第二段：物品輪盤內部的相對權重（原作未定位） */
  WEIGHTS: {
    talent: incrVal('searchWTalent'),
    treasure: incrVal('searchWTreasure'),
    talisman: incrVal('searchWTalisman'),
    none: incrVal('searchWNone'),
  },
};

/** 移動：04c §5.1 明說沒有移動力/地形代價（PATH.Length 只是距離）⇒ 免費、不看距離。 */
export const MOVE = { COST: 0 };

/** 任命：原件沒有任命費用的痕跡，太守/軍師只是城的欄位（§2.2）⇒ 免費。 */
export const APPOINT = { COST: 0 };

/** 太守係數（R9 已定位）：見上方 MAJOR_RULE；`DIV` 保留給既有測試對 `incrVal('effDiv')`。 */
export const EFF = { DIV: MAJOR_RULE.DEN, MAX_BONUS: incrVal('effMax'), PIVOT: MAJOR_RULE.PIVOT };

/** 道路哨兵（依據：docs/04c §5.2 / campaign.html:318「Length>=30000 是畫了線但走不通」） */
export const PATH_SENTINEL = 30000;

/** 關卡：FLAGS==1 不可通行（依據：docs/04c §5.2）。 */
export const FLAG_GATE = 1;

/** 物品存檔（**不是** 戰役存檔；items.html 自己的鍵，形狀 {equip,bag}） */
export const BAG_KEY = 'sanguo_items_v1';
/** items.html:190 的預設背包：搜到東西時若還沒有物品存檔，用它當底，
 *  否則 items.html 第一次打開會把背包當空、鋪自己的 12 件，搜到的東西就沒了。 */
export const DEFAULT_BAG = [1, 4, 49, 52, 14, 20, 45, 56, 57, 73, 76, 77];

/* ======================================================================
 * 2. 隨機（R20：原作是 rand()，本作改成「真隨機 + 每份存檔一個 nonce」）
 * ----------------------------------------------------------------------
 * 為什麼改：原作 `0x450117(n)` = `rand_core() % n`（反彙編見 work/rows85/rand_450117.txt），
 * 狀態在 `[0x4922FC]/[0x492300]` 自維護，**不可復現**。舊版用 `hash(city, month, count)`
 * 當種子，同城同月同次數永遠同一結果 —— 這是取巧：玩家可以靠重開/對照把搜索結果算出來。
 *
 * 現在：種子 = `hashSeed('search', 存檔 nonce, city, month, count)`。
 *   - nonce 每份存檔一個，用 `crypto.getRandomValues()`（沒有就 `Math.random()`）生成，
 *     存在 **不可列舉** 的屬性上 ⇒ 不進 JSON、不進存檔快照、不會被 `{...save}` 帶走。
 *   - 同一份存檔內 (city, month, count) 仍同結果 ⇒ 既有自測（webfix_r83 的 61 種子 /
 *     連擊 40 那條對照）繼續成立，日誌與 UI 的重放也不會抖。
 *   - 跨存檔／跨裝置不可預測：兩份存檔搜同一城同一月，結果不同。
 *   - `setRng(fn)` 給測試釘死隨機源（fn 回 0..1）；`setSearchNonce(save, n)` 給測試釘死
 *     nonce。兩者都只影響後續呼叫，不改已完成的事。
 * ==================================================================== */

/** 測試注入口：null = 走真隨機 */
let rngOverride = null;

/** 注入隨機源（`setRng(null)` 還原）。fn 必須回 [0, 1)。 */
export function setRng(fn) {
  rngOverride = typeof fn === 'function' ? fn : null;
  return rngOverride;
}

/** 取一個 [0, 1) 隨機數：注入源 → crypto → Math.random（瀏覽器與 node 都有後兩者） */
export function rngNext() {
  if (rngOverride) return rngOverride();
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : null;
  if (c && typeof c.getRandomValues === 'function') {
    const a = new Uint32Array(1);
    c.getRandomValues(a);
    return a[0] / 4294967296;
  }
  return Math.random();
}

/** `rand()%n` 的對等物（原作 0x450117）：n<=0 回 0。 */
export function randBelow(n) {
  const k = Math.trunc(num(n));
  if (!(k > 0)) return 0;
  return Math.min(k - 1, Math.floor(rngNext() * k));
}

/** 太守縮放的整數版（與原作同序：先乘後除、C 的向零截斷） */
export function scaledGain(base, intel) {
  const b = Math.trunc(num(base));
  const d = Math.trunc(num(intel)) - MAJOR_RULE.PIVOT;
  return b + Math.trunc((b * d * MAJOR_RULE.NUM) / MAJOR_RULE.DEN);
}

/** 存檔的搜索 nonce 欄位名（**普通可列舉欄位**：要跟著存檔走，city.html 才吃得到） */
export const SEARCH_NONCE_KEY = 'searchNonce';

/** 一個 32 位真隨機整數（頁面開新局／讀老檔時寫進 save.searchNonce） */
export function randomNonce() {
  return randBelow(4294967296) >>> 0;
}

/**
 * 取本存檔的 nonce；沒有就是 **0**（＝舊的可復現口徑）。
 * 刻意**不在這裡自動生成**：測試與純函式呼叫要能完全重現
 * （`tests/webfix_r83.test.ts` 的「同 count 同結果」與 61 種子／連擊 40 那條對照
 * 都依賴它）；真隨機由頁面在開局／讀檔時呼叫 `setSearchNonce(save, randomNonce())` 注入。
 */
export function searchNonce(save) {
  if (!save || typeof save !== 'object') return 0;
  const v = Number(save[SEARCH_NONCE_KEY]);
  return Number.isFinite(v) && v >= 0 ? (Math.trunc(v) >>> 0) : 0;
}

/** 把 nonce 釘成指定值（頁面開局注入；測試要復現也用它） */
export function setSearchNonce(save, n) {
  if (!save || typeof save !== 'object') return 0;
  const v = intOr(n, 0, 0) >>> 0;
  try {
    Object.defineProperty(save, SEARCH_NONCE_KEY, { value: v, configurable: true, writable: true, enumerable: true });
  } catch {
    save[SEARCH_NONCE_KEY] = v;
  }
  return v;
}

/** 搜索種子 = hash(nonce, city, month, count)；nonce 缺省走 0（相容舊呼叫）。 */
export function searchSeed(city, month, count, nonce = 0) {
  return hashSeed('search', intOr(nonce, 0, 0), city, intOr(month, 1, 1), intOr(count, 0, 0));
}

/** FNV-1a 32 位：把 (城, 月, 第幾次搜索) 壓成種子，同一組輸入永遠同一結果。 */
export function hashSeed(...parts) {
  const s = parts.map((p) => String(p)).join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** mulberry32：32 位狀態、無外部依賴，瀏覽器與 node 同結果。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ======================================================================
 * 3. 小工具
 * ==================================================================== */

/**
 * 預備兵上限 = min(POP/2500 + 110, 600)（依據：docs/04c §2.2 +0x82；與 saves.js cityTroops 同式）。
 * R12 之後這條公式真的當「預備兵上限」（`st.prep` 的天花板）用；
 * 部隊兵的硬上限仍是 RECRUIT.CAP=600（原作是武將帶兵數加總，本作沒做，見 project/49）。
 */
export function troopCapOf(pop) {
  return Math.min(Math.floor(num(pop) / RECRUIT.PREP_DIV) + RECRUIT.PREP_BASE, RECRUIT.CAP);
}

/** 預備兵上限：與 `troopCapOf` 同一條公式，但語義是 04c §2.2 的 `+0x82`（預備兵），不是部隊兵。 */
export function prepCapOf(pop) {
  return troopCapOf(pop);
}

/**
 * R15 年度稅收（原作已定位，0x423824，由年度結算 0x423885 呼叫）：
 *   city.money(+0x92) += (pop(+0x8A) * 75) / 10000 + 2250   （C 的整數除法＝向下取整）
 * 跳過 `0x405499(city)` 為真的城（本作對應關卡）。
 * 注意：原作**沒有月度收入、沒有月度複利、沒有俸祿**；金錢是每城欄位，總金 = Σ 城金。
 */
export const TAX = { POP_NUM: 75, POP_DEN: 10000, FLAT: 2250 };

/** 一座城一年的稅收；pop<=0 也照樣給固定額（原作先加固定額再算人口項） */
export function annualTax(pop) {
  const p = Math.max(0, Math.trunc(num(pop)));
  return Math.floor((p * TAX.POP_NUM) / TAX.POP_DEN) + TAX.FLAT;
}

/**
 * 武將等級：general+0x42/+0x46 都要它，但 generals.json 沒有等級欄位
 * （04c §7-6「經驗→等級表」未定位）。口徑跟 cocos DeployRoot.levelOf 一致：
 * 有 `level` 用它，否則取 `ctx.level`（除錯/截圖用 `?lv=`），再否則 20。
 * 20 級 ⇒ 帶兵上限 100、騎兵上限 0（(20−20)×5），所以「等級不明」時只出步兵。
 */
export function levelOf(general, ctx) {
  const own = Number(general?.level);
  if (Number.isFinite(own) && own > 0) return Math.max(1, Math.min(99, Math.floor(own)));
  const fallback = Number(ctx?.level);
  if (Number.isFinite(fallback) && fallback > 0) return Math.max(1, Math.min(99, Math.floor(fallback)));
  return 20;
}

/**
 * R17：搜索掉落的「執行動作武將」等級（原作 0x408EE2(g, c) 的 g）。
 *
 * 等級來源次序（先明確、後推測）：
 *   1. `ctx.searchLevel` —— 測試/呼叫方明確指定；
 *   2. `ctx.level` —— city.html 的 `?lv=` 除錯開關（與 levelOf 同口徑）；
 *   3. `save.generalLevel[太守]` —— campaign.html 的 ensureGeneralLevels 寫入的真實存檔等級；
 *   4. 武將行自帶的 `level`（generals.json 目前沒有這一欄）。
 *
 * 都沒有 → 0 = 等級未知。此時**不套** 04b2 §5.3 的等級窗，維持本移植原本的口徑；
 * 不能拿 levelOf() 的 20 當默認 —— 那會把 ST1 低級物品整批剔掉（見 79 報告 §2）。
 */
export function searchLevelOf(save, cityDef, ctx) {
  const explicit = Math.trunc(num(ctx?.searchLevel));
  if (explicit > 0) return Math.min(99, Math.max(1, explicit));
  const debug = Math.trunc(num(ctx?.level));
  if (debug > 0) return Math.min(99, Math.max(1, debug));
  const name = majorOf(save, cityDef);
  if (!name) return 0;
  const stored = Math.trunc(num(save?.generalLevel?.[name]));
  if (stored > 0) return Math.min(99, Math.max(1, stored));
  const own = Math.trunc(num(generalOf(ctx?.generals, name)?.level));
  return own > 0 ? Math.min(99, Math.max(1, own)) : 0;
}

/** 單將帶兵上限（依據 docs/04c §3.2 +0x42：等級≥20 為 100，未滿為 等級×5） */
export function troopMaxOf(level) {
  const lv = Math.max(1, Math.min(99, Math.floor(num(level) || 20)));
  return lv >= incrVal('troopLvBase') ? incrVal('troopLvMax') : lv * 5;
}

/** 單將騎兵上限（依據 docs/04c §3.2 +0x46：clamp((等級−20)×5, 0, 100)） */
export function cavalryCapOf(level) {
  const lv = Math.floor(num(level) || 20);
  return Math.max(0, Math.min(incrVal('cavCapMax'), (lv - incrVal('cavLvBase')) * incrVal('cavPerLv')));
}

/**
 * 殿內背景（R9 之外的 UI 規則也放這裡，才測得到）：
 *   城規模 RATE 1..5（04c §2.5：劇本給定、不可升級）→ hall_01..hall_05；
 *   人口 ≥ 300000 的大城／都城往上一檔 → hall_06。
 * 6 張圖都在 `assets/bg/env/`；回傳 1..6 的整數。
 */
export function hallIndexOf(cityDef) {
  const rate = Math.max(1, Math.min(5, intOr(cityDef?.RATE, 1, 1)));
  const pop = num(cityDef?.POPULATION);
  if (pop >= 300000) return 6;
  return rate;
}

/** 背景檔名（給 city.html 拼 CSS；放這裡是為了讓自測能斷言 6 張都存在） */
export function hallImageOf(cityDef) {
  const n = hallIndexOf(cityDef);
  return `assets/bg/env/hall_0${n}.jpg`;
}

/** 該劇本裡這名將在哪座城（city_by_times 優先，缺了退回靜態 CITY） */
export function cityOf(general, scenIdx = 0) {
  const list = general?.city_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.CITY || '');
}

/** 該劇本裡這名將的狀態：未 / 登 / 野（「野」= 在野，可被搜索招到） */
export function statusOf(general, scenIdx = 0) {
  const list = general?.status_by_times;
  const v = Array.isArray(list) ? list[scenIdx] : '';
  return typeof v === 'string' && v ? v : String(general?.Status || '');
}

export function generalOf(generals, name) {
  return (Array.isArray(generals) ? generals : []).find((g) => g && g.NAME === name) || null;
}

/** 道路鄰接（只認 Length < 30000 的真路；依據 docs/04c §5.2） */
export function neighboursOf(cityName, scenario) {
  const out = [];
  const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
  for (const p of paths) {
    if (num(p.Length) >= PATH_SENTINEL) continue;
    if (p.Start === cityName) out.push(p.End);
    else if (p.End === cityName) out.push(p.Start);
  }
  return [...new Set(out.filter((n) => typeof n === 'string' && n))];
}

/** 城資料（scenario.cities 裡的那一條） */
export function cityDefOf(cityName, scenario) {
  return (Array.isArray(scenario?.cities) ? scenario.cities : []).find((c) => c?.NAME === cityName) || null;
}

/**
 * 關卡判定：**RATE（城市規模）為 0**。
 * docs/04c §2.2 的 RATE（+0x6C）是 1..5 的城規模。實測 12 座關（易京/壺關/樂陵/界橋/定陶/
 * 都陽/官渡/筑陽/長板/建平/赤壁/合肥）全是 `RATE=0, POPULATION=0, MONEY=0, DEFENSE=100,
 * FLAGS=2`，一般城是 `RATE=3, FLAGS=4`。所以用 RATE===0 判，不碰 FLAGS（其 bit 語義 04c §5.2 未定）。
 */
export function isGate(cityDef) {
  return num(cityDef?.RATE) === 0 || num(cityDef?.POPULATION) === 0;
}

/**
 * 關卡守軍的兜底值：`garrison.json` 的五個劇本、12 座關**全部**是 `garrison:110`
 * （`data/garrison.json[0].cities['易京'] = {owner:"", major:"", wise:"", officers:[], garrison:110}`），
 * 所以缺表時用它，比「0 兵 / troopCapOf(0)」都更接近原始資料。
 */
export const GATE_TROOPS_FALLBACK = 110;

/**
 * 關卡守軍兵力：**`garrison.json` 的 `garrison` 為準**，不是 `troopCapOf(POPULATION)`。
 *
 * 為什麼要單獨一條：關卡的 `POPULATION=0`（12 座關全是），`troopCapOf(0)` 剛好也是 110
 * （`RECRUIT.PREP_BASE`），所以舊碼「看起來對」；但那是巧合，不是資料 —— 一旦某座關的
 * garrison.json 換成 200，舊碼會繼續顯示 110，而遠征軍會按 200 的守軍打。
 *
 * 資料形狀 = `garrison.json` 原始陣列（`[{cities:{城名:{...}}}]`，與 `GDATA.garrison` 同一份），
 * 由呼叫方透過 `ctx.garrison` 注入：`CityModel` 是純邏輯模組，不讀檔（web/cocos 同一條規矩）。
 */
export function gateTroopsOf(cityName, cityDef, ctx) {
  const list = Array.isArray(ctx?.garrison) ? ctx.garrison : [];
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const row = list[scenIdx]?.cities?.[cityName];
  const n = num(row?.garrison);
  if (n > 0) return n;
  if (GATE_TROOPS_FALLBACK > 0) return GATE_TROOPS_FALLBACK;
  return troopCapOf(cityDef?.POPULATION);
}

/* ======================================================================
 * 4. 存檔新增欄位：roster / appointed / searchLog
 *    —— 缺省容錯是第一要求：老存檔沒有這三個鍵也要能直接打開。
 * ==================================================================== */

/**
 * 容錯整理三個新欄位（就地修改並回傳 save）。
 *   roster   : { [城名]: [將名…], _moved: { [將名]: 所在城 } }
 *              `[城名]` = 這座城「額外」的將（搜索到的、移入的）；
 *              `_moved` = 本城主將被調走後的落腳點（不動 generals.json 的靜態 CITY）。
 *   appointed: { [城名]: { major, wise } }
 *   searchLog: [{ t: "第1年1月", m: 月, city, cmd, kind, text }]（最近 SEARCH.MAX_LOG 條）
 */
export function ensureExtras(save) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return save;

  const rawRoster = save.roster && typeof save.roster === 'object' && !Array.isArray(save.roster)
    ? save.roster : {};
  const roster = {};
  for (const [city, list] of Object.entries(rawRoster)) {
    if (city === '_moved' || !Array.isArray(list)) continue;
    const names = [...new Set(list.filter((n) => typeof n === 'string' && n))];
    if (names.length) roster[city] = names;
  }
  const rawMoved = rawRoster._moved && typeof rawRoster._moved === 'object' && !Array.isArray(rawRoster._moved)
    ? rawRoster._moved : {};
  const moved = {};
  for (const [name, city] of Object.entries(rawMoved)) {
    if (typeof name === 'string' && name && typeof city === 'string' && city) moved[name] = city;
  }
  if (Object.keys(moved).length) roster._moved = moved;
  save.roster = roster;

  const rawAp = save.appointed && typeof save.appointed === 'object' && !Array.isArray(save.appointed)
    ? save.appointed : {};
  const appointed = {};
  for (const [city, v] of Object.entries(rawAp)) {
    if (!v || typeof v !== 'object' || Array.isArray(v)) continue;
    const major = typeof v.major === 'string' ? v.major : '';
    const wise = typeof v.wise === 'string' ? v.wise : '';
    if (major || wise) appointed[city] = { major, wise };
  }
  save.appointed = appointed;

  const rawLog = Array.isArray(save.searchLog) ? save.searchLog : [];
  save.searchLog = rawLog
    .filter((e) => e && typeof e === 'object' && typeof e.text === 'string' && e.text)
    .map((e) => ({
      t: String(e.t || ''),
      m: intOr(e.m, 1, 0),
      city: String(e.city || ''),
      cmd: String(e.cmd || ''),
      kind: String(e.kind || 'info'),
      text: String(e.text),
    }))
    .slice(-SEARCH.MAX_LOG);

  // 搜索次數計數器：{ [城名]: 次數 }。種子必須單調遞增，**不能數 searchLog** ——
  // 日誌只留 SEARCH.MAX_LOG 條，第 61 次起 count 凍結在 60，種子固定、結果退化成同一條。
  // 老存檔沒有這個鍵時，用日誌裡還能看到的搜索條數補一個下限（日誌已截斷的城只能補到 60；
  // 舊版從第 61 次起種子本來就凍結，修復後從 61 起重新唯一化即可）。
  const rawSeq = save.searchSeq && typeof save.searchSeq === 'object' && !Array.isArray(save.searchSeq)
    ? save.searchSeq : null;
  const seq = {};
  if (rawSeq) {
    for (const [city, n] of Object.entries(rawSeq)) {
      if (typeof city !== 'string' || !city) continue;
      const v = Math.trunc(num(n));
      if (v > 0) seq[city] = v;
    }
  } else {
    for (const e of save.searchLog) {
      if (e.cmd !== '搜索' || !e.city) continue;
      seq[e.city] = (seq[e.city] || 0) + 1;
    }
  }
  save.searchSeq = seq;

  // R8 一月一令：记"哪个月已经下过令"。0/缺省 = 本月还没动（换月后月份变大，条件自然失效）。
  save.lastActionMonth = intOr(save.lastActionMonth, 0, 0);

  // F2 逐將年令：{ [武將名]: 年序 }（年序 = floor((月-1)/12)+1，同 saves.js yearOf）。
  // 原作是「每將每年只能搜索或開發一次」，不是一月一令；舊檔沒有這個鍵 → 空物件。
  const rawActed = save.acted && typeof save.acted === 'object' && !Array.isArray(save.acted) ? save.acted : {};
  const acted = {};
  for (const [name, v] of Object.entries(rawActed)) {
    if (typeof name !== 'string' || !name) continue;
    const y = Math.trunc(num(v));
    if (y > 0) acted[name] = y;
  }
  save.acted = acted;

  // F3 在路上的武將：{ [武將名]: armyId }。權威來源是 save.armies（side==='A' 的
  // general+officers），這份映射由 syncAway() 重算；這裡只保證型別正確。
  const rawAway = save.away && typeof save.away === 'object' && !Array.isArray(save.away) ? save.away : {};
  const away = {};
  for (const [name, id] of Object.entries(rawAway)) {
    if (typeof name === 'string' && name) away[name] = typeof id === 'string' ? id : '';
  }
  save.away = away;

  // R18 唯一物品（ONLYONE）：本局已经搜出来过的物品序号。袋子（sanguo_items_v1）是另一个键，
  // 可能被清掉；这个数组跟着战役存档走，保证「全局只掉一次」不会因为背包被重置又掉一遍。
  save.foundItems = [...new Set(
    (Array.isArray(save.foundItems) ? save.foundItems : [])
      .map((n) => Math.trunc(num(n)))
      .filter((n) => n > 0),
  )].slice(-200);

  // R10 自治：{ [城名]: 1 } ＝ 该城「设定自治」；autoMonth ＝ 上一次执行自治的月份。
  const rawAuto = save.auto && typeof save.auto === 'object' && !Array.isArray(save.auto) ? save.auto : {};
  const auto = {};
  for (const [city, v] of Object.entries(rawAuto)) {
    if (typeof city === 'string' && city && (v === true || v === 1 || v === '1')) auto[city] = 1;
  }
  save.auto = auto;
  save.autoMonth = intOr(save.autoMonth, 0, 0);
  return save;
}

/* ======================================================================
 * [F2] 逐將年令：每將每年只能「搜索」或「開發」一次
 * 原作依據：`project/210_原作战斗流程规格.md` §1「每将一年只能搜索或开发一次」；
 * 反匯編 [g+0x2C] 是逐將標志（`project/108_黄灯九行收口.md:143`），不是全局月令。
 * `save.acted = { 名: 年序 }`；年序同 saves.js `yearOf`：floor((month-1)/12)+1。
 * 舊的 monthLocked/markMonthActed/clearMonthLock 保留不動（既有測試釘死），
 * 但語義收窄為「內政窗口是否已結束」（內政終了／出征／自治會用掉窗口）。
 * ==================================================================== */

/** 當前年序（1 起算，12 個月一年） */
export function yearIndexOf(save) {
  return Math.floor((intOr(save?.month, 1, 1) - 1) / 12) + 1;
}

/** 某將最近一次行動的年序（0 = 從沒行動過） */
export function actedYearOf(save, name) {
  if (!name || typeof name !== 'string') return 0;
  const raw = save?.acted && typeof save.acted === 'object' && !Array.isArray(save.acted) ? save.acted[name] : 0;
  return intOr(raw, 0, 0);
}

/** 該將今年是不是已經行動過（搜索/開發） */
export function actedLocked(save, name) {
  const y = actedYearOf(save, name);
  return y > 0 && y === yearIndexOf(save);
}

/** 記「該將今年行動過」。已經記過回 false（不覆寫），成功回 true。 */
export function markActed(save, name) {
  if (!save || !name || typeof name !== 'string') return false;
  if (actedLocked(save, name)) return false;
  if (!save.acted || typeof save.acted !== 'object' || Array.isArray(save.acted)) save.acted = {};
  save.acted[name] = yearIndexOf(save);
  return true;
}

/** 清空逐年令（新局／除錯用；年份推進時舊年序自然失效，不必每年清） */
export function clearActed(save) {
  if (save && typeof save === 'object') save.acted = {};
}

/** 今年已經行動過的將名（給 UI 列出「今年已行動」） */
export function actedNames(save) {
  const y = yearIndexOf(save);
  const raw = save?.acted && typeof save.acted === 'object' && !Array.isArray(save.acted) ? save.acted : {};
  return Object.keys(raw).filter((n) => intOr(raw[n], 0, 0) === y);
}

/* ======================================================================
 * [F3] 在路上的武將：隨軍出征／調動中的將，當年不能做內政
 * 原作依據：`project/210_原作战斗流程规格.md` §1「在该年『在路上的部队』里的武将
 * 当年不能做内政」。權威來源是 `save.armies`（side==='A'）；`save.away` 是它的鏡像，
 * 由 campaign.html 在出發/回城/退兵時呼叫 `syncAway()` 重算。
 * ==================================================================== */

/** 在路上的將名集合（save.away ∪ 我方兵團的 general/officers） */
export function awayNameSet(save) {
  const out = new Set();
  const away = save?.away && typeof save.away === 'object' && !Array.isArray(save.away) ? save.away : {};
  for (const [name, id] of Object.entries(away)) if (name && id) out.add(name);
  for (const a of Array.isArray(save?.armies) ? save.armies : []) {
    if (!a || a.side !== 'A') continue;
    for (const n of [a.general, ...(Array.isArray(a.officers) ? a.officers : [])]) {
      if (typeof n === 'string' && n) out.add(n);
    }
  }
  return out;
}

/** 由 save.armies 重算 save.away（回傳同一份映射） */
export function syncAway(save) {
  if (!save || typeof save !== 'object') return {};
  const next = {};
  for (const a of Array.isArray(save.armies) ? save.armies : []) {
    if (!a || a.side !== 'A') continue;
    for (const n of [a.general, ...(Array.isArray(a.officers) ? a.officers : [])]) {
      if (typeof n === 'string' && n && !next[n]) next[n] = typeof a.id === 'string' ? a.id : '';
    }
  }
  save.away = next;
  return next;
}

/** 每城運行態：兵/民/金 沿用 saves.js 的形狀，另加 `def`（城防運行態，見下方註解）。 */
export function ensureCityState(save, cityDef) {
  if (!save || typeof save !== 'object' || !cityDef || !cityDef.NAME) return null;
  if (!save.cities || typeof save.cities !== 'object' || Array.isArray(save.cities)) save.cities = {};
  let st = save.cities[cityDef.NAME];
  if (!st || typeof st !== 'object' || Array.isArray(st)) {
    st = {};
    save.cities[cityDef.NAME] = st;
  }
  if (!Number.isFinite(Number(st.troops))) st.troops = troopCapOf(cityDef.POPULATION);
  if (!Number.isFinite(Number(st.pop))) st.pop = num(cityDef.POPULATION);
  if (!Number.isFinite(Number(st.money))) st.money = num(cityDef.MONEY);
  // `def` 是本頁新增的**城防運行態**：原作 DEFENSE 是城結構 +0x8E 的可變欄位，
  // 而 saves.js 的 cityState() 只給 troops/pop/money。campaign.html 的
  // normalizeCampaign / ensureCityState（1130-1160）只補缺、不刪未知鍵，所以多這一鍵
  // 不會被它清掉；缺省時退回劇本裡的 DEFENSE，老存檔照樣能開。
  if (!Number.isFinite(Number(st.def))) st.def = num(cityDef.DEFENSE);
  st.troops = Math.max(0, Math.trunc(num(st.troops)));
  st.pop = Math.max(0, Math.trunc(num(st.pop)));
  st.money = Math.max(0, Math.trunc(num(st.money)));
  st.def = Math.max(0, Math.trunc(num(st.def)));
  // R12 步／騎分列：`troops` 仍是**唯一權威**（campaign.html / deploy.html 只認它），
  // `inf + cav === troops` 是恆等式，這裡負責把兩邊拉直（誰改了 troops 都不會歪）。
  st.cav = Math.max(0, Math.min(st.troops, Math.trunc(num(st.cav))));
  st.inf = st.troops - st.cav;
  // R12 預備兵池（原作 +0x86 現有值 / +0x82 上限）：第一次碰到時給滿池，
  // 之後只由 `refillPrep()`（換月）與 `enlist()`（徵兵）改。
  if (!Number.isFinite(Number(st.prep))) st.prep = prepCapOf(st.pop);
  st.prep = Math.max(0, Math.min(prepCapOf(st.pop), Math.trunc(num(st.prep))));
  st.prepMonth = intOr(st.prepMonth, 0, 0);
  return st;
}

/* ======================================================================
 * 3b. 錢的口徑（F16）：全國只有一個真源 —— 每城 `st.money`（原作城結構 +0x92）
 * ----------------------------------------------------------------------
 * 原作沒有「勢力錢包」：金錢是**逐城**的 `+0x92`，年度結算逐城發（`F:\sanguo\work\flow_audit\内政大地图_差异.md`
 * F16 行 125：頂欄「金 1,200」與列表行「$3,941」同屏兩個數＝本作把兩套口徑並存了）。
 * 現在：
 *   · 國庫 = Σ 我方每城 money（`nationalGold()`）——頂欄／內政「金錢」欄都讀這一個；
 *   · 花錢（搜索 200 / 徵兵）只落在**當前城**的 money（`spendCityMoney()`）；
 *   · `save.gold` 降級成遷移相容欄位：`migrateGold()` 只回填一次（舊檔某城沒有 money 時），
 *     之後恆為 0；在遷移之前，模型層對「城實例裡還沒有 money」的檔仍按舊單錢包讀寫，
 *     但**同一筆錢只會從一個地方扣**（有 money 的城扣 money，沒有才扣 wallet），永不雙扣。
 * ==================================================================== */

/**
 * 城實例裡「原本就有」的 money（沒被 `ensureCityState()` 用劇本 MONEY 補過）。
 * 回 `null` ＝這座城的錢還沒逐城化（要嘛舊單錢包、要嘛交給 `ensureCityState()` 補）。
 */
function explicitMoneyOf(save, cityName) {
  const name = typeof cityName === 'string' ? cityName : '';
  const raw = name && save && save.cities ? save.cities[name] : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return Number.isFinite(Number(raw.money)) ? Math.max(0, Math.trunc(num(raw.money))) : null;
}

/** 本城金（逐城口徑；**遷移前**的舊檔以 `save.gold` 單錢包為權威，遷移後只看本城 money） */
export function cityMoneyOf(save, cityDef) {
  const name = cityDef && cityDef.NAME;
  if (!name) return 0;
  if (save && save.goldMigrated !== true) return Math.max(0, Math.trunc(num(save.gold)));
  const explicit = explicitMoneyOf(save, name);
  if (explicit !== null) return explicit;
  const st = ensureCityState(save, cityDef);
  return st ? Math.max(0, Math.trunc(num(st.money))) : 0;
}

/**
 * 國庫 = Σ 我方每城的 money。**只讀**：不會為了算錢去實體化城態（`civicFields` 只讀要求）。
 *   · 已遷移（`goldMigrated === true`）：Σ 城實例 money；沒實體化的城按劇本 MONEY 起算；
 *   · 未遷移：就是舊單錢包 `save.gold`（遷移前的相容讀，真正在跑的錢包只有這一個）；
 *   · `cityDefs` 缺（或型別不對）：同樣退回舊的單錢包值，讓「只拿 save 來算」的舊呼叫端不會突然變 0。
 */
export function nationalGold(save, cityDefs) {
  const owned = Array.isArray(save?.owned) ? save.owned : [];
  if (save?.goldMigrated !== true) return Math.max(0, Math.trunc(num(save?.gold)));
  const defs = Array.isArray(cityDefs) ? cityDefs.filter((d) => d && d.NAME) : [];
  const byName = new Map(defs.map((d) => [d.NAME, d]));
  let sum = 0;
  for (const name of owned) {
    const explicit = explicitMoneyOf(save, name);
    if (explicit !== null) { sum += explicit; continue; }
    const def = byName.get(name);
    if (def) sum += Math.max(0, Math.trunc(num(def.MONEY)));
  }
  return sum;
}

/** 從本城扣錢（唯一的扣款口徑）：錢不夠回 false，且不動任何欄位 */
export function spendCityMoney(save, cityDef, cost) {
  const need = Math.max(0, Math.trunc(num(cost)));
  const name = cityDef && cityDef.NAME;
  if (!name) return false;
  // 遷移前：唯一錢包是 save.gold（不是第二套，而是還沒搬完的同一筆錢）
  if (save && save.goldMigrated !== true) {
    const wallet = Math.max(0, Math.trunc(num(save.gold)));
    if (wallet < need) return false;
    save.gold = wallet - need;
    return true;
  }
  const st = ensureCityState(save, cityDef);
  if (!st) return false;
  if (Math.trunc(num(st.money)) < need) return false;
  st.money = Math.max(0, Math.trunc(num(st.money)) - need);
  return true;
}

/**
 * 舊檔遷移（F16）：把 `save.gold` 這口舊錢包**一次性**併進我方第一座城的 money。
 *
 * 「只回填一次」有兩個閘：`save.goldMigrated`（之後不再搬）＋「該城實例裡沒有 money
 * 才回填」（已經有 money 的城＝錢早就是逐城口徑了，再加一次就是重複計錢）。
 * 無論有沒有搬，最後都把 `save.gold` 歸 0：往後只認每城 money，不再兩套並行。
 */
export function migrateGold(save, cityDefs) {
  if (!save || typeof save !== 'object' || Array.isArray(save)) return { moved: 0, to: '' };
  if (save.goldMigrated === true) return { moved: 0, to: '' };
  const wallet = Math.max(0, Math.trunc(num(save.gold)));
  const owned = Array.isArray(save.owned) ? save.owned : [];
  const defs = Array.isArray(cityDefs) ? cityDefs : [];
  let to = '';
  for (const name of owned) {
    const def = defs.find((d) => d && d.NAME === name);
    if (!def) continue;
    to = name;
    break;
  }
  let moved = 0;
  if (to && wallet > 0) {
    const raw = save.cities && save.cities[to];
    const hasMoney = raw && typeof raw === 'object' && Number.isFinite(Number(raw.money));
    if (!hasMoney) {
      const st = ensureCityState(save, defs.find((d) => d && d.NAME === to));
      st.money = Math.max(0, Math.trunc(num(st.money)) + wallet);
      moved = wallet;
    }
  }
  save.gold = 0;
  save.goldMigrated = true;
  return { moved, to };
}

/**
 * 步／騎上限（R12）：兩欄相加 = 部隊兵硬上限 600，各自固定、不隨對方浮動。
 *   騎兵上限 = Σ 武將騎兵上限                    —— 04c §3.2 +0x46（`0x409FD8`）
 *   步兵上限 = 600 − 騎兵上限                     —— +0x42（`0x409FB6`）
 * 等級未知（generals.json 沒有等級）⇒ 一律當 20 級 ⇒ 騎兵上限 0，只出步兵。
 * 這正是原作「等級 ≤20 時恆為 0」的意思（battle.ts cavalryCapOf 同式）。
 *
 * [口径] 這裡以前寫 Σ `min(騎兵上限, 帶兵上限)`，把騎兵當成帶兵數的子集——不對：
 * 原作 `0x443118`/`0x443124` 是**兩欄相加**（`unit+0x58` = 步+騎、`unit+0x5C` = 總數），
 * 見 `project/168_战场每侧单位数.md` §4 與 `project/170_步骑两栏兵力.md`。
 * 數值上這個 `min` 從不生效（騎兵上限 ≤100 恆 ≤ 帶兵上限，且 <20 級時恆 0），
 * 所以去掉它不改變任何一处存档/对拍数值，只是把口徑寫對。
 */
export function armCaps(save, cityDef, ctx) {
  const total = RECRUIT.CAP;
  let cav = 0;
  for (const g of rosterOf(save, cityDef?.NAME, ctx)) {
    const lv = levelOf(g, ctx);
    cav += cavalryCapOf(lv);
  }
  cav = Math.max(0, Math.min(total, cav));
  return { total, cav, inf: total - cav };
}

/** 預備兵現況（給面板 0x48B2B8「預備兵 %d/%d」與 HUD 用） */
export function prepStateOf(save, cityDef) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { prep: 0, cap: 0 };
  return { prep: st.prep, cap: prepCapOf(st.pop) };
}

/**
 * 換月補預備兵 —— **舊設計（已停用，只作 `?loose=1` 對照）**。
 *
 * [口径] 原作不是白補：`project/210_原作战斗流程规格.md` §1 + 内政指南
 * 「城里每 100 金钱 = 1 预备兵，随时间自动转换，直到钱花光或兵满」。
 * 這支「每月白補 10%」是 R12 在公式未定位時的暫代，F13 起生產路徑改用
 * `prepFromMoney()`；本函式保留是因為 `tests/city_rules.test.ts:176-192`
 * 釘死了它的行為，且 `?loose=1` 要能跑回舊手感做對照。
 * 逐月 lazy tick：以 `st.prepMonth` 記已結算到哪個月，中間幾個月沒開頁也不會漏。
 * **不要在新代碼裡呼叫它**（只有 `autonomyTick(..., { loose: true })` 會走到）。
 */
export function refillPrep(save, cityDef) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, gained: 0, cap: 0 };
  const cap = prepCapOf(st.pop);
  const month = intOr(save?.month, 1, 1);
  const last = intOr(st.prepMonth, 0, 0);
  if (!(month > last)) return { ok: true, gained: 0, cap, prep: st.prep };
  // 第一次結算（新檔／老檔補欄位）：只記帳、不補兵，否則開局第一個月會白拿一次
  if (last === 0) {
    st.prepMonth = month;
    return { ok: true, gained: 0, cap, prep: st.prep, first: true };
  }
  const gain = Math.max(1, Math.floor(cap * RECRUIT.PREP_GAIN_PCT));
  const gained = Math.min(cap - st.prep, gain * (month - last));
  if (gained > 0) st.prep += gained;
  st.prepMonth = month;
  return { ok: true, gained: Math.max(0, gained), cap, prep: st.prep };
}

/** 錢變兵匯率：100 金 = 1 預備兵（原作城結構 +0x92 金 → +0x86 預備兵，換月結算）。 */
export const PREP_PER_GOLD = 100;

/**
 * 錢變兵（F13，原作線）：每換月結算，每 100 金換 1 預備兵，直到**錢花光或預備兵滿**。
 *
 *   規格：`project/210_原作战斗流程规格.md` §1「城里每 100 金钱 = 1 预备兵，随时间自动
 *   转换，直到钱花光或兵满」；内政指南同段（`work/flow_audit/内政大地图_差异.md` L122-124）。
 *
 * 用 **每城** `st.money`（城結構 +0x92 的運行態），不是 `save.gold`（那是全勢力總賬，
 * 兩者分裂見差異表 F16，屬 P1 不在本輪）。
 *   n = min(floor(money / 100), prepCap − prep)
 *   money -= n * 100 ; prep += n
 *
 * 回傳 {ok, city, n, cost, prep, cap, money}；n === 0（沒錢／已滿）也算結算成功。
 */
export function prepFromMoney(save, cityDef) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city', n: 0, cost: 0, prep: 0, cap: 0, money: 0 };
  const cap = prepCapOf(st.pop);
  const room = Math.max(0, cap - st.prep);
  const n = Math.min(Math.floor(Math.max(0, num(st.money)) / PREP_PER_GOLD), room);
  if (n > 0) {
    st.prep += n;
    st.money -= n * PREP_PER_GOLD;
  }
  return { ok: true, city: cityDef.NAME, n, cost: n * PREP_PER_GOLD, prep: st.prep, cap, money: st.money };
}

/**
 * 部隊徵兵（R12，原作線）：消耗**預備兵** → 部隊兵，分步／騎（04c §2.3 面板
 * 0x489138「步兵數 %d/%d」/ 0x489148「騎兵數 %d/%d」/ 0x489164「預備兵 %d」/ 0x489170「總兵數 %d」）。
 *   opts = { arm: 'inf'|'cav', n }
 * 不花金（原作面板上沒有金）；金的去處是開發（金→人口→預備兵→兵）。
 * 回傳 { ok, reason?, arm, n, taken, ... }
 *   reason: 'no-city' | 'bad-arm' | 'none' | 'no-prep' | 'arm-full' | 'troops-full'
 */
export function enlist(save, cityDef, opts, ctx) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  const arm = opts?.arm === 'cav' ? 'cav' : opts?.arm === 'inf' ? 'inf' : '';
  if (!arm) return { ok: false, reason: 'bad-arm' };
  const want = Math.trunc(num(opts?.n));
  if (!(want > 0)) return { ok: false, reason: 'none', arm };

  const caps = armCaps(save, cityDef, ctx);
  const armLeft = arm === 'cav' ? caps.cav - st.cav : caps.inf - st.inf;
  const troopLeft = caps.total - st.troops;
  if (armLeft <= 0) return { ok: false, reason: 'arm-full', arm, cap: arm === 'cav' ? caps.cav : caps.inf };
  if (troopLeft <= 0) return { ok: false, reason: 'troops-full', arm, cap: caps.total };
  if (st.prep <= 0) return { ok: false, reason: 'no-prep', arm, prep: 0 };

  const n = Math.min(want, armLeft, troopLeft, st.prep);
  const prep = n * RECRUIT.PREP_PER_TROOP;
  st.prep -= prep;
  st[arm] += n;
  st.troops = st.inf + st.cav;
  return { ok: true, arm, n, taken: prep, caps, troops: st.troops, prep: st.prep };
}

export function cityStateOf(save, cityName) {
  const st = save?.cities?.[cityName];
  return st && typeof st === 'object' && !Array.isArray(st) ? st : null;
}

/**
 * 桌面上這座城的將（本城常駐 ＋ 搜索/移入的），按 武+智 降序。
 *
 * 「在野」的將不算守軍：即使他在這座城，也要先被搜索招到（roster[城] 有名字）才進名單。
 * 被調走的將記在 roster._moved[將名] = 落腳城，所以原城不再列他。
 * [F3] 隨軍在路上的將（save.away / 我方兵團）也不算：原作「在路上的武將當年不能做內政」，
 *      把他從名冊裡濾掉，選將抽屜與「武將 N」計數就同時對了。
 */
export function rosterOf(save, cityName, ctx) {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const moved = save?.roster?._moved || {};
  const extra = Array.isArray(save?.roster?.[cityName]) ? save.roster[cityName] : [];
  const extraSet = new Set(extra);
  const away = awayNameSet(save);
  const out = [];
  const seen = new Set();
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    if (away.has(g.NAME)) continue;
    const home = cityOf(g, scenIdx);
    const movedTo = moved[g.NAME] || '';
    if (movedTo) {
      if (movedTo !== cityName || seen.has(g.NAME)) continue;
      seen.add(g.NAME);
      out.push(g);
      continue;
    }
    if (home !== cityName) continue;
    if (statusOf(g, scenIdx) === '野' && !extraSet.has(g.NAME)) continue;
    if (seen.has(g.NAME)) continue;
    seen.add(g.NAME);
    out.push(g);
  }
  for (const name of extra) {
    if (seen.has(name) || away.has(name)) continue;
    if (moved[name] && moved[name] !== cityName) continue;
    const g = generalOf(generals, name);
    if (!g) continue;
    seen.add(name);
    out.push(g);
  }
  return out.sort((a, b) => (num(b.STR) + num(b.INT)) - (num(a.STR) + num(a.INT)));
}

/**
 * 已經「在我方任一城」的將名（搜索時排除，避免同一個將被搜到兩次）。
 * 只算：我方城的常駐將（狀態不是「野」）＋ roster 額外名單 ＋ 被調動過的將。
 */
export function stationedNames(save, ctx) {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const owned = new Set(Array.isArray(save?.owned) ? save.owned : []);
  const moved = save?.roster?._moved || {};
  const set = new Set();
  for (const g of generals) {
    if (!g || !g.NAME || g.NAME === '盜賊') continue;
    const home = cityOf(g, scenIdx);
    if (!home || !owned.has(home)) continue;
    if (statusOf(g, scenIdx) === '野') continue;
    set.add(g.NAME);
  }
  for (const [city, list] of Object.entries(save?.roster || {})) {
    if (city === '_moved' || !Array.isArray(list)) continue;
    for (const n of list) set.add(n);
  }
  for (const n of Object.keys(moved)) set.add(n);
  return set;
}

/** 本城在野武將池（依據 docs/04c §2.3 搜索 → 將軍加入我方；狀態「野」= 在野） */
export function wildPool(save, cityName, ctx) {
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const generals = Array.isArray(ctx?.generals) ? ctx.generals : [];
  const taken = new Set(rosterOf(save, cityName, ctx).map((g) => g.NAME));
  const all = stationedNames(save, ctx);
  // 這座城裡「已經被招到」的將不再出現（roster[城] 有名字就算）
  for (const n of save?.roster?.[cityName] || []) taken.add(n);
  return generals.filter((g) => g && g.NAME && g.NAME !== '盜賊'
    && cityOf(g, scenIdx) === cityName
    && statusOf(g, scenIdx) === '野'
    && !taken.has(g.NAME)
    && !all.has(g.NAME));
}

/* ======================================================================
 * 4b. 內政頁右側 8 欄（原作 A_city_t0030 的數值面板）
 * ==================================================================== */

/**
 * 原作「內政」頁右側那一小塊數值面板，逐欄對齊 `work/video_ui/A_city_t0030.png`：
 *
 * ```
 *   時間 209年      君主 金旋
 *   城數 1          關數 0
 *   武將數 1人      總兵數 30人
 *   金錢 3198       人口 126500人
 * ```
 *
 * 口徑（**這支是唯讀的**，不會寫回 save，也不會順手把 40 座城實體化）：
 *   · `year`：內部「第 N 年」（1 起）；`adYear` = `era.toADYear(year)`；`timeText` = `209年`
 *     —— 原作時間**只到年**，不帶「西元」、不帶月（月在大地圖年月匾上）。
 *   · `cityCount` / `gateCount`：我方 `save.owned` 用 `isGate()` 拆成「城」與「關」。
 *     `[推测]` 原作「城數」不含關（關卡另占一欄），所以兩欄互斥、相加 = owned 座數。
 *   · `generalCount`：**在我方任一城**的武將數（`stationedNames()`），與原作「武將數」同義。
 *     注意這**不是** `saves.js` 的 `generalCount`（那裡算「有等級/經驗記錄的武將」，含在野）。
 *   · `troopCount` / `pop`：逐城累加運行態；**沒跑過 `ensureCityState()` 的城按「該建的值」估**
 *     （兵 = `troopCapOf(POPULATION)`、人口 = 劇本 `POPULATION`），不建狀態。
 *   · `gold`：**國庫 = Σ 我方每城 money**（`nationalGold()`，F16 起唯一口徑）。
 *     原作金錢是城的 `+0x92`、年度結算逐城發，沒有勢力錢包；本作以前用 `save.gold` 單錢包，
 *     現在那個欄位只作舊檔遷移相容（`migrateGold()` 之後恆 0）。
 *
 * 數字一律回整數；**千分位不在這裡加**——原作沒有千分位，顯示層直接 `String(n)`。
 * 「人」也只有武將數／總兵數／人口三欄加（原作實拍如此），城數／關數／金錢／時間不加。
 *
 * @param {object} save     campaign 存檔
 * @param {Array}  cityDefs 劇本城池定義（`scenario.cities`，要能 `isGate()` / 讀 POPULATION）
 * @param {object} ctx      `{ generals, scenIdx }`（給 `stationedNames` 反查武將歸屬）
 * @returns {{year:number, adYear:number, timeText:string, monarch:string, cityCount:number,
 *            gateCount:number, generalCount:number, troopCount:number, gold:number, pop:number,
 *            cityNames:string[], gateNames:string[]}}
 */
export function civicFields(save, cityDefs, ctx) {
  const owned = Array.isArray(save?.owned) ? save.owned : [];
  const defs = Array.isArray(cityDefs) ? cityDefs : [];
  const byName = new Map();
  for (const d of defs) if (d && d.NAME) byName.set(d.NAME, d);

  let cityCount = 0;
  let gateCount = 0;
  let troopCount = 0;
  let pop = 0;
  const cityNames = [];
  const gateNames = [];
  for (const name of owned) {
    const def = byName.get(name);
    if (!def) continue;                       // 存檔裡有、劇本裡沒有的城名：跳過，不猜
    if (isGate(def)) { gateCount += 1; gateNames.push(name); }
    else { cityCount += 1; cityNames.push(name); }
    const st = cityStateOf(save, name);
    if (st) {
      troopCount += Math.max(0, Math.trunc(num(st.troops)));
      pop += Math.max(0, Math.trunc(num(st.pop)));
    } else {
      // 沒建過運行態：用 ensureCityState() 會給的初值估，**不寫回**。
      // 關卡不用 troopCapOf(0)（那個剛好 = 110，是巧合），走 garrison.json 的 `gateTroopsOf()`。
      troopCount += isGate(def) ? gateTroopsOf(name, def, ctx) : troopCapOf(def.POPULATION);
      pop += Math.max(0, Math.trunc(num(def.POPULATION)));
    }
  }

  let generalCount = 0;
  try {
    generalCount = stationedNames(save, ctx).size;
  } catch {
    generalCount = 0;                         // ctx 缺 generals 時不讓整頁爆掉
  }

  const year = yearOf(save?.month);
  return {
    year,
    adYear: era.toADYear(year),
    timeText: era.yearField(year),
    monarch: String(save?.monarch || save?.king || '').trim(),
    cityCount,
    gateCount,
    generalCount,
    troopCount,
    gold: nationalGold(save, defs),
    pop,
    cityNames,
    gateNames,
  };
}

/* ======================================================================
 * 5. 內政效率（太守）
 * ==================================================================== */

/** 現任太守名（任命過就用任命的，否則用劇本 MAJOR；依據 docs/04c §2.2 +0x14） */
export function majorOf(save, cityDef) {
  const ap = save?.appointed?.[cityDef?.NAME] || {};
  if (typeof ap.major === 'string' && ap.major) return ap.major;
  return typeof cityDef?.MAJOR === 'string' ? cityDef.MAJOR : '';
}

/** 現任軍師名（依據 docs/04c §2.2 +0x18） */
export function wiseOf(save, cityDef) {
  const ap = save?.appointed?.[cityDef?.NAME] || {};
  if (typeof ap.wise === 'string' && ap.wise) return ap.wise;
  return typeof cityDef?.WISE === 'string' ? cityDef.WISE : '';
}

/**
 * 內政效率 = 1 + (太守INT − 70) × 2 / 300（R9 反彙編，原作 0x427A84 / 0x427947 同一段）
 * 智力 70 = 不增不減；原作不夾上下限，所以 INT 0 的城只有 ×0.53。
 * 這支只給顯示／估算用；真正的整數增量走 `scaledGain()`（同一個 MAJOR_RULE）。
 */
export function efficiencyOf(save, cityDef, ctx) {
  const name = majorOf(save, cityDef);
  const g = generalOf(ctx?.generals, name);
  return majorFactor(num(g?.INT));
}

/** 軍師技（把 WISESKILL 的「習得等級, 編號」第二列對到 wises.json；依據 docs/03a 行65 / 04c §2.2 +0x75） */
export function wiseSkillsOf(general, wises) {
  const list = Array.isArray(general?.WISESKILL) ? general.WISESKILL : [];
  const bySeq = new Map((Array.isArray(wises) ? wises : []).map((w) => [Number(w.SEQUENCE), w]));
  const out = [];
  for (const row of list) {
    const parts = String(row).split(',').map((s) => s.trim());
    const id = Number(parts[1]);
    const w = bySeq.get(id);
    if (w && w.NAME) out.push({ id, name: w.NAME, level: Number(parts[0]) || 0 });
  }
  return out;
}

/* ======================================================================
 * 6. 日誌
 * ==================================================================== */

/** 追加一條結果日誌（帶月份戳）；超過上限丟最舊的 */
export function logAdd(save, entry) {
  if (!save || typeof save !== 'object') return null;
  ensureExtras(save);
  const month = intOr(entry?.m, 1, 1);
  const row = {
    t: typeof entry?.t === 'string' && entry.t ? entry.t : monthLabel(month),
    m: month,
    city: String(entry?.city || ''),
    cmd: String(entry?.cmd || ''),
    kind: String(entry?.kind || 'info'),
    text: String(entry?.text || ''),
  };
  if (!row.text) return null;
  save.searchLog.push(row);
  if (save.searchLog.length > SEARCH.MAX_LOG) save.searchLog = save.searchLog.slice(-SEARCH.MAX_LOG);
  return row;
}

/** 最近 n 條（新的在前），可限定只看某城 */
export function recentLog(save, n = 6, cityName = '') {
  const list = Array.isArray(save?.searchLog) ? save.searchLog : [];
  const filtered = cityName ? list.filter((e) => e.city === cityName) : list;
  return filtered.slice(-Math.max(0, n)).reverse();
}

/* ======================================================================
 * 7. 八條命令
 * ==================================================================== */

/**
 * 開發：一次同時加人口與防禦（依據 docs/04c §2.3 0x427A84 的兩條印字 + R9 反彙編公式）。
 * 回傳 { ok, reason?, cost, pop, def, eff }
 *
 * R9 三處收口（`project/133_原作數值真值.md` 已 [確認] 的反彙編）：
 *   - **執行武將 ≠ 太守**：`0x427A84(city, gen)` / `0x427947(city, gen)` 的第 2 參是
 *     **執行武將**（`[ebp+0xc]`），基礎值用它 `+0x36` 智力 / `+0x34` 武力；
 *     之後的太守縮放 `D += D×(太守INT−0x46)×2/0x12c` 讀的是 `city+0x14`（太守）。
 *     所以這裡拆成 `exec`（算 base）與 `major`（算縮放），內政頁沒傳 `ctx.exec` 時
 *     `exec = major`（= 原「執行武將 = 現任太守」的老口徑，見 project/108）。
 *   - **關城前置**：`0x405499(city)` 是 `city[0x9E]==2`，三劇本固定 12 座關城
 *     （易京/樂陵/界橋/壺關/定陶/都陽/官渡/筑陽/長板/建平/赤壁/合肥）直接返回 0。
 *     本作等價判定是 `isGate(cityDef)`（`RATE===0 || POPULATION===0`），命中就不給開發。
 *   - **免費**：`0x4020E1` 的 cmd==2 段與兩個函式體內沒有任何 `[+0x92]`（金）訪問，
 *     所以開發不扣金；`cost` 保留欄位（現在恆 0，UI 的「金 -0」待另開一條修文案）。
 */
export function develop(save, cityDef, ctx) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  // 0x405499(city)：FLAGS==2 的 12 座關城不能開發（原作在兩個公式入口前先 call）
  if (isGate(cityDef)) return { ok: false, reason: 'gate' };
  // [F16] 錢只認本城 `st.money`（國庫 = Σ 每城 money）；DEV.COST 現為 0，這個判斷是給日後改價留的。
  if (DEV.COST > 0 && cityMoneyOf(save, cityDef) < DEV.COST) return { ok: false, reason: 'gold', cost: DEV.COST };
  if (st.pop >= DEV.POP_CAP && st.def >= DEV.DEF_CAP) return { ok: false, reason: 'saturated', cap: DEV.POP_CAP };

  // 執行武將：有 ctx.exec 就用它（原作玩家選將），否則退回現任太守
  const major = generalOf(ctx?.generals, majorOf(save, cityDef));
  const exec = generalOf(ctx?.generals, ctx?.exec) || major;
  const intel = num(exec?.INT);
  const str = num(exec?.STR);
  // 縮放係數用**太守**的智力（city+0x14 → +0x36）
  const majorIntel = num(major?.INT);
  const eff = majorFactor(majorIntel);

  // 0x427A84：base = rand()%3000 + 執行武將INT*100，再過太守縮放
  const popBase = randBelow(DEV.POP) + Math.trunc(intel * DEV_FORMULA.PER_INT);
  const pop = Math.min(DEV.POP_CAP - st.pop, Math.max(0, scaledGain(popBase, majorIntel)));
  // 0x427947：base = rand()%12 + trunc(執行武將STR*4/10)，再過同一段太守縮放。
  // 原作是 `shl eax,2; idiv 0xa`（整數），所以取整點在乘 4 之後、除 10 時，不能用 0.4 浮點。
  const defBase = randBelow(DEV.DEF) + Math.trunc((str * 4) / 10);
  const def = Math.min(DEV.DEF_CAP - st.def, Math.max(0, scaledGain(defBase, majorIntel)));
  // 0x427B9E 外殼：兩個增量都是 0 就靜默（什麼都沒發生、也不印字）
  if (pop <= 0 && def <= 0) return { ok: false, reason: 'nothing', eff };

  st.pop += pop;
  st.def += def;
  if (DEV.COST > 0) spendCityMoney(save, cityDef, DEV.COST);
  return { ok: true, cost: DEV.COST, pop, def, eff };
}

/**
 * 徵兵（**舊口徑**：花金 → 兵＋）。R12 之後頁面走的是 `enlist()`（消耗預備兵、步／騎分列），
 * 這支保留給 campaign.html 系與既有自測（`city_selftest.mjs` 要求它仍存在且行為不變）。
 * 仍然維持 `inf + cav === troops`：新增的兵算步兵。
 *
 * [F16] 扣款口徑改成**本城 money**（`spendCityMoney`），不再動 `save.gold`；
 * 舊單錢包只剩遷移相容（`migrateGold()` 之後恆 0）。
 */
export function recruit(save, cityDef, ctx) {
  const st = ensureCityState(save, cityDef);
  if (!st) return { ok: false, reason: 'no-city' };
  const cityGold = cityMoneyOf(save, cityDef);
  if (cityGold < RECRUIT.COST) return { ok: false, reason: 'gold', cost: RECRUIT.COST, money: cityGold };
  const cap = RECRUIT.CAP;
  if (st.troops >= cap) return { ok: false, reason: 'full', cap };

  const eff = efficiencyOf(save, cityDef, ctx);
  const add = Math.min(cap - st.troops, Math.max(1, Math.round(RECRUIT.TROOPS * eff)));
  spendCityMoney(save, cityDef, RECRUIT.COST);
  st.inf += add;
  st.troops = st.inf + st.cav;
  return { ok: true, cost: RECRUIT.COST, troops: add, cap, eff };
}

/**
 * 搜索：花金 → 人才／寶物／兵符或陣法書／什麼也沒有。
 * 種子 = hash(存檔 nonce, city, month, count)（R20）；count 取自 searchSeq（只增不減）。
 * 流程 = 原作 0x426D8C 的兩段式（R11）：先擲武將（50%），沒中才落物品輪盤（50%）。
 * 回傳 { ok, reason?, cost, kind, seq?, item?, general?, stage?, seed?, text, logged }
 *
 * [F16] 費用扣除本城 money（不再動 `save.gold`）。
 * [F10] `ctx.quiet === true` 時**只搜不記日誌**：內政自治代行搜索時用（指南 L103-104
 *       「自動模式找到的寶物不顯示，除非搜到人」）；seq 仍照樣遞增、錢照樣扣。
 */
export function search(save, cityDef, ctx) {
  if (!cityDef || !cityDef.NAME) return { ok: false, reason: 'no-city' };
  // [F10] 自治代行的搜索是「自動結算」，不跟玩家收費（指南 L103-104 只規定「自動搜到的寶物
  // 不顯示，除非搜到人」，沒提扣金；同頁 R85 已證開發代行也不動 city+0x92）。
  const free = ctx?.free === true;
  const cityGold = cityMoneyOf(save, cityDef);
  if (!free && cityGold < SEARCH.COST) return { ok: false, reason: 'gold', cost: SEARCH.COST, money: cityGold };
  const quiet = ctx?.quiet === true;

  const city = cityDef.NAME;
  const count = searchCount(save, city);
  const seed = searchSeed(city, save.month, count, searchNonce(save));
  const rng = mulberry32(seed);
  const pool = wildPool(save, city, ctx);
  const level = searchLevelOf(save, cityDef, ctx);

  // ---- 第一段（原作 0x48a260 的 50/30/20 → 只區分「武將」與「物品」）
  const s1 = SEARCH.STAGE1;
  const talentShare = num(s1.talent) / (num(s1.talent) + num(s1.item));
  const firstTalent = pool.length > 0 && rng() < talentShare;

  let out = null;
  let stage = 'talent';
  if (firstTalent) {
    const g = pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
    if (g) {
      addToRoster(save, city, g.NAME);
      out = { ok: true, cost: SEARCH.COST, kind: 'talent', general: g, seed, text: `${g.NAME}將軍加入我方。` };
    }
  }
  if (!out) {
    // ---- 第二段（物品輪盤 0x408EE2；武將分支取不到人時原作也是落到這裡）
    stage = 'item';
    const pools = searchPools(ctx?.items, ownedItemSeqs(save, ctx), level);
    const weights = { treasure: SEARCH.WEIGHTS.treasure, talisman: SEARCH.WEIGHTS.talisman, none: SEARCH.WEIGHTS.none };
    if (!pools.treasure.length) weights.treasure = 0;
    if (!pools.talisman.length) weights.talisman = 0;
    const kind = pickWeightedKey(weights, rng());
    if (kind === 'treasure' || kind === 'talisman') {
      const it = pickWeightedItem(pools[kind], rng(), (row) => searchItemWeight(row, level));
      if (it) rememberFound(save, it.Sequence);
      out = it
        ? { ok: true, cost: SEARCH.COST, kind, seq: num(it.Sequence), item: it, seed, text: `找到物品${it.Name}。` }
        : { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
    } else {
      out = { ok: true, cost: SEARCH.COST, kind: 'none', seed, text: '搜索一無所獲。' };
    }
  }
  out.stage = stage;
  if (!free) spendCityMoney(save, cityDef, SEARCH.COST);
  // 本函式自己記日誌：count = 本城歷史搜索次數，必須隨每次搜索遞增，否則種子固定、
  // 每次都是同一個結果。頁面因此**不要**再為「搜索」補一條日誌。
  // 先自增再寫日誌：logAdd 會叫 ensureExtras，若順序反過來，老存檔遷移會把剛寫的
  // 這一條也數進去，變成 count+2。
  bumpSearchSeq(save, city, count);
  if (!quiet) {
    logAdd(save, { city, cmd: '搜索', kind: out.kind, text: out.text, m: save.month });
    out.logged = true;
  } else {
    out.logged = false;   // [F10] 自治代行：寶物/空手都不留痕，只有人才由呼叫端補一條
  }
  return out;
}

/**
 * 本城歷史搜索次數（0 基的 count，就是這次要用的）。
 * 優先讀 `save.searchSeq`（單調計數器）；缺失時退回 `searchLog` 條數（老存檔/未經 ensureExtras）。
 */
export function searchCount(save, cityName) {
  const seq = save?.searchSeq;
  if (seq && typeof seq === 'object' && !Array.isArray(seq)) {
    const n = Number(seq[cityName]);
    if (Number.isFinite(n) && n >= 0) return Math.trunc(n);
  }
  const list = Array.isArray(save?.searchLog) ? save.searchLog : [];
  return list.filter((e) => e.city === cityName && e.cmd === '搜索').length;
}

/** 搜索成功後把本城計數器 +1（只增不減；金不足早退不會走到這裡） */
function bumpSearchSeq(save, cityName, prev) {
  if (!save.searchSeq || typeof save.searchSeq !== 'object' || Array.isArray(save.searchSeq)) {
    save.searchSeq = {};
  }
  const cur = Math.trunc(num(save.searchSeq[cityName]));
  save.searchSeq[cityName] = Math.max(prev + 1, Number.isFinite(cur) ? cur + 1 : 1);
  return save.searchSeq[cityName];
}

/**
 * 移動：把本城兵力／武將調往**相鄰的我方城**。
 * 依據 docs/04c §2.3（移動武將）與 §5.2（可通行路徑，Length>=30000 是哨兵）。
 * opts: { to, troops, general }
 */
export function move(save, fromDef, opts, ctx) {
  const from = fromDef?.NAME;
  const to = typeof opts?.to === 'string' ? opts.to : '';
  if (!from) return { ok: false, reason: 'no-city' };
  if (!to || to === from) return { ok: false, reason: 'target' };
  if (!Array.isArray(save.owned) || !save.owned.includes(from)) return { ok: false, reason: 'not-own-city' };
  if (!save.owned.includes(to)) return { ok: false, reason: 'not-owned' };
  if (!neighboursOf(from, ctx?.scenario).includes(to)) return { ok: false, reason: 'not-adjacent' };

  const toDef = cityDefOf(to, ctx?.scenario);
  if (!toDef) return { ok: false, reason: 'target' };
  const src = ensureCityState(save, fromDef);
  const dst = ensureCityState(save, toDef);
  if (!src || !dst) return { ok: false, reason: 'no-city' };

  const n = intOr(opts?.troops, 0, 0, Math.max(0, src.troops));
  const name = typeof opts?.general === 'string' ? opts.general : '';
  if (!n && !name) return { ok: false, reason: 'empty' };

  let general = null;
  if (name) {
    general = rosterOf(save, from, ctx).find((g) => g.NAME === name) || null;
    if (!general) return { ok: false, reason: 'absent' };
  }

  let moved = 0;
  if (n > 0) {
    // 目的城也吃 600 的部隊兵上限（與徵兵同一條；campaign.html:892 同款）。
    // 走不動的那部分是「留在本城」而不是蒸發：moved = min(想帶, 本城有, 目的城空間)。
    moved = Math.min(n, src.troops, Math.max(0, RECRUIT.CAP - dst.troops));
    if (moved <= 0) return { ok: false, reason: 'full', from, to, cap: RECRUIT.CAP };
    // R12 步／騎分列：先走步兵、不夠再走騎兵（原作移動的是部隊、不細分兵種 ⇒ [推測]）
    const inf = Math.min(moved, src.inf);
    const cav = moved - inf;
    src.inf -= inf;
    src.cav -= cav;
    dst.inf += inf;
    dst.cav += cav;
    src.troops = src.inf + src.cav;
    dst.troops = dst.inf + dst.cav;
  }
  if (general) {
    // 調走太守/軍師要一併卸任，不然城的守將會指向不在城裡的人
    const ap = save.appointed[from];
    if (ap) {
      if (ap.major === general.NAME) ap.major = '';
      if (ap.wise === general.NAME) ap.wise = '';
      if (!ap.major && !ap.wise) delete save.appointed[from];
    }
    detachGeneral(save, from, general, ctx);
    attachGeneral(save, to, general, ctx);
  }
  return { ok: true, troops: moved, asked: n, general, from, to };
}

/**
 * 出征目標：相鄰、不是我方。**關卡也是目標**（依據 docs/04c §2.3 / §5.2）。
 *
 * 為什麼關卡要留在名單裡：關（易京/官渡/赤壁…）是地圖上的節點，可以打、打完可以占，
 * 占了之後從它出發才能打到下一座城（例如公孫瓚開局：北平<->南皮/代縣 都是 30000 的
 * 斷行哨兵，只有 北平<->易京 78 是通路）。舊碼末尾 `.filter(row => !row.gate)` 把關卡
 * 剔掉，等於 184 劇本公孫瓚永久沒有出征目標（Cocos 內政→出征 的實測日誌
 * 「相鄰沒有可出征的敵城（或只有關卡）」就是這句話）。
 *
 * 關卡的三個欄位與一般城不同：
 *   - `owner`：劇本 `KING` 是 TIMES.INI 殘留的 1..12 序號（`易京.KING === 1`，數字），
 *     不是君主名，所以**一律當無主 `''`**；別讀 `def.KING`，否則列表會出現「勢力 3」。
 *     （`garrison.json` 的 `owner` 也是 `""`，兩邊一致。）
 *   - `troops`：關卡 `POPULATION=0`，兵力不在人口上，改讀 `garrison.json`（見 `gateTroopsOf`）。
 *   - `gate`：保留 `true`，UI 用它印「關」徽標；`def`/`generals` 與一般城同一來源。
 */
export function deployTargets(save, cityDef, ctx) {
  const owned = Array.isArray(save?.owned) ? save.owned : [];
  return neighboursOf(cityDef?.NAME, ctx?.scenario)
    .filter((n) => !owned.includes(n))
    .map((name) => {
      const def = cityDefOf(name, ctx?.scenario);
      if (!def) return null;
      const st = cityStateOf(save, name) || {};
      const gate = isGate(def);
      return {
        name,
        owner: gate ? '' : String(def.KING || ''),
        gate,
        troops: gate ? gateTroopsOf(name, def, ctx) : (num(st.troops) || troopCapOf(def.POPULATION)),
        def: Number.isFinite(Number(st.def)) ? num(st.def) : num(def.DEFENSE),
        generals: rosterOf(save, name, ctx).length,
      };
    })
    .filter(Boolean);
}

/** 情報：本城 ＋ 相鄰城（只讀）。回傳 { self, rows } */
export function intel(save, cityDef, ctx) {
  if (!cityDef?.NAME) return { self: null, rows: [] };
  const owned = Array.isArray(save?.owned) ? save.owned : [];
  const self = cityRow(save, cityDef, ctx, owned);
  const rows = neighboursOf(cityDef.NAME, ctx?.scenario)
    .map((name) => cityDefOf(name, ctx?.scenario))
    .filter(Boolean)
    .map((def) => cityRow(save, def, ctx, owned));
  return { self, rows };
}

function cityRow(save, cityDef, ctx, owned) {
  const st = cityStateOf(save, cityDef.NAME) || {};
  const mine = owned.includes(cityDef.NAME);
  const owner = String(cityDef.KING || '');
  const gate = isGate(cityDef);
  const pop = Number.isFinite(Number(st.pop)) ? num(st.pop) : num(cityDef.POPULATION);
  const troops = Number.isFinite(Number(st.troops)) ? num(st.troops) : troopCapOf(pop);
  const cav = Number.isFinite(Number(st.cav)) ? Math.min(num(st.cav), troops) : 0;
  return {
    name: cityDef.NAME,
    mine,
    gate,
    // 關卡的 KING 是 1..12 的序號（12 座關正好 1..12），不是君主名，別直接印出來
    owner: mine ? '我方' : (gate ? '關卡' : (owner && !/^\d+$/.test(owner) ? owner : '無主')),
    troops,
    // R12 步／騎分列（原作 0x489138「步兵數」／0x489148「騎兵數」）
    inf: troops - cav,
    cav,
    // R12 預備兵池（原作 0x48B2B8「預備兵 %d/%d」，+0x86 現有 / +0x82 上限）
    prep: Number.isFinite(Number(st.prep)) ? Math.min(num(st.prep), prepCapOf(pop)) : prepCapOf(pop),
    prepCap: prepCapOf(pop),
    def: Number.isFinite(Number(st.def)) ? num(st.def) : num(cityDef.DEFENSE),
    generals: rosterOf(save, cityDef.NAME, ctx).length,
    major: mine ? (majorOf(save, cityDef) || '—') : (String(cityDef.MAJOR || '') || '—'),
    auto: isAuto(save, cityDef.NAME),
  };
}

/** 任命：改太守 / 軍師（依據 docs/04c §2.2 +0x14 太守、+0x18 軍師） */
export function appoint(save, cityDef, role, name, ctx) {
  if (role !== 'major' && role !== 'wise') return { ok: false, reason: 'role' };
  if (!cityDef?.NAME) return { ok: false, reason: 'no-city' };
  const g = rosterOf(save, cityDef.NAME, ctx).find((x) => x.NAME === name);
  if (!g) return { ok: false, reason: 'absent' };
  const cur = save.appointed[cityDef.NAME] || { major: '', wise: '' };
  save.appointed[cityDef.NAME] = { ...cur, [role]: g.NAME };
  return { ok: true, role, general: g, eff: efficiencyOf(save, cityDef, ctx) };
}

/* ======================================================================
 * 7b. R10 自治（原作內政選單「自治施行」）
 *
 * 依據 docs/04c §2.3 反組譯：0x42771A "沒有設定自治的城市!!%K%"、
 * 0x427865 "執行城市自治完畢!!%K%"、0x4278CE / 0x4278F5 "自治施行"。
 * ⇒ 原作是**一條內政命令**：對「已設定自治」的城批量代行開發，施行完印一行總結。
 * 反組譯只到這裡，以下三點是 [推測]／[新設計]：
 *   1. 施行者是誰：原作沒有「本城代替別城」的參數，這裡當作「從當前所在城下令，
 *      對其他所有已設定自治的城各做一次開發」。
 *   2. 是否花金：開發要金（04c §2.3 開發流程），自治代行照樣從國庫扣，扣不起就跳過該城。
 *   3. 是否每月自動：本章沒有換月回呼（campaign.html 不歸我改），所以做成
 *      `autonomyTick()` 的 **lazy tick** —— 打開城池頁、發現月份變了就補跑一次，
 *      中間漏掉的月份不會重跑（只跑一次），並用 `save.autoMonth` 記帳。
 * ==================================================================== */

/** 自治命令的文字（頁面按鈕／日誌共用；原作 0x4278CE / 0x4278F5） */
export const AUTONOMY = {
  CMD: '自治',
  TITLE: '自治施行',
  NO_CITY: '沒有設定自治的城市!!',
  DONE: '執行城市自治完畢!!',
  ROW: (city, pop, def) => `${city}城自治：開墾 +${pop} 人口、+${def} 防禦。`,
};

/** 設定／解除某城自治；回傳 save（鏈式） */
export function setAuto(save, cityName, on = true) {
  ensureExtras(save);
  const name = typeof cityName === 'string' ? cityName.trim() : '';
  if (!name) return save;
  if (on) save.auto[name] = 1;
  else delete save.auto[name];
  return save;
}

/** 已設定自治的城名；傳了 cityDefs 就照劇本順序回，否則照設定順序 */
export function autoCities(save, cityDefs) {
  ensureExtras(save);
  const set = new Set(Object.keys(save.auto || {}));
  if (!Array.isArray(cityDefs)) return [...set];
  const ordered = cityDefs.filter((d) => d && set.has(d.NAME)).map((d) => d.NAME);
  for (const n of set) if (!ordered.includes(n)) ordered.push(n);
  return ordered;
}

/** 自治是否已開（純讀，不改存檔：情報面板要能安全呼叫） */
export function isAuto(save, cityName) {
  const a = save?.auto;
  if (!a || typeof a !== 'object' || Array.isArray(a)) return false;
  const v = a[cityName];
  return v === 1 || v === true || v === '1';
}

/**
 * 執行自治（原作「自治施行」）：對每個已設定自治、且不是 `opts.from` 的城各做一次開發。
 * @param {object} save
 * @param {Array} cityDefs 劇本 city list（用來把城名對到定義）
 * @param {object} ctx
 * @param {{from?:string, quiet?:boolean}} opts from=當前所在城（不代行自己那座）
 * @returns {{ok:boolean, reason?:string, ran:Array, skipped:Array, gold:number, cost:number, text:string}}
 */
export function runAutonomy(save, cityDefs, ctx, opts = {}) {
  ensureExtras(save);
  const from = typeof opts.from === 'string' ? opts.from : '';
  const wanted = Object.keys(save.auto || {});
  const list = (Array.isArray(cityDefs) ? cityDefs : []).filter((d) => d && wanted.includes(d.NAME));
  const targets = list.filter((d) => d.NAME !== from);
  if (!targets.length) {
    return { ok: false, reason: 'none', ran: [], skipped: [], gold: nationalGold(save, cityDefs), cost: 0, text: AUTONOMY.NO_CITY };
  }

  const ran = [];
  const skipped = [];
  let cost = 0;
  for (const def of targets) {
    // [F10] 自治**只代行開發、不代行「人才/寶物」的展示**：
    //   指南 `ref_pdf\sanguo2_guide.txt` L103-104「自動模式找到的寶物不顯示，除非搜到人」。
    //   所以每城照手動規則擲一次搜索（照樣推進 searchSeq），但 quiet=true 讓 search()
    //   不寫日誌；只有真的搜到人才由這裡補一條自治日誌。代行是自動結算、不收費
    //   （free=true；同頁 R85 已證開發代行也不動 city+0x92，且 R10 钉了「自治不扣金」）。
    const found = search(save, def, Object.assign({}, ctx, { quiet: true, free: true }));
    if (found && found.ok && found.kind === 'talent') {
      logAdd(save, {
        m: intOr(save.month, 1, 1), city: def.NAME, cmd: AUTONOMY.CMD, kind: 'talent',
        text: `自治搜索：${found.text}`,
      });
    }
    // 原作外殼 0x427B9E 只在「人口增量與防禦增量都 0」時靜默回 0；單邊 0 是正常結果。
    // 但代行是替玩家按一次按鈕，日誌寫「開墾 +0 人口」很怪，所以代行層重擲到兩邊都有進帳
    // 為止（上限 8 次；單邊 0 的機率約 1/12，8 次全 0 可忽略）。重擲**不重複收費**：
    // 每次重擲前把上一次的開發金退回本城 money，最後只記一次 cost。這是 [新設計]，
    // 只影響代行層，手動開發（city.html 的按鈕）仍照原作單擲、可能出現 +0（`reason:'nothing'`）。
    let r = develop(save, def, ctx);
    for (let k = 0; k < 8 && (r.ok ? r.pop <= 0 || r.def <= 0 : r.reason === 'nothing'); k += 1) {
      // [F16] 退款巷本城 money（不再碰 save.gold）；DEV.COST 現為 0，這一段是給日後改價留的。
      if (r.ok && r.cost) {
        const rst = ensureCityState(save, def);
        if (rst) rst.money = Math.max(0, Math.trunc(num(rst.money)) + r.cost);
      }
      r = develop(save, def, ctx);
    }
    if (r.ok) {
      cost += r.cost;
      ran.push({ city: def.NAME, pop: r.pop, def: r.def });
      if (!opts.quiet) {
        logAdd(save, { m: intOr(save.month, 1, 1), city: def.NAME, cmd: AUTONOMY.CMD, kind: 'auto', text: AUTONOMY.ROW(def.NAME, r.pop, r.def) });
      }
    } else {
      skipped.push({ city: def.NAME, reason: r.reason || 'skip' });
    }
  }
  const text = ran.length
    ? `${AUTONOMY.DONE}（${ran.length} 城，-${cost} 金）`
    : `${AUTONOMY.DONE}（0 城：${skipped[0]?.reason === 'gold' ? '金不足' : '無可開發'}）`;
  return { ok: ran.length > 0, reason: ran.length ? undefined : (skipped[0]?.reason || 'none'), ran, skipped, gold: nationalGold(save, cityDefs), cost, text };
}

/**
 * 換月 lazy tick：把「錢變兵」與「自治代行」補到當前月（一個月只結算一次）。
 * 由 city.html 在載入時呼叫、campaign.html 的 advanceMonth() 也會呼叫。
 *
 * F13：預設走 `prepFromMoney()`（原作 100 金 → 1 預備兵）；
 * `opts.loose === true`（`?loose=1`）才走舊的 `refillPrep()`（每月白補 10%）做對照。
 * refilled 仍是**每城都 push**（gained 0 也 push），既有測試與城市列表都靠這個形狀。
 * @returns {{month:number, refilled:Array, auto:object|null, first:boolean}}
 */
export function autonomyTick(save, cityDefs, ctx, opts = {}) {
  ensureExtras(save);
  const defs = Array.isArray(cityDefs) ? cityDefs.filter(Boolean) : [];
  const month = intOr(save?.month, 1, 1);
  const last = intOr(save.autoMonth, 0, 0);
  if (!(month > last)) return { month, refilled: [], auto: null, first: false };

  const loose = !!(opts && opts.loose === true);
  const refilled = [];
  for (const def of defs) {
    if (loose) {
      const r = refillPrep(save, def);
      if (r.gained > 0) refilled.push({ city: def.NAME, gained: r.gained, prep: r.prep, cap: r.cap });
      else if (r.ok) refilled.push({ city: def.NAME, gained: 0, prep: r.prep, cap: r.cap });
    } else {
      const r = prepFromMoney(save, def);
      if (r.ok) refilled.push({ city: def.NAME, gained: r.n, cost: r.cost, prep: r.prep, cap: r.cap, money: r.money, kind: 'money' });
    }
  }
  save.autoMonth = month;

  let auto = null;
  if (Object.keys(save.auto || {}).length) {
    // 自治每月都跑（不看 lastActionMonth：原作換月會清令，自治屬於換月後的代行）
    auto = runAutonomy(save, defs, ctx, { from: '' });
  }
  return { month, refilled, auto, first: last === 0 };
}

/* ======================================================================
 * 8. 搜索掉落表（items.json 的 SearchType / Rate）
 * ==================================================================== */

/**
 * R17：單件物品在「已知等級」下的權重（docs/04b2 §5.3 的輪盤公式）。
 *
 *   SearchType 0（兵符/兵書/珠寶等）：w = Rate
 *   SearchType 1：|等級 − Level| > 4 → 0；否則 w = Rate / |等級 − Level|（同級 → Rate）
 *   SearchType 2：等級 < Level − 4 → 0；等級 < Level → Rate / (Level − 等級)；否則 Rate
 *
 * `level<=0` ＝ 等級未知 → 一律回 Rate（本移植原本的無窗口徑，保持既有行為）。
 * 原作的 Level 是物品 +0x36，`g->+0x2E` 是執行搜索武將的等級（04c §3.2）。
 */
export function searchItemWeight(it, level) {
  const rate = num(it?.Rate);
  if (!(rate > 0)) return 0;
  const lv = Math.trunc(num(level));
  if (!(lv > 0)) return rate;
  const need = Math.trunc(num(it?.Level));
  if (!(need > 0)) return rate;
  const group = Math.trunc(num(it?.SearchType));
  if (group === 1) {
    const d = Math.abs(lv - need);
    return d > 4 ? 0 : (d ? rate / d : rate);
  }
  if (group === 2) {
    if (lv < need - 4) return 0;
    return lv < need ? rate / (need - lv) : rate;
  }
  return rate;
}

/**
 * 兩張掉落表：
 *   talisman 兵符／陣法書 — items.json `SearchType===0` 且 Force>0（兵符 13 件）或 Battle>0（陣法書 9 件）
 *   treasure 寶物       — SearchType 1/2 的兵器坐騎，加上 SearchType 0 的兵書（JEWEL_THING）與珠寶（Loyal>0）
 * Rate 是**權重**，Rate===0 的 5 件（直劍/短錐槍/銅殳/眉尖刀/黃鬃馬，開局就有的）搜不到。
 *
 * R17 等級窗：第三參 `level>0` 時按 04b2 §5.3 把權重為 0 的物品剔出池；
 * 不傳/傳 0 ＝ 等級未知，保持舊口徑（所有 Rate>0 的都進池）。
 *
 * R18 唯一物品（`Attrib === 'ONLYONE'`，items.json 共 16 件）：**全局只出一次**。
 * 已經有的（背包裡、或本局搜到過的 `save.foundItems`）直接不進池 —— 與
 * `game/src/core/capture.ts` 的 `dropWeight(item, level, taken)` 同一條規則
 * （`if (item.Attrib === 'ONLYONE' && taken.includes(String(item.Sequence))) return 0`）。
 * @param {Array} items items.json 全表
 * @param {Array|Set<number|string>} taken 已擁有的序號（背包 ∪ save.foundItems）
 * @param {number} level 執行搜索武將的等級；0/缺省 = 不知等級、不套窗
 */
export function searchPools(items, taken = [], level = 0) {
  const held = new Set(
    [...(taken instanceof Set ? taken : Array.isArray(taken) ? taken : [])]
      .map((n) => String(Math.trunc(num(n))))
      .filter((s) => s !== '0'),
  );
  const lv = Math.trunc(num(level));
  const talisman = [];
  const treasure = [];
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.Name) continue;
    const rate = num(it.Rate);
    if (rate <= 0) continue;
    // R17：已知等級時，窗外的物品不進池（與權重 0 等價）
    if (lv > 0 && searchItemWeight(it, lv) <= 0) continue;
    // R18：唯一物品已經有 ⇒ 這次搜索不可能再出（原作全局唯一）
    if (String(it.Attrib || '') === 'ONLYONE' && held.has(String(num(it.Sequence)))) continue;
    const group = num(it.SearchType);
    const type = String(it.TYPE || '');
    if (num(it.Force) > 0 || num(it.Battle) > 0) {
      if (group === 0) talisman.push(it);
    } else if (group === 1 || group === 2) {
      treasure.push(it);
    } else if (type === 'JEWEL_THING' || num(it.Loyal) > 0) {
      treasure.push(it);
    }
  }
  return { talisman, treasure };
}

/**
 * 已擁有的物品序號：`ctx.bag`（items.html 的背包，頁面負責讀 localStorage 傳進來）
 * ∪ `save.foundItems`（本局搜到的）。R18 用它把「唯一物品」擋在池子外。
 */
export function ownedItemSeqs(save, ctx) {
  const bag = Array.isArray(ctx?.bag) ? ctx.bag : [];
  const found = Array.isArray(save?.foundItems) ? save.foundItems : [];
  return [...new Set([...bag, ...found]
    .map((n) => Math.trunc(num(n)))
    .filter((n) => n > 0))];
}

/** 記下「本局搜到過這件」，讓唯一物品下一次不再進池（R18） */
export function rememberFound(save, seq) {
  const n = Math.trunc(num(seq));
  if (!(n > 0) || !save) return save;
  if (!Array.isArray(save.foundItems)) save.foundItems = [];
  if (!save.foundItems.includes(n)) save.foundItems.push(n);
  return save;
}

/* ======================================================================
 * 9. 物品背包（items.html 的鍵；本頁只做「搜到就放進去」）
 * ==================================================================== */

/** 讀 items.html 的存檔形狀：{equip, bag}；背包＝擁有清單（items.html:211 註解） */
export function parseItemsSave(raw) {
  const out = { equip: {}, bag: [] };
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    if (Array.isArray(raw.bag)) out.bag = raw.bag.map(Number).filter((n) => Number.isFinite(n));
    if (raw.equip && typeof raw.equip === 'object' && !Array.isArray(raw.equip)) out.equip = raw.equip;
  }
  out.bag = [...new Set(out.bag.filter((n) => Number.isFinite(n)))];
  if (!out.bag.length) out.bag = DEFAULT_BAG.slice();   // 與 items.html:209 同一個預設
  return out;
}

/** 把一件物品加進背包（已擁有則不重複）；回傳新的存檔物件，不改入參 */
export function withBagItem(raw, seq) {
  const n = num(seq);
  const out = parseItemsSave(raw);
  if (n && !out.bag.includes(n)) out.bag.push(n);
  return out;
}

/* ======================================================================
 * 10. 內部：加/移將、加權抽樣
 * ==================================================================== */

export function addToRoster(save, city, name) {
  ensureExtras(save);
  const list = Array.isArray(save.roster[city]) ? save.roster[city] : [];
  if (!list.includes(name)) list.push(name);
  save.roster[city] = list;
  return save.roster[city];
}

function detachGeneral(save, city, general, ctx) {
  ensureExtras(save);
  const list = save.roster[city];
  if (Array.isArray(list)) {
    const i = list.indexOf(general.NAME);
    if (i >= 0) list.splice(i, 1);
    if (!list.length) delete save.roster[city];
  }
  return save;
}

function attachGeneral(save, city, general, ctx) {
  ensureExtras(save);
  const scenIdx = intOr(ctx?.scenIdx, 0, 0);
  const home = cityOf(general, scenIdx);
  if (home === city) {
    delete save.roster._moved?.[general.NAME];
    const list = save.roster[city];
    if (Array.isArray(list)) {
      const i = list.indexOf(general.NAME);
      if (i >= 0) list.splice(i, 1);
      if (!list.length) delete save.roster[city];
    }
    return save;
  }
  save.roster._moved = save.roster._moved || {};
  save.roster._moved[general.NAME] = city;
  return addToRoster(save, city, general.NAME);
}

function pickWeightedKey(weights, r) {
  const entries = Object.entries(weights).filter(([, w]) => num(w) > 0);
  const total = entries.reduce((a, [, w]) => a + num(w), 0);
  if (!total) return 'none';
  let x = r * total;
  for (const [key, w] of entries) {
    x -= num(w);
    if (x < 0) return key;
  }
  return entries[entries.length - 1][0];
}

function pickWeightedItem(list, r, weightOf) {
  const weight = typeof weightOf === 'function' ? weightOf : (it) => num(it.Rate);
  const rows = (Array.isArray(list) ? list : [])
    .map((it) => [it, num(weight(it))])
    .filter(([, w]) => w > 0);
  if (!rows.length) return null;
  const total = rows.reduce((a, [, w]) => a + w, 0);
  let x = r * total;
  for (const [it, w] of rows) {
    x -= w;
    if (x < 0) return it;
  }
  return rows[rows.length - 1][0];
}

/* ======================================================================
 * 11. 對外連結（自測會斷言這兩個網址）
 * ==================================================================== */

export function itemsUrl(cityName) {
  return './items.html?city=' + encodeURIComponent(String(cityName || ''));
}

export function deployUrl(targetName) {
  return './deploy.html?city=' + encodeURIComponent(String(targetName || ''));
}

/* ======================================================================
 * 12. R8 一月一令（原作 0x4A64BC = 「本月内政/军令已下达」）
 * ----------------------------------------------------------------------
 * 原作每月只能下**一条**内政或军令：换月流水线 0x41B69D 里把 [0x4A64BC] 清 0，
 * 下令点把它置 1（docs/04c §1；写点 0x427923 / 清点 0x41B6D5、0x438415）。
 * 存档只多一个数字字段，不动任何既有结构：
 *   lastActionMonth: number —— 下过令的那个月序号（对齐 save.month）；0/缺省 = 本月还没动
 * 推进一月后 save.month 变大，`lastActionMonth === month` 自然不再成立；
 * campaign.html 的 advanceMonth() 还会显式 clearMonthLock() 一次（照原作"换月清位"）。
 * ?unlimited=1 是**调试开关**（截图/自测/批量跑数据），默认关闭，不是玩法。
 * ==================================================================== */

/** 本月是否已经下过令（unlimited=true 时永远 false） */
export function monthLocked(save, unlimited = false) {
  if (unlimited) return false;
  const acted = intOr(save && save.lastActionMonth, 0, 0);
  return acted > 0 && acted === intOr(save && save.month, 1, 1);
}

/** 记下"本月已行动"；unlimited 或存档缺失时不记。返回是否真的记了。 */
export function markMonthActed(save, unlimited = false) {
  if (unlimited || !save || typeof save !== 'object' || Array.isArray(save)) return false;
  save.lastActionMonth = intOr(save.month, 1, 1);
  return true;
}

/** 换月清位（advanceMonth 每月调一次，对应原作的 0x4A64BC = 0） */
export function clearMonthLock(save) {
  if (save && typeof save === 'object' && !Array.isArray(save)) save.lastActionMonth = 0;
  return save;
}

/** 按钮上的置灰提示；UI 与文档共用同一句 */
export const LOCK_HINT = '本月已行動';
/** 调试开关打开时顶栏/命令区显示的话（写明不是玩法） */
export const UNLIMITED_HINT = '除錯：不限行動次數（?unlimited=1，不是玩法）';
