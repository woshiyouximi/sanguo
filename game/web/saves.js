/**
 * saves.js — 10 个存档位 + 剧本/新游戏的**纯逻辑**（无 DOM、无 fetch、无顶层副作用）。
 *
 * 设计要点：
 *   1. `sanguo_saves_v1` 是唯一的存档容器：`{ v, last, slots: [ entry × 10 ] }`，
 *      槽 0 = 界面上的"槽 1"。空槽是 `null`，不是 `{}`，这样"空"和"损坏"能区分。
 *   2. 每条 entry 的 `snapshot` 存**完整的 campaign 存档对象**，并且是深拷贝：
 *      写进去之后再改内存对象不会污染已存内容，读出来再改也不会反写。
 *   3. **不做字段白名单**：`snapshot` 原样整份存取。`main.js` 正在往战役存档里加
 *      `captured` / `drops`，任何白名单都会把队友的数据吃掉。
 *   4. `sanguo_campaign_v1`（旧版单档）只作为两件事使用：
 *      · 迁移源：`sanguo_saves_v1` 为空时搬进槽 1；
 *      · 战斗写回缓冲：`main.js` 只认这个键，所以 campaign.html 每次动作都镜像一份。
 *   5. 所有入口对"损坏 JSON / 越界槽号 / 空 snapshot"都必须不抛异常，只返回空值。
 *
 *   6. **存档结构（本文件 3 版）**：`snapshot.v = SNAPSHOT_VERSION`（现在 3）。
 *      没有 `v` 的老档/旧槽按 `upgradeSnapshot()` 自动补字段（只补不删，幂等），
 *      所以升级不会让老档读不出来；槽条目里的 `monarch/forceCount/cityCount/...`
 *      都是写档时算好的摘要，列表不用去翻 snapshot。
 *
 *   6b. **R84 v2→v3：字段语义对齐原作（不是字节兼容）**。v3 相对 v2 只**加**字段：
 *       · 时间：`year` / `yearFlag`（原作头部 +0x58 年 / +0x5E 年进位标志；真源仍是 `month`）
 *       · 年度账本：`ledger = {year, months, income, salary}`（R7 的 `ledgerOf()` 形状）
 *       · 武将档案：`generalStatus`（原作段4 +0x0B9 STATUS：`登`=1 / `俘`=2 / `野`=8）、
 *         `weapon` / `horse` / `thing`（原作段4 +0x0C3 / +0x0C1 / +0x0C5）
 *       已存在不需要动的：`generalLevel`(等级 +0x04E) / `generalExp`(经验 +0x04A) /
 *       `loyal`(忠誠) / `morale`(士气 ≡ 原作 Spirit) / `tire`(疲劳 +0x05C) /
 *       `learned`(技能表：段4 +0x08D / +0x09D 的 8×{已学,等级} 的可序列化部分)。
 *       见 `SNAPSHOT_STEPS`（迁移是逐跳的，`steps` 可断言）。
 *   7. **R70 势力色板**也在本文件：`FORCE_PALETTE` 是唯一色值表。放这里不是因为它
 *      属于存档，而是 campaign.html 与 `tests/saves_r70.test.ts` 都能 import 它，
 *      色值只写一次，地图/图例/测试不会各抄一套。
 *
 * 浏览器里 `import * as Saves from './saves.js'`；Node 里直接 `import './saves.js'`
 * （`game/package.json` 已有 `"type": "module"`）。storage 参数可注入，
 * 自测用内存 Map 代替 localStorage。
 */

// 紀元（公元）顯示：本檔的 `monthLabel()` 仍是「第X年Y月」的老口徑（測試釘死），
// 要原作那種「西元 209年 3月」／存檔行的「時間209年」一律走 era.js（純函式，無依賴）。
import * as era from './era.js';

export const SAVE_KEY = 'sanguo_saves_v1';   // 键名不改：改名＝已存玩家的 10 个槽全丢
export const LEGACY_KEY = 'sanguo_campaign_v1';
export const SLOT_COUNT = 10;

/**
 * 存檔/讀檔對話框要不要顯示「刪除」按鈕 —— **原作沒有**（`A_save_t0035.png`、`A_load_t0192.png`：
 * 只有 10 行記錄 + 底部的「確定/取消」，沒有刪檔鈕，也沒有獨立的自動存檔槽）。
 * `campaign.html` 的 `renderSlotRows()` 目前每行多畫了一顆「刪」，照原作應該收掉；
 * 該檔由別的 agent 持有，這裡只提供開關（`Saves.SLOT_DELETE_UI === false`），不去改它。
 * `clearSlot()` 本身保留：新遊戲重置、測試還在用。
 */
export const SLOT_DELETE_UI = false;
export const STORE_VERSION = 2;              // 容器版本：1 = R70 之前，2 = 带格式版本/摘要
export const SNAPSHOT_VERSION = 3;           // 存档对象（snapshot）格式版本：0 = 没有 v 字段的老档

// ---------------------------------------------------------------------------
// 基础工具
// ---------------------------------------------------------------------------

/** 数值化；`''` / null / NaN 一律 0，避免存档里的空串把 UI 变成 NaN */
export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** 整数化并夹到 [min, max] */
export function intOr(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

/**
 * 深拷贝。优先 structuredClone（保留 Date/Map 等），失败退回 JSON。
 * 不能返回原对象：⑦ 要求"改内存对象不影响已存内容"。
 */
export function deepClone(value) {
  if (value === null || typeof value !== 'object') return value;
  const sc = globalThis.structuredClone;
  if (typeof sc === 'function') {
    try { return sc(value); } catch { /* 含函数/循环引用时退回 JSON */ }
  }
  try { return JSON.parse(JSON.stringify(value)); } catch { return null; }
}

/** 绝对月数 → "第X年Y月"（12 个月一年，与 campaign.html 的 HUD 同口径） */
export function monthLabel(month) {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return `第${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

/** 真实时间戳 → "MM-DD HH:mm"（本地时区；无效值给 "—"） */
export function clockLabel(ts) {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return '—';
  const d = new Date(n);
  const p = (v) => String(v).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 槽号：只接受 0..9（数字或数字字符串），其余返回 -1 */
export function slotIndex(index) {
  if (index === null || index === undefined || index === '') return -1;
  const n = typeof index === 'string' ? Number(index) : index;
  if (!Number.isInteger(n)) return -1;
  return n >= 0 && n < SLOT_COUNT ? n : -1;
}

// ---------------------------------------------------------------------------
// R70 势力色板（地图分色；色值只在这张表里出现一次）— [F28] 29 家全固定
// ---------------------------------------------------------------------------
/**
 * **29 家固定色板**（[F28]：`work\flow_audit\内政大地图_差异.md` 行 229「14 色板对 18 家不够用
 * → 撞色」）。这 29 个名字 = `scenarios.json` 五个剧本 KING 字段的**文本势力并集**
 * （剧本 0 另 12 个数字残留 `"1".."12"` 是关城没有势力，不算）。
 *
 * 为什么不再用「前 14 家固定 + 表外哈希」：
 *   · 剧本 1（討伐董卓）18 家，只有 9 家落在旧固定表，其余按 `forceHash` 落备色 ⇒
 *     实测撞色 `#8A5FA0 = 曹操/王朗`、`#A0603A = 馬騰/袁術`（差异清单行 219-222）；
 *   · 剧本 2/3 的 `#3A7F8E = 劉備/劉璋` 同理。
 *   现在**逐家定色**（按剧本势力表的出场顺序排，同一名字永远同一色），
 *   29 个色值互不相同（`tests/affairs_p1.test.ts` 会验唯一性与最小间距）。
 *
 * `[新设计]` 具体色值不是原作旗色的取色结果：原作每家有一面 `TROOP\FLAGnn`
 * 旗帜（`FLAGNUM` 1..26，见 docs/03c:70 / 05b:309），但那 27 张旗的像素主色
 * 没有反汇编或取色证据。这里只保证：29 家彼此可分辨、在 CHINAMAP 浅色底图上
 * 够暗够饱和、且每种颜色在 1px 深色描边下仍能读出归属。
 */
export const FORCE_PALETTE = Object.freeze([
  { force: '公孫瓚', color: '#6E8FBF' },   // 白馬義從：冷藍灰
  { force: '劉焉', color: '#B98A3E' },     // 益州：土黃褐
  { force: '張角', color: '#C9A82E' },     // 黃巾：芥黃
  { force: '韓馥', color: '#8E6BA8' },     // 冀州：紫
  { force: '龔景', color: '#4F8F8B' },     // 青灰
  { force: '喬玄', color: '#7C8A48' },     // 橄欖
  { force: '何進', color: '#B14A3B' },     // 大將軍：朱紅
  { force: '董卓', color: '#6B6F76' },     // 西涼：鐵灰
  { force: '孫堅', color: '#E07C30' },     // 江東：亮橙（F28 微調：與劉焉/張角的橙金分開）
  { force: '陶謙', color: '#4F9A6E' },     // 徐州：玉綠
  { force: '孔岫', color: '#3F6E9A' },     // 靛青
  { force: '丁原', color: '#8C6248' },     // 并州：磚棕
  { force: '劉繇', color: '#7560C4' },     // 揚州：青蓮（F28 微調：與韓馥的紫分開）
  { force: '嚴白虎', color: '#5E7D5A' },   // 吳郡：苔綠
  { force: '袁紹', color: '#C25B6E' },     // 河北：玫瑰紅
  { force: '曹操', color: '#4A5FA8' },     // 兗州：深藍
  { force: '劉備', color: '#8DC24E' },     // 荊益：亮綠
  { force: '孔融', color: '#3FA8B5' },     // 北海：青藍
  { force: '喬瑁', color: '#8C8C2C' },     // 東郡：橄欖黃（F28 微調：與劉焉/喬玄分開）
  { force: '馬騰', color: '#C98F5A' },     // 西涼：淺赭
  { force: '袁術', color: '#A84A8E' },     // 淮南：洋紅
  { force: '劉表', color: '#3E6F5A' },     // 荊州：墨綠
  { force: '王朗', color: '#9E4F6E' },     // 會稽：酒紅
  { force: '孫權', color: '#CC2F2F' },     // 江東：正紅
  { force: '張魯', color: '#C7B84F' },     // 漢中：沙黃
  { force: '劉璋', color: '#4FB3D6' },     // 益州：天藍
  { force: '金旋', color: '#6E4E33' },     // 武陵：深棕
  { force: '孟獲', color: '#5E8E3A' },     // 南中：草綠
  { force: '徹里吉', color: '#8E3F3F' },   // 西羌：暗紅
]);

/** 备色（29 家以外的临时势力／劇本外名字用；与上面 29 条不重复） */
export const FORCE_RESERVE = Object.freeze([
  '#4A8D9E', '#9E4F6E', '#6E8E3A', '#8A5FA0', '#3E6F5A', '#A0603A', '#5A6E8E',
  '#8E8A3A', '#6E4A6E', '#3A7F8E', '#8E6E4A', '#4A6E5A', '#7A4A4A', '#5A8A6E',
]);

/** 无主 / 空城的颜色（中性灰，不参与势力分色） */
export const FORCE_COLOR_NEUTRAL = '#8A8478';
/** 玩家势力金环（campaign.html 画地图用） */
export const FORCE_GOLD = '#EFC978';
/** 城点深色描边（1px 级，压在底图上防被吃掉） */
export const FORCE_EDGE = '#080C10';

const FORCE_FIXED = new Map(FORCE_PALETTE.map((e, i) => [e.force, i]));

/** FNV-1a（32 位）：只求「同名同色」，不追求雪崩质量（只给 29 家以外的名字兜底） */
function forceHash(name) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

/**
 * 势力 → 色板下标：0..28＝固定 29 家，29..42＝备色，-1＝无主/非法。
 * [F28] 剧本 1 的 18 家、剧本 2/3 的 8 家、剧本 4 的 5 家全部落在 0..28（tests 里有断言），
 * 不再有「表外靠哈希撞进同一个备色」的情况。
 */
export function forceColorIndex(force) {
  if (typeof force !== 'string') return -1;
  const name = force.trim();               // 前後空白不算不同勢力（存檔裡 monarch 有時帶空白）
  if (!name) return -1;
  const fixed = FORCE_FIXED.get(name);
  if (fixed !== undefined) return fixed;
  return FORCE_PALETTE.length + (forceHash(name) % FORCE_RESERVE.length);
}

/** 势力 → `'#RRGGBB'`（空/非法 → 中性灰）。纯函数，不读存档。 */
export function forceColorOf(force) {
  const i = forceColorIndex(force);
  if (i < 0) return FORCE_COLOR_NEUTRAL;
  return i < FORCE_PALETTE.length ? FORCE_PALETTE[i].color : FORCE_RESERVE[i - FORCE_PALETTE.length];
}

/** 当前存档里「有城的势力」及其颜色（图例用；顺序＝城列表里第一次出现的顺序） */
export function forceColorMap(cityNames, forceOf) {
  const out = {};
  const list = Array.isArray(cityNames) ? cityNames : [];
  const fn = typeof forceOf === 'function' ? forceOf : () => '';
  for (const name of list) {
    const f = fn(name);
    if (typeof f !== 'string' || !f || out[f]) continue;
    out[f] = forceColorOf(f);
  }
  return out;
}

// ---------------------------------------------------------------------------
// R70 存档格式版本 / 迁移（老档没有 v 字段 → 自动补到 SNAPSHOT_VERSION）
// ---------------------------------------------------------------------------

/** snapshot 自报版本；没有 `v` 的老档 = 0；不是对象 = -1 */
export function snapshotVersionOf(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return -1;
  return intOr(snapshot.v, 0, 0, 999);
}

/**
 * 迁移跳（**逐跳**记录，`upgradeSnapshot().steps` 就是这条链的子集）：
 *   · `0 → 2`：无版本老档 → v2。补 29 个骨架键（城/名册/势力/等级表…）；
 *   · `2 → 3`：v2 → v3。补时间/账本/武将档案 7 键（见文件头 6b）。
 * 标 `[新设计]`：原作没有"存档版本"概念（07b：`SSAV` 版本只有 `0x00020000` 一个值，
 * 读档严格相等才算数），所以这里的版本号是**本项目 JSON 快照的结构版本**。
 */
export const SNAPSHOT_STEPS = Object.freeze([
  Object.freeze({ from: 0, to: 2 }),
  Object.freeze({ from: 2, to: 3 }),
]);

/**
 * 当前版本必须有的顶层字段（`normalizeStore` 用它判断「要不要重算摘要」）。
 *
 * v2 的 29 个键 + v3 新增 7 个：`year/yearFlag/ledger/generalStatus/weapon/horse/thing`。
 * 只**增**不减：老档缺的一律补默认（`ensureSnapshotShape`），已有值不改。
 */
const SNAPSHOT_REQUIRED = Object.freeze([
  // v2 骨架
  'scenario', 'month', 'gold', 'wins', 'losses', 'streak', 'bestStreak', 'defWins',
  'owned', 'cities', 'forces', 'generalLevel', 'generalExp', 'learned', 'loyal',
  'king', 'monarch', 'force', 'monarchSince', 'log', 'armies', 'roster', 'appointed',
  'fate', 'drift', 'tire', 'morale', 'lastActionMonth', 'ts',
  // v3：时间 / 武将档案（Status / Weapon / Horse / Thing）
  // 注意 `ledger` 故意**不在**这里：R7 的语义是"没结过账就没有账本"（yearsettle_r7:96 断言
  // `save.ledger === undefined`），塞进必填会逼迁移给新档造一个空账本 ≈ 伪造"结过账"。
  // 账本已存在时照样入档、照样清洗（见 ensureSnapshotShape），只是不强制存在。
  'year', 'yearFlag', 'generalStatus', 'weapon', 'horse', 'thing',
]);

function snapshotIsCurrent(snapshot) {
  return snapshot.v === SNAPSHOT_VERSION && SNAPSHOT_REQUIRED.every((k) => k in snapshot);
}

/**
 * 老档结构升级（幂等）：只补缺的字段、不改已有值、不删未知键。
 * 返回 `{ snapshot, from, to, changed, steps, filled }`：
 *   · `snapshot` 是升级后的对象（`changed=false` 时就是入参本身，不拷贝）
 *   · `steps` 是**逐跳**的版本链：老档 → `['v0→v2', 'v2→v3']`；v2 档 → `['v2→v3']`
 *   · `filled` 是补上的顶层字段名（诊断/测试用）
 *
 * `[新设计]` 没有历史字节格式要兼容（project/31 §三：不做 SSAV 字节级兼容），
 * 所以「版本号」的意义是**本项目的存档对象结构版本**，不是原作 0x00020000。
 */
export function upgradeSnapshot(raw) {
  const from = snapshotVersionOf(raw);
  const out = { snapshot: null, from, to: SNAPSHOT_VERSION, changed: false, steps: [], filled: [] };
  if (from < 0) { out.steps.push('invalid'); return out; }
  if (from >= SNAPSHOT_VERSION && snapshotIsCurrent(raw)) return { ...out, snapshot: raw };

  const s = deepClone(raw);
  if (!s) { out.steps.push('clone-failed'); return out; }
  const filled = ensureSnapshotShape(s);
  if (s.v !== SNAPSHOT_VERSION) { s.v = SNAPSHOT_VERSION; filled.push('v'); }
  if (from < SNAPSHOT_VERSION) {
    // 逐跳记：老档 → ['v0→v2', 'v2→v3']；v2 档 → ['v2→v3']
    for (const hop of SNAPSHOT_STEPS) {
      if (hop.to > from && hop.to <= SNAPSHOT_VERSION) out.steps.push('v' + hop.from + '→v' + hop.to);
    }
  }
  out.snapshot = s;
  out.changed = true;
  out.filled = filled;
  return out;
}

/**
 * 补 v2 结构（就地改 `s`），返回补上的字段名。
 * 数值一律取整并夹下限；坏类型当缺失（不抛、不删未知键）。
 */
function ensureSnapshotShape(s) {
  const added = [];
  const push = (k) => { if (!added.includes(k)) added.push(k); };
  const obj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
  const intAt = (key, lo, fallback) => {
    const n = Number(s[key]);
    if (Number.isFinite(n) && n >= lo) {
      const t = Math.trunc(n);
      if (s[key] !== t) { s[key] = t; push(key); }
      return;
    }
    s[key] = fallback; push(key);
  };
  const objAt = (key) => {
    if (obj(s[key])) return s[key];
    s[key] = {}; push(key); return s[key];
  };
  const mapAt = (key, lo, hi) => {
    const cur = s[key];
    const out = {};
    if (obj(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        const n = Number(v);
        if (!Number.isFinite(n)) continue;
        out[k] = Math.min(hi, Math.max(lo, Math.trunc(n)));
      }
    } else push(key);
    s[key] = out;
    return out;
  };

  // 字符串映射（v3 的 generalStatus / weapon / horse / thing）：非字符串值丢弃，空串不存
  const strMapAt = (key) => {
    const cur = s[key];
    const out = {};
    if (obj(cur)) {
      for (const [k, v] of Object.entries(cur)) {
        if (typeof v !== 'string') continue;
        const t = v.trim();
        if (t) out[k] = t;
      }
    } else push(key);
    s[key] = out;
    return out;
  };

  intAt('scenario', 1, 1);
  intAt('month', 1, 1);
  // [F5] 劇本起始公元年（189/200/208/219…）。老檔沒有這一欄 → 184（= 剧本 0 黃巾之亂，
  // 也是 era.js 的 AD_ANCHOR_DEFAULT）；只影響顯示，`yearOf()` 仍是年內換算。
  intAt('startYear', 1, START_YEAR_FALLBACK);
  intAt('gold', 0, 1200);
  for (const k of ['wins', 'losses', 'streak', 'bestStreak', 'defWins', 'lastActionMonth']) intAt(k, 0, 0);
  {
    const n = Number(s.ts);
    if (Number.isFinite(n) && n >= 0) { if (s.ts !== Math.trunc(n)) { s.ts = Math.trunc(n); push('ts'); } }
    else { s.ts = 0; push('ts'); }
  }
  intAt('monarchSince', 0, Number(s.month) || 1);
  // 字符串字段
  for (const k of ['king', 'monarch', 'force']) {
    if (typeof s[k] !== 'string') { s[k] = ''; push(k); }
  }
  if (!s.monarch && s.king) { s.monarch = s.king; push('monarch'); }
  if (!s.king && s.monarch) { s.king = s.monarch; push('king'); }
  if (!s.force && s.monarch) { s.force = s.monarch; push('force'); }
  // 数组
  if (!Array.isArray(s.owned)) { s.owned = []; push('owned'); }
  else {
    const filtered = s.owned.filter((n) => typeof n === 'string' && n);
    if (filtered.length !== s.owned.length) { s.owned = filtered; push('owned'); }
  }
  if (!Array.isArray(s.log)) { s.log = []; push('log'); }
  if (!Array.isArray(s.armies)) { s.armies = []; push('armies'); }
  // 对象/映射
  const cities = objAt('cities');
  for (const [name, st] of Object.entries(cities)) {
    if (!obj(st)) { cities[name] = {}; push('cities'); continue; }
    if (typeof st.owner !== 'string') { st.owner = ''; push('cities'); }
  }
  const roster = objAt('roster');
  if (!obj(roster._moved)) { roster._moved = {}; push('roster'); }
  objAt('appointed');
  objAt('forces');
  objAt('fate');
  mapAt('generalLevel', 1, 99);
  mapAt('generalExp', 0, 0x7fffffff);
  objAt('learned');
  mapAt('loyal', 0, 99);
  objAt('tire');
  objAt('morale');
  // ---- v3（R84）：时间 / 年度账本 / 武将档案 ---------------------------------
  // year 的真源仍是 month（yearOf）；老档里被写歪就按 month 重算——这是唯一允许"改已有值"的键。
  {
    const y = yearOf(s.month);
    if (Number(s.year) !== y) { s.year = y; push('year'); }
  }
  {
    const f = Number(s.yearFlag);
    if (f !== 0 && f !== 1) { s.yearFlag = f ? 1 : 0; push('yearFlag'); }
  }
  // ledger（R7 账本，**可选**）：只在已存在时清洗。缺就让它缺 —— R7 的语义是"没结过账就没有账本"，
  // 迁移替人造一个空账本 ≈ 伪造"已经结过账"（yearsettle_r7:96 的硬约束）。跨年重建是 ledgerOf 的活。
  if ('ledger' in s && !obj(s.ledger)) {
    delete s.ledger; push('ledger');
  } else if (obj(s.ledger)) {
    const led = s.ledger;
    const ly = Number(led.year);
    if (!Number.isFinite(ly) || ly < 1) { led.year = yearOf(s.month); push('ledger'); }
    else if (ly !== Math.trunc(ly)) { led.year = Math.trunc(ly); push('ledger'); }
    for (const k of ['months', 'income', 'salary']) {
      const n = Number(led[k]);
      const t = Number.isFinite(n) && n >= 0 ? Math.trunc(n) : 0;
      if (led[k] !== t) { led[k] = t; push('ledger'); }
    }
  }
  // 武将档案（原作段4 +0x0B9 STATUS / +0x0C3 WEAPON / +0x0C1 HORSE / +0x0C5 THING）
  strMapAt('generalStatus');
  strMapAt('weapon');
  strMapAt('horse');
  strMapAt('thing');
  if (!obj(s.drift)) {
    const had = 'drift' in s;
    s.drift = null;
    if (!had) push('drift');
  }
  return added;
}

// ---------------------------------------------------------------------------
// localStorage 包装（隐私模式下 setItem 会抛，全部吞掉）
// ---------------------------------------------------------------------------

function pickStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function targetStorage(storage) {
  return storage === undefined ? pickStorage() : storage;
}

function readRaw(storage, key) {
  const s = targetStorage(storage);
  if (!s || typeof s.getItem !== 'function') return null;
  try { return s.getItem(key); } catch { return null; }
}

function writeRaw(storage, key, value) {
  const s = targetStorage(storage);
  if (!s || typeof s.setItem !== 'function') return false;
  try {
    if (value === null || value === undefined) s.removeItem?.(key);
    else s.setItem(key, value);
    return true;
  } catch { return false; }
}

// ---------------------------------------------------------------------------
// 存档容器
// ---------------------------------------------------------------------------

/** 10 个空槽；`last = 1` = 自动存档默认写槽 1（见 `lastUsed`） */
export function emptyStore() {
  return {
    v: STORE_VERSION,
    last: 1,
    slots: Array.from({ length: SLOT_COUNT }, () => null),
    // R86 S2-4：本次读档**真的做过版本跳**的槽（`{slot,from,to}`，slot 是 1 基）。
    // 瞬时字段：`saveStore()` 写盘前会删掉；`loadStore() → normalizeStore()` 每次重算。
    upgraded: [],
  };
}

/**
 * 把任意输入修成一个可用的容器：
 *   · 非对象 / 数组 / 缺 slots → 10 个空槽
 *   · slots 多于 10 条 → 截断；少于 → 补 null
 *   · 槽条目必须是"对象且 snapshot 是对象"，否则按空处理
 *   · 顶层未知键原样保留（方便以后加字段而不用改这里）
 *   · R70：条目里的 snapshot 若是老档（没有 `v`）就地升级，并重算 monarch/城数等摘要；
 *     已经是 v2 且摘要齐全的条目**不做深拷贝**（saveStore 每次都 normalize，别白拷 10 份）
 */
export function normalizeStore(raw) {
  const out = emptyStore();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (!(key in out)) out[key] = raw[key];
  }
  const list = Array.isArray(raw.slots) ? raw.slots : [];
  // R86 S2-4：记下"这一步真的发生了版本跳"的槽。`up.changed` 不够 —— 它也会在
  // 摘要缺失/字段被修整时为 true（同一个 v 版本内的清洗），提示文案不能拿它当依据。
  const upgraded = [];
  for (let i = 0; i < SLOT_COUNT; i++) {
    const entry = list[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const snap = entry.snapshot;
    if (!snap || typeof snap !== 'object' || Array.isArray(snap)) continue;
    const up = upgradeSnapshot(snap);
    if (!up.snapshot) continue;
    if (up.from >= 0 && up.from < up.to) upgraded.push({ slot: i + 1, from: up.from, to: up.to });
    const hasMeta = typeof entry.monarch === 'string'
      && Number.isFinite(Number(entry.cityCount))
      && Number.isFinite(Number(entry.forceCount))
      && Number.isFinite(Number(entry.generalCount))
      && Number.isFinite(Number(entry.cityOfficers))
      && Number.isFinite(Number(entry.statusCount))
      && Number.isFinite(Number(entry.equipCount));
    if (!up.changed && hasMeta) {
      out.slots[i] = { ...entry };   // 槽条目里的未知键（如备注）也不丢
      continue;
    }
    const meta = metaFromSnapshot(up.snapshot, i, {
      ts: num(entry.ts) || undefined,
      slotName: typeof entry.slotName === 'string' ? entry.slotName : '',
    });
    out.slots[i] = { ...entry, ...meta };
  }
  out.last = intOr(raw.last, 1, 1, SLOT_COUNT);
  out.upgraded = upgraded;
  return out;
}

/** 读容器；缺键 / 坏 JSON / 版本不符都退回 10 空槽 */
export function loadStore(storage) {
  const raw = readRaw(storage, SAVE_KEY);
  if (!raw) return emptyStore();
  try { return normalizeStore(JSON.parse(raw)); } catch { return emptyStore(); }
}

/** 写容器（先 normalize，避免把坏条目写回磁盘） */
export function saveStore(store, storage) {
  const norm = normalizeStore(store);
  // `upgraded` 是本次读档的瞬时诊断（R86 S2-4），不属于磁盘格式：写盘前摘掉，
  // 否则下次 loadStore 会从一个"已经升级过"的容器里读到旧记录（提示会重复弹）。
  const disk = { ...norm };
  delete disk.upgraded;
  let json;
  try { json = JSON.stringify(disk); } catch { return false; }
  return writeRaw(storage, SAVE_KEY, json);
}

/** 是否有任何非空槽 */
export function hasAny(store) {
  if (!store || !Array.isArray(store.slots)) return false;
  return store.slots.some((e) => e && typeof e === 'object' && e.snapshot && typeof e.snapshot === 'object');
}

/**
 * "自动存档目标槽"（0 基）；默认 0 = 槽 1。
 * **只由 `writeSlotAuto()` 更新**，手动存档（`writeSlot`）不参与 —— 否则自动存档会
 * 跟着手动存档跑，覆盖玩家刚存的槽（见 `writeSlot` 注释）。
 */
export function lastUsed(store) {
  return intOr(store?.last, 1, 1, SLOT_COUNT) - 1;
}

/** 取 snapshot 最新的非空槽（0 基）；没有则 -1 */
export function newestSlot(store) {
  if (!store || !Array.isArray(store.slots)) return -1;
  let best = -1;
  let bestTs = -Infinity;
  for (let i = 0; i < SLOT_COUNT; i++) {
    const e = store.slots[i];
    if (!e || !e.snapshot || typeof e.snapshot !== 'object') continue;
    const t = num(e.ts);
    if (t > bestTs) { bestTs = t; best = i; }
  }
  return best;
}

/** 取槽条目（不做拷贝）；越界/空槽 → null */
export function slotAt(store, index) {
  const i = slotIndex(index);
  if (i < 0 || !store || !Array.isArray(store.slots)) return null;
  const e = store.slots[i];
  return e && typeof e === 'object' && !Array.isArray(e) ? e : null;
}

// ---------------------------------------------------------------------------
// 槽条目 <-> snapshot
// ---------------------------------------------------------------------------

/**
 * 势力总览（槽摘要/UI 用）：`{ total, alive, aliveIds, extinct, player }`。
 * `forces[id].alive === false` 记入 `extinct`（灭亡条目不删，见 normalizeCampaign 注释）。
 */
export function forcesSummary(snapshot) {
  const forces = snapshot && typeof snapshot.forces === 'object' && !Array.isArray(snapshot.forces)
    ? snapshot.forces : {};
  const aliveIds = [];
  const extinct = [];
  for (const [id, f] of Object.entries(forces)) {
    if (!id || !f || typeof f !== 'object') continue;
    if (f.alive === false) extinct.push(id);
    else aliveIds.push(id);
  }
  return {
    total: aliveIds.length + extinct.length,
    alive: aliveIds.length,
    aliveIds,
    extinct,
    player: typeof snapshot?.force === 'string' ? snapshot.force : '',
  };
}

/**
 * 武将等级/经验总览（400 将）：`{ total, leveled, maxLevel }`。
 * 权威字段是 `generalLevel[名]` / `generalExp[名]`（对应原作段4 的 +0x04E 等级 / +0x04A BASEEXP），
 * 两边任一侧有名字就算「有记录」。
 */
export function generalsSummary(snapshot) {
  const lv = snapshot && typeof snapshot.generalLevel === 'object' && !Array.isArray(snapshot.generalLevel)
    ? snapshot.generalLevel : {};
  const exp = snapshot && typeof snapshot.generalExp === 'object' && !Array.isArray(snapshot.generalExp)
    ? snapshot.generalExp : {};
  const names = new Set([...Object.keys(lv), ...Object.keys(exp)]);
  let maxLevel = 0;
  for (const v of Object.values(lv)) {
    const n = Number(v);
    if (Number.isFinite(n)) maxLevel = Math.max(maxLevel, Math.trunc(n));
  }
  return { total: names.size, leveled: Object.keys(lv).length, maxLevel };
}

/**
 * 武将状态 token —— 对齐原作段4 +0x0B9 `STATUS`（07b：8=在野 / 1=登用 / 2=俘虜）。
 *
 * 原作只有这 3 个值；本档另有两个**运行时**才出现的：`未`（未登场 = 数据表默认）
 * 与 `亡`（阵亡）。`[新设计]`：原作里势力灭亡的武将记录会消失，没有可恢复的"阵亡"位。
 * 注意 `Spirit`（气力/士气）不走这里，见 `morale`（士气 0..100）。
 */
export const GENERAL_STATUS = Object.freeze({
  PENDING: '未',   // 未登场（generals.json 默认值，通常不写进存档）
  ACTIVE: '登',    // 在城 / 登用（原作 1）
  CAPTIVE: '俘',   // 被俘（原作 2）
  WILD: '野',      // 在野（原作 8）
  DEAD: '亡',      // 阵亡 [新设计]
});

/** token → 原作 `STATUS` 数值；`未`/`亡` 是 `[新设计]` 的扩展位（原作没有对应数） */
export const GENERAL_STATUS_CODE = Object.freeze({ 未: 0, 登: 1, 俘: 2, 野: 8, 亡: 9 });

function strMapOf(snapshot, key) {
  return snapshot && typeof snapshot === 'object'
    && snapshot[key] && typeof snapshot[key] === 'object' && !Array.isArray(snapshot[key])
    ? snapshot[key] : {};
}

/**
 * 取武将状态 token：显式 `generalStatus[名]` 优先，缺省退化到 `fate[名]`
 * （R78 残将归宿：'wild' → 在野；'surrender' → 投了他主 ≈ 登用 `[推测]`）。
 * 都没有 → `''`（未知；调用方别把"未知"当"在野"用）。
 */
export function statusOf(snapshot, name) {
  const n = typeof name === 'string' ? name : '';
  if (!n) return '';
  const t = strMapOf(snapshot, 'generalStatus')[n];
  if (typeof t === 'string' && t) return t;
  const fate = strMapOf(snapshot, 'fate')[n];
  const f = fate && typeof fate === 'object' ? fate.fate : fate;
  if (f === 'wild') return GENERAL_STATUS.WILD;
  if (f === 'surrender') return GENERAL_STATUS.ACTIVE;
  return '';
}

/** 取装备三件套 `{weapon, horse, thing}`（没记录 = `''`；值是物品名，不是序号） */
export function equipOf(snapshot, name) {
  const n = typeof name === 'string' ? name : '';
  const pick = (key) => {
    const v = strMapOf(snapshot, key)[n];
    return typeof v === 'string' ? v : '';
  };
  return { weapon: pick('weapon'), horse: pick('horse'), thing: pick('thing') };
}

/** 写武将状态（`''`/未知 token = 删掉该武将的记录）；返回写入后的 token */
export function setGeneralStatus(snapshot, name, status) {
  const n = typeof name === 'string' ? name.trim() : '';
  const t = typeof status === 'string' ? status.trim() : '';
  if (!snapshot || typeof snapshot !== 'object' || !n) return '';
  if (!snapshot.generalStatus || typeof snapshot.generalStatus !== 'object') snapshot.generalStatus = {};
  if (!t) { delete snapshot.generalStatus[n]; return ''; }
  snapshot.generalStatus[n] = t;
  return t;
}

/**
 * 写装备（`patch = {weapon?, horse?, thing?}`；值 `''`/null = 卸下）。
 * 返回写后的三件套。名字口径同 `generals.json` 的 Weapon/Horse/Thing。
 */
export function setEquip(snapshot, name, patch) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!snapshot || typeof snapshot !== 'object' || !n) return { weapon: '', horse: '', thing: '' };
  for (const key of ['weapon', 'horse', 'thing']) {
    if (!patch || !(key in patch)) continue;
    const v = typeof patch[key] === 'string' ? patch[key].trim() : '';
    if (!snapshot[key] || typeof snapshot[key] !== 'object') snapshot[key] = {};
    if (!v) delete snapshot[key][n];
    else snapshot[key][n] = v;
  }
  return equipOf(snapshot, name);
}

// ---------------------------------------------------------------------------
// R86 · S2-2 装备进快照（四槽 = 原作 WEAPON / HORSE / THING + items.html 的 amulet）
// ---------------------------------------------------------------------------

/**
 * 四槽装备的**规范来源**：v3 的可选顶层字段 `equip = { 將名: {weapon,horse,book,amulet} }`，
 * 值是物品**名**（不是 items.json 的 `Sequence`；`ensureSnapshotShape` 的 strMapAt 也只收字符串）。
 *
 * 为什么是"v3 结构里的可选字段"，而不是往 `SNAPSHOT_REQUIRED` 加键、也不是加一条 v3→v4：
 *   · `snapshotIsCurrent()`（:229）要求 `v === 3` **且** REQUIRED 全在。往 REQUIRED 里添一个键，
 *     所有现存 v3 槽会在下次 `loadStore()` 时立刻被判成"要升级"：10 个槽全部重算摘要、
 *     重写磁盘，还会弹一句 `v3 → v3` 的无意义提示 —— 而结构上并没有任何东西要补。
 *   · `upgradeSnapshot` / `ensureSnapshotShape` / `deepClone` 都不动未知键，
 *     `prepareSnapshot` 与 `metaFromSnapshot` 走的是深拷贝，所以可选字段天然跟着快照往返，
 *     一条迁移跳都不需要（`SNAPSHOT_STEPS` 保持 0→2 / 2→3 两条）。
 * 原三槽 `weapon/horse/thing` 保留为**镜像**：items.html 的 `book` 槽在原作就是 THING
 * （items.json 里 `JEWEL_THING`），故 book→thing；amulet（`JEWEL_MISC` + Loyal 那几件）
 * 原作没有对应段位，只存在 `equip` 里。`equipOf()` 继续读这 3 张旧表，老契约不变。
 */
export const EQUIP_SLOTS = Object.freeze(['weapon', 'horse', 'book', 'amulet']);

/** 四槽 → 三个镜像键（book 落到原作的 thing） */
const EQUIP_MIRROR = Object.freeze({ weapon: 'weapon', horse: 'horse', book: 'thing' });

function equipFieldOf(snapshot) {
  const v = snapshot && typeof snapshot === 'object' ? snapshot.equip : null;
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function equipRowOf(snapshot, name) {
  const row = equipFieldOf(snapshot)[name];
  return row && typeof row === 'object' && !Array.isArray(row) ? row : {};
}

/**
 * 取四槽装备 `{weapon, horse, book, amulet}`（没记录 = `''`）。
 * `equip` 是规范来源；缺的槽回落到 `equipOf()` 的镜像（老存档里只有 weapon/horse/thing）。
 */
export function equipSlotsOf(snapshot, name) {
  const n = typeof name === 'string' ? name : '';
  const row = n ? equipRowOf(snapshot, n) : {};
  const old = equipOf(snapshot, n);
  const pick = (slot) => {
    const v = typeof row[slot] === 'string' ? row[slot].trim() : '';
    return v || '';
  };
  return {
    weapon: pick('weapon') || old.weapon || '',
    horse: pick('horse') || old.horse || '',
    book: pick('book') || old.thing || '',
    amulet: pick('amulet') || '',
  };
}

/**
 * 写四槽装备：`patch = {weapon?,horse?,book?,amulet?}`，`''`/null = 卸下。
 * 同时维护 `weapon/horse/thing` 镜像，返回写后的四槽（`equipSlotsOf` 口径）。
 * 整行都空时把该武将的 `equip` 条目删掉，避免 `equipCount` 把"空装备"算成一个。
 */
export function setEquipSlots(snapshot, name, patch) {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!snapshot || typeof snapshot !== 'object' || !n) return { weapon: '', horse: '', book: '', amulet: '' };
  if (!snapshot.equip || typeof snapshot.equip !== 'object' || Array.isArray(snapshot.equip)) snapshot.equip = {};
  const row = { ...equipRowOf(snapshot, n) };
  for (const slot of EQUIP_SLOTS) {
    if (!patch || !(slot in patch)) continue;
    const v = typeof patch[slot] === 'string' ? patch[slot].trim() : '';
    if (!v) delete row[slot];
    else row[slot] = v;
  }
  if (Object.keys(row).length) snapshot.equip[n] = row;
  else delete snapshot.equip[n];
  // 镜像：equipOf()/老存档口径仍可读到三件套
  for (const [slot, key] of Object.entries(EQUIP_MIRROR)) {
    const v = typeof row[slot] === 'string' ? row[slot] : '';
    if (!snapshot[key] || typeof snapshot[key] !== 'object' || Array.isArray(snapshot[key])) snapshot[key] = {};
    if (!v) delete snapshot[key][n];
    else snapshot[key][n] = v;
  }
  return equipSlotsOf(snapshot, n);
}

/* ---------------------------------------------------------------- 出阵队列（R94）
 * `deployQueue` 是 v3 的**可选**字段：`[{general, troop, troops}, ...]`，最多 5 槽，顺序即出阵序。
 * 每队 5 个武将槽来自原作 Obj3 部队池（docs/07b §6，+0x010..+0x020 五个 u32 武将下标）；
 * 军师技 seq 3「後選出陣」放开的正是开战前重排（project/109 §5.3、project/162）。
 *
 * 为什么可选字段而不进 SNAPSHOT_REQUIRED、也不升 v4：理由与 equip 相同（见上方）。补进 REQUIRED
 * 会让所有现存 v3 槽立刻被判「要升级」，十槽重算摘要、重写磁盘、弹一个没意义的 v3 → v3；
 * 而 upgradeSnapshot/ensureSnapshotShape/deepClone 都不动未知键，prepareSnapshot 走同一对象，
 * 所以可选字段天然往返、零迁移跳。缺字段时由 deployQueueOf(snapshot, fallback) 按调用方给的
 * 「当前出战 5 将」即时生成，旧档照读。
 * 归一化/移动/换兵种的真口径在 `game/src/core/deploy_queue.ts`（cocos 也用同一份）；这里只留
 * 存档层最小的一套，供没有 dist 的页面（saves 自己的调用方）读写槽。
 */
export const DEPLOY_SLOTS = 5;
const DEPLOY_DEFAULT_TROOP = '刀';
const DEPLOY_DEFAULT_TROOPS = 100;

/** 单个槽归一化：字符串=只有武将名；对象缺 troop/troops 时补默认并夹 1..100；无名返回 null。 */
function deploySlotOf(raw) {
  if (typeof raw === 'string') {
    const general = raw.trim();
    return general ? { general, troop: DEPLOY_DEFAULT_TROOP, troops: DEPLOY_DEFAULT_TROOPS } : null;
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const general = typeof raw.general === 'string' ? raw.general.trim() : '';
  if (!general) return null;
  const troop = typeof raw.troop === 'string' && raw.troop.trim() ? raw.troop.trim() : DEPLOY_DEFAULT_TROOP;
  const troops = intOr(raw.troops, DEPLOY_DEFAULT_TROOPS, 1, 100);
  return { general, troop, troops };
}

/** 归一化整个队列：坏槽丢掉、同名只留第一个、最多 5 槽（顺序不变）。 */
export function normalizeDeployQueue(raw) {
  const out = [];
  const seen = new Set();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    const slot = deploySlotOf(item);
    if (!slot || seen.has(slot.general)) continue;
    seen.add(slot.general);
    out.push(slot);
    if (out.length >= DEPLOY_SLOTS) break;
  }
  return out;
}

/**
 * 读队列：`snapshot.deployQueue` 优先；缺字段/整行坏掉时按 `fallback`（当前出战 5 将的名字）
 * 即时生成，**不写档**——旧档读一次不会因为「只是打开看了一眼」被改成新结构。
 */
export function deployQueueOf(snapshot, fallback = []) {
  const s = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const own = normalizeDeployQueue(s.deployQueue);
  if (own.length) return own;
  return normalizeDeployQueue(fallback);
}

/** 写队列（自动归一化）；空队列 = 删掉字段，不写空数组占位。返回写入后的值。 */
export function setDeployQueue(snapshot, queue) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return [];
  const q = normalizeDeployQueue(queue);
  if (q.length) snapshot.deployQueue = q;
  else delete snapshot.deployQueue;
  return q;
}

/** 存档里到底有没有玩家存过的队列（≠ deployQueueOf 的即时生成）。 */
export function hasDeployQueue(snapshot) {
  return !!(snapshot && typeof snapshot === 'object' && Array.isArray(snapshot.deployQueue)
    && snapshot.deployQueue.length > 0);
}

/* ---------------------------------------------------------------- 武将战绩（R196）
 * `generalRecord` 是 v3 的**可选**字段：`{ 武将名: { w: 勝場數, l: 敗場數 } }`，两个数都是 0..9999 的整数。
 *
 * 为什么按将存：原作这两个数就是 General 记录里的持久化短整型——
 *   · 累加函数 `0x4084C9`：kind==1 → `mov cx,[g+0x9F]; add cx,1; mov [g+0x9F],cx`（0x4084D5/DC/E3），
 *     kind==-1 → `[g+0xA1]++`（0x408539/40/47）；
 *   · 写档 `0x431A7A mov dx,[gen+0x9F]` → `0x431A81 mov word ptr [ecx+eax+0xC7],dx`（段4，stride 0x11F），
 *     `0x431A9B/A2` 把 +0xA1 写进 +0xC9；读档 `0x43348B/93`、`0x4334AC/B4` 原样读回；
 *   · 招降面板 `0x44F3BE movsx eax,[+0x9F]` / `0x44F3FE movsx ecx,[+0xA1]`
 *     → 格式串 `0x491E9C "勝場數   %d"` / `0x491EA8 "敗場數   %d"`。
 * 文档：docs/04b_战斗系统.md:68（+0x9F/+0xA1 勝/敗）、docs/00_项目总览与文档索引.md:168、
 * docs/07b_存档字段详解.md:325-326（+0x0C7/+0x0C9 ← +0x9F/+0xA1）。考证全文见 project/196。
 *
 * 为什么可选字段而不进 SNAPSHOT_REQUIRED、也不升 v4：理由与 deployQueue 相同（见上）。补进 REQUIRED
 * 会让所有现存 v3 档立刻被判「要升级」，十槽重算摘要；而 upgradeSnapshot/ensureSnapshotShape/deepClone
 * 都不动未知键，所以可选字段天然往返、零迁移跳。缺字段时 `generalRecordOf()` 返回 **null**（= 没有记录，
 * 招降面板显示「—」），旧档照读、打开看一眼不会写档。
 */
export const GENERAL_RECORD_MAX = 9999;   // 原作 +0x9F/+0xA1 是 word（u16），这里沿用同一上限

/** 单将战绩归一化：坏类型返回 null；w/l 取整夹 0..9999（缺一个按 0 算）。 */
function generalRowOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return {
    w: intOr(raw.w, 0, 0, GENERAL_RECORD_MAX),
    l: intOr(raw.l, 0, 0, GENERAL_RECORD_MAX),
  };
}

/** 归一化整张战绩表：坏行丢掉、名字 trim 后为空丢掉；同名后者覆盖前者（对象天然去重）。 */
export function normalizeGeneralRecord(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [name, value] of Object.entries(raw)) {
    const key = typeof name === 'string' ? name.trim() : '';
    const row = generalRowOf(value);
    if (!key || !row) continue;
    out[key] = row;
  }
  return out;
}

/** 读某将战绩：**没有记录返回 null**（≠ 0 勝 0 敗）。 */
export function generalRecordOf(snapshot, name) {
  const key = typeof name === 'string' ? name.trim() : '';
  if (!key) return null;
  const all = normalizeGeneralRecord(snapshot && snapshot.generalRecord);
  return Object.prototype.hasOwnProperty.call(all, key) ? { w: all[key].w, l: all[key].l } : null;
}

/** 存档里到底有没有这个将的战绩（不是即时生成——这里没有生成）。 */
export function hasGeneralRecord(snapshot, name) {
  return generalRecordOf(snapshot, name) !== null;
}

/**
 * 记一场战绩：`won === true` → 勝 +1；`won === false` → 敗 +1。只动 `generalRecord` 这一个可选字段
 * （不碰 wins/losses/streak 等既有键的语义），夹 0..9999。返回写入后的 `{ w, l }`；
 * snapshot/名字坏、或 `won` 不是布尔 → null 且**不写档**（不猜结果）。
 */
export function noteGeneralResult(snapshot, name, won) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  if (typeof won !== 'boolean') return null;
  const key = typeof name === 'string' ? name.trim() : '';
  if (!key) return null;
  const all = normalizeGeneralRecord(snapshot.generalRecord);
  const cur = Object.prototype.hasOwnProperty.call(all, key) ? all[key] : { w: 0, l: 0 };
  const next = won
    ? { w: Math.min(GENERAL_RECORD_MAX, cur.w + 1), l: cur.l }
    : { w: cur.w, l: Math.min(GENERAL_RECORD_MAX, cur.l + 1) };
  all[key] = next;
  snapshot.generalRecord = all;
  return { w: next.w, l: next.l };
}

/** 由 snapshot 生成槽元数据：
 *   id / name / slotName / time / ts / scenario / scenarioName / month / gold /
 *   ownedCount / wins / losses / snapshot
 *   —— R70 新增摘要：monarch（君主）/ forceCount（存活势力）/ extinctCount（已灭亡）/
 *   cityCount（城摘要条数）/ generalCount（有等级或经验记录的武将数）
 *
 * `time` 是游戏内时间（"第X年Y月"），`ts` 是真实写入时间；截图里的"时间"列用 ts。
 * `opts.slotName` 是玩家自定义槽名（`renameSlot`）；没设时 `name` 退回「槽 N」。
 */
export function metaFromSnapshot(snapshot, index, opts = {}) {
  const i = slotIndex(index);
  const up = upgradeSnapshot(snapshot);
  const safe = up.snapshot || {};
  const month = intOr(safe.month, 1, 1);
  const n = i >= 0 ? i + 1 : intOr(index, 0, 0) + 1;
  const slotName = typeof opts.slotName === 'string' ? opts.slotName.trim().slice(0, 20) : '';
  const forces = forcesSummary(safe);
  const generals = generalsSummary(safe);
  // v3 摘要：在城武将总数 / 状态记录数 / 有装备记录的武将数（列表页不必翻 snapshot）
  const citiesObj = safe.cities && typeof safe.cities === 'object' ? safe.cities : {};
  let cityOfficers = 0;
  for (const st of Object.values(citiesObj)) {
    if (st && typeof st === 'object') cityOfficers += intOr(st.officers, 0, 0);
  }
  const statusCount = Object.keys(safe.generalStatus && typeof safe.generalStatus === 'object'
    ? safe.generalStatus : {}).length;
  const equipped = new Set();
  for (const key of ['weapon', 'horse', 'thing']) {
    const map = safe[key] && typeof safe[key] === 'object' ? safe[key] : {};
    for (const name of Object.keys(map)) equipped.add(name);
  }
  // R86 S2-2：只有 amulet 的武将也计入（`equip` 是四槽规范来源，镜像里没有 amulet）
  for (const name of Object.keys(equipFieldOf(safe))) equipped.add(name);
  const monarch = typeof safe.monarch === 'string' && safe.monarch
    ? safe.monarch
    : (typeof safe.king === 'string' ? safe.king : '');
  return {
    id: n,
    name: slotName || (typeof opts.name === 'string' && opts.name ? opts.name : `槽 ${n}`),
    slotName,
    time: monthLabel(month),
    ts: Number.isFinite(opts.ts) ? opts.ts : Date.now(),
    scenario: intOr(safe.scenario, 1, 1),
    scenarioName: typeof opts.scenarioName === 'string' ? opts.scenarioName : '',
    month,
    gold: num(safe.gold),
    ownedCount: Array.isArray(safe.owned) ? safe.owned.length : 0,
    wins: intOr(safe.wins, 0),
    losses: intOr(safe.losses, 0),
    // R70 槽位摘要
    monarch,
    forceCount: forces.alive,
    extinctCount: forces.extinct.length,
    cityCount: Object.keys(safe.cities && typeof safe.cities === 'object' ? safe.cities : {}).length,
    generalCount: generals.total,
    year: yearOf(month),
    // [F5] 公元鏡像：以「這一格存檔自己的起始年」換算，不看 current 的 era 錨點，
    // 否則同一個槽位列表裡，189 年開的檔會跟著別的劇本一起漂。
    adYear: startYearOf(safe) + yearOf(month) - 1,
    cityOfficers,
    statusCount,
    equipCount: equipped.size,
    snapshot: deepClone(safe),
  };
}

/**
 * 把 snapshot 写进槽（深拷贝）。
 *
 * **默认不动 `store.last`。** `last` 的语义是"自动存档目标槽"，只由 `writeSlotAuto()`
 * 维护。手动存档若改它，下一次自动存档就会盖掉玩家刚存的那一槽
 * （project/89 步骤 4b：存到槽 2 → 打一仗 → 槽 2 变成自动档、手动档没了）。
 * 需要改 `last` 的调用方显式传 `{ touchLast: true }`，或直接走 `writeSlotAuto()`。
 *
 * 越界槽号 / 非对象 snapshot / 坏容器 → null（不抛）。
 *
 * **同一局可以佔多個槽**（原作就是這樣）：`A_save_t0035.png` 的 `記錄07`＝金旋 城數01
 * 武將002 **時間211年**、`記錄08`＝金旋 城數01 武將001 **時間210年** —— 同一個君主、
 * 同一局，存了兩格。所以這裡**不做任何「同劇本/同月只留一槽」的去重**，
 * `normalizeStore()` 也不去重；存哪一格是玩家自己選的（`tests/era_save.test.ts` 有斷言）。
 */
export function writeSlot(store, index, snapshot, opts = {}) {
  const i = slotIndex(index);
  if (i < 0) return null;
  if (!store || !Array.isArray(store.slots)) return null;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null;
  const { touchLast = false, ...metaOpts } = opts || {};
  let entry;
  try { entry = metaFromSnapshot(snapshot, i, metaOpts); } catch { return null; }
  store.slots[i] = entry;
  if (touchLast) store.last = i + 1;
  return entry;
}

/**
 * 自动存档专用：写槽 + 把 `store.last` 指到这个槽（= 下次进游戏默认读的那一槽）。
 * 手动存档请用 `writeSlot()`，不要用这个。
 */
export function writeSlotAuto(store, index, snapshot, opts = {}) {
  return writeSlot(store, index, snapshot, { ...(opts || {}), touchLast: true });
}

/** 读槽里的完整 snapshot（深拷贝）；空槽/越界/坏数据 → null */
export function getSnapshot(store, index) {
  const entry = slotAt(store, index);
  if (!entry) return null;
  const snap = entry.snapshot;
  if (!snap || typeof snap !== 'object' || Array.isArray(snap)) return null;
  return deepClone(snap);
}

/** 清空一个槽；返回"原来是否有东西"。越界不抛，返回 false
 *
 * **原作沒有「刪除」入口**：`A_save_t0035.png` / `A_load_t0192.png` 的 10 行只有
 * 選中 → 底部「確定/取消」，沒有刪檔鈕，也沒有自動存檔槽。所以本函式只當**內部純函式**
 * 保留（測試/新遊戲重置會用），不要在存檔/讀檔對話框上開刪除入口；
 * `campaign.html` 若要照原作收掉那顆「刪」鈕，看 `SLOT_DELETE_UI`（= false）。
 */
export function clearSlot(store, index) {
  const i = slotIndex(index);
  if (i < 0 || !store || !Array.isArray(store.slots)) return false;
  const had = Boolean(store.slots[i]);
  store.slots[i] = null;
  return had;
}

/**
 * R70 槽位命名：给非空槽起一个人看得懂的名字（最多 20 字，空串＝退回「槽 N」）。
 * 只改条目元数据，不动 snapshot。返回条目；空槽/越界 → null。
 */
export function renameSlot(store, index, name) {
  const i = slotIndex(index);
  if (i < 0 || !store || !Array.isArray(store.slots)) return null;
  const entry = store.slots[i];
  if (!entry || typeof entry !== 'object') return null;
  const slotName = typeof name === 'string' ? name.trim().slice(0, 20) : '';
  entry.slotName = slotName;
  entry.name = slotName || `槽 ${i + 1}`;
  return entry;
}

// ---------------------------------------------------------------------------
// 旧档（sanguo_campaign_v1）
// ---------------------------------------------------------------------------

/** 读旧版单档；坏 JSON / 非对象 → null */
export function readLegacy(storage) {
  const raw = readRaw(storage, LEGACY_KEY);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch { return null; }
}

/** 把当前进度镜像到旧键（main.js 只认这个键） */
export function writeLegacy(snapshot, storage) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return false;
  let json;
  try { json = JSON.stringify(snapshot); } catch { return false; }
  return writeRaw(storage, LEGACY_KEY, json);
}

/** 删除旧键（删光所有槽后调用，避免下次启动又被"迁移"回来） */
export function clearLegacy(storage) {
  return writeRaw(storage, LEGACY_KEY, null);
}

/**
 * 旧档 → 槽 1 的迁移。
 *   · `sanguo_saves_v1` 里已有任何存档 → 不迁移（返回 migrated:false, reason:'has-slots'）
 *   · 没有旧档或旧档不是对象 → 不迁移
 *   · 否则整份旧档写进槽 1（深拷贝），返回迁移结果供 UI 提示一次
 *
 * opts: { storage, now, scenarioNameOf(id) }
 */
export function migrateLegacy(opts = {}) {
  const storage = opts.storage;
  const store = loadStore(storage);
  if (hasAny(store)) {
    return { migrated: false, reason: 'has-slots', store, snapshot: null, entry: null, index: -1 };
  }
  const legacy = readLegacy(storage);
  if (!legacy) {
    return { migrated: false, reason: 'no-legacy', store, snapshot: null, entry: null, index: -1 };
  }
  const now = Number.isFinite(opts.now) ? opts.now : Date.now();
  let scenarioName = '';
  try {
    if (typeof opts.scenarioNameOf === 'function') scenarioName = opts.scenarioNameOf(legacy.scenario) || '';
  } catch { scenarioName = ''; }
  // 迁移出来的就是玩家唯一的那份档 → 它理所当然该是自动存档目标（writeSlotAuto）
  const entry = writeSlotAuto(store, 0, legacy, { ts: now, scenarioName });
  if (!entry) {
    return { migrated: false, reason: 'write-failed', store, snapshot: null, entry: null, index: -1 };
  }
  saveStore(store, storage);
  return { migrated: true, reason: 'ok', store, snapshot: deepClone(legacy), entry, index: 0 };
}

// ---------------------------------------------------------------------------
// 新游戏：初始三城 / 城市运行态
// ---------------------------------------------------------------------------

/** 与 campaign.html §15 同一口径：兵 = min(pop/2500 + 110, 600) */
export function cityTroops(city) {
  return Math.min(Math.floor(num(city?.POPULATION) / 2500) + 110, 600);
}

/** 单城运行态（兵/民/金），首次见到某城时用它初始化 */
export function cityState(city) {
  return {
    troops: cityTroops(city),
    pop: num(city?.POPULATION),
    money: num(city?.MONEY),
  };
}

/**
 * 预备兵上限 = `min(人口/2500 + 110, 600)`（原作 city+0x086，与 `city_model.prepCapOf` 同式）。
 * 注意它和 `cityTroops()` 数值相同但语义不同：一个是一次能带出去的兵，一个是城里能攒的预备兵。
 */
export function prepCapOf(pop) {
  return Math.min(Math.floor(num(pop) / 2500) + 110, 600);
}

/**
 * R70 60 城摘要（存档 `save.cities[城]`）—— 字段对齐 docs/07b 段2「城池」记录：
 *
 * | 本档字段  | 原作偏移 | 含义 |
 * |-----------|----------|------|
 * | owner     | +0x014   | 所属君主 Idx（'' = 空城/无主） |
 * | major     | +0x018   | 太守（`save.appointed` 优先，见 city_model.majorOf） |
 * | wise      | +0x01C   | 军师（同上，city_model.wiseOf） |
 * | roster    | +0x028   | 城内武将链（本作=城内有名册的武将名数组） |
 * | troops    | +0x034   | 城内总兵数 |
 * | rate      | +0x070   | Rate 1..5（剧本 RATE） |
 * | prepCap   | +0x086   | 预备兵上限 |
 * | prep      | +0x08A   | 现有预备兵 |
 * | pop       | +0x08E   | 人口 |
 * | def       | +0x092   | 防御力 |
 * | money     | +0x096   | 金钱 |
 * | seq       | +0x09A   | 永久自索引（剧本 _index） |
 * | flags     | +0x0A2   | FLAGS（1 = 关卡） |
 * | officers  | （无）    | 在城武将数 = `roster.length`；原作只存链头 +0x028 `[新设计]` |
 * | flag      | （无）    | 势力旗号（`forces[owner].flag`，由 fillCitySummaries 派生）`[新设计]` |
 *
 * `cav`/`inf` 是本作城级步/骑拆分（`inf + cav = troops`，见 city_model），原作城池记录
 * 里**没有**这两个字段（骑兵/步兵是武将 +0x42..+0x48 的编成）→ 标 `[新设计]`。
 * 传入的 `st` 里未知键（morale/cityMorale 等）原样保留。
 */
export function citySummaryOf(cityDef, st, info = {}) {
  const cd = cityDef && typeof cityDef === 'object' ? cityDef : {};
  const state = st && typeof st === 'object' && !Array.isArray(st) ? st : {};
  const meta = info && typeof info === 'object' ? info : {};

  const pop = Number.isFinite(Number(state.pop))
    ? Math.max(0, Math.trunc(num(state.pop)))
    : Math.max(0, Math.trunc(num(cd.POPULATION)));
  const troops = Number.isFinite(Number(state.troops))
    ? Math.max(0, Math.trunc(num(state.troops)))
    : cityTroops(cd);
  const cap = prepCapOf(pop);
  const cav = Math.min(troops, Math.max(0, Number.isFinite(Number(state.cav)) ? Math.trunc(num(state.cav)) : 0));
  const prep = Number.isFinite(Number(state.prep))
    ? Math.min(cap, Math.max(0, Math.trunc(num(state.prep))))
    : cap;

  const owner = typeof meta.owner === 'string' ? meta.owner
    : typeof state.owner === 'string' ? state.owner
      : typeof cd.KING === 'string' ? cd.KING : '';
  const major = typeof meta.major === 'string' && meta.major
    ? meta.major : (typeof cd.MAJOR === 'string' ? cd.MAJOR : '');
  const wise = typeof meta.wise === 'string' && meta.wise
    ? meta.wise : (typeof cd.WISE === 'string' ? cd.WISE : '');
  const roster = (Array.isArray(meta.roster) ? meta.roster : [])
    .filter((n) => typeof n === 'string' && n);
  // 在城武将数：原作只有链头 +0x028，数目 = 链长 → 我们直接存数组长度
  const officers = roster.length;
  // 旗号：原作城记录里没有，玩家势力旗在 King 段；这里由 fillCitySummaries 从 forces[owner] 派生
  const flag = Number.isFinite(Number(meta.flag)) ? Math.trunc(Number(meta.flag))
    : Number.isFinite(Number(state.flag)) ? Math.trunc(Number(state.flag))
      : 0;

  return {
    ...state,
    owner,
    major,
    wise,
    roster,
    officers,
    flag,
    troops,
    pop,
    money: Number.isFinite(Number(state.money)) ? Math.trunc(num(state.money)) : Math.trunc(num(cd.MONEY)),
    def: Number.isFinite(Number(state.def)) ? Math.trunc(num(state.def)) : Math.trunc(num(cd.DEFENSE)),
    cav,
    inf: troops - cav,
    prep,
    prepCap: cap,
    rate: intOr(cd.RATE, 1, 1, 5),
    flags: intOr(cd.FLAGS, 0, 0),
    seq: intOr(cd._index, 0, 0),
  };
}

/**
 * 把 60 城摘要写进 snapshot（就地改）。`cityDefs` 是当前剧本的 `cities` 数组；
 * `opts.info(城名)` 返回 `{owner, major, wise, roster}`（campaign 用 garrison.json 提供，
 * 纯 Node 测试可以不传 → 太守/军师退回剧本字段、roster 为空）。
 * 不在剧本里的旧城摘要原样保留（换剧本读档不会丢数据）。
 */
export function fillCitySummaries(snapshot, cityDefs, opts = {}) {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return { count: 0, filled: 0 };
  const list = Array.isArray(cityDefs) ? cityDefs : [];
  if (!snapshot.cities || typeof snapshot.cities !== 'object' || Array.isArray(snapshot.cities)) {
    snapshot.cities = {};
  }
  const info = typeof opts.info === 'function' ? opts.info : null;
  let filled = 0;
  for (const cd of list) {
    if (!cd || typeof cd.NAME !== 'string' || !cd.NAME) continue;
    let extra = {};
    if (info) { try { extra = info(cd.NAME) || {}; } catch { extra = {}; } }
    const st = snapshot.cities[cd.NAME];
    const owner = (typeof extra.owner === 'string' && extra.owner)
      || (st && typeof st.owner === 'string' ? st.owner : '')
      || (typeof cd.KING === 'string' ? cd.KING : '');
    const fl = owner && snapshot.forces && typeof snapshot.forces === 'object'
      ? Number(snapshot.forces[owner] && snapshot.forces[owner].flag) : NaN;
    // 调用方（campaign 的 cityInfoOf）显式给了 flag 就听它的，否则从 forces[owner] 派生
    if (!Number.isFinite(Number(extra.flag)) && Number.isFinite(fl)) extra = { ...extra, flag: Math.trunc(fl) };
    snapshot.cities[cd.NAME] = citySummaryOf(cd, snapshot.cities[cd.NAME], extra);
    filled += 1;
  }
  return { count: Object.keys(snapshot.cities).length, filled };
}

/**
 * R70 写档入口：先升级结构到 `SNAPSHOT_VERSION`，再按当前剧本补 60 城摘要。
 * 返回可直接交给 `writeSlot()` 的对象。
 *
 * 注意：快照已是 v2 时 `upgradeSnapshot` **不拷贝**，所以这里会就地补 `save.cities`
 * 的摘要字段（等于把"存档视图"同步到内存存档）——campaign 的自动存档正好要这个效果。
 */
export function prepareSnapshot(save, cityDefs, opts = {}) {
  const up = upgradeSnapshot(save);
  if (!up.snapshot) return null;
  const s = up.snapshot;
  if (Array.isArray(cityDefs) && cityDefs.length) fillCitySummaries(s, cityDefs, opts);
  s.v = SNAPSHOT_VERSION;
  return s;
}

/**
 * 新游戏状态：gold 1200 / month 1 / 战绩清零 / 全部城市按该剧本数据建运行态 /
 * 前 3 座城归玩家。`scenario` 必须带 `id` 与 `cities`（scenarios.json 的一项）。
 *
 * 注意：这里**不写 localStorage**，由 campaign.html 决定写哪个槽。
 */
export function newCampaign(scenario, opts = {}) {
  const sc = scenario && typeof scenario === 'object' ? scenario : {};
  const list = Array.isArray(sc.cities) ? sc.cities : [];
  const save = {
    v: SNAPSHOT_VERSION,       // R70 存档格式版本（老档没有这一栏 = 0）
    seeded: true,
    scenario: intOr(sc.id, 1, 1),
    month: 1,
    // [F5] 劇本起始年入檔：顯示 = `startYear + yearOf(month) - 1`（era.js 的 anchor）。
    startYear: startYearFrom(sc),
    gold: Number.isFinite(opts.gold) ? opts.gold : 1200,
    wins: 0,
    losses: 0,
    streak: 0,
    bestStreak: 0,
    defWins: 0,
    log: [],
    owned: [],
    cities: {},
    armies: [],
    lastActionMonth: 0,
    ts: Number.isFinite(opts.ts) ? opts.ts : Date.now(),
  };
  for (const c of list) {
    if (!c || !c.NAME) continue;
    const st = cityState(c);
    st.owner = typeof c.KING === 'string' ? c.KING : '';
    save.cities[c.NAME] = st;
  }
  for (const c of list.slice(0, 3)) {
    if (c && c.NAME && !save.owned.includes(c.NAME)) save.owned.push(c.NAME);
  }
  // R4 君主：新開局取劇本 KING —— 玩家首座的 KING（`scenarios.json` 每城有 KING；
  // 04c §2.1「城 +0x10 → 君主名」，KING 段只有 NAME/FLAGNUM）。數字 KING 是轉換殘留，當空城跳過。
  // 三欄一起寫：monarch＝君主名、force＝勢力 id（= 開國君主，繼承後不變）、monarchSince＝即位月。
  let seedKing = typeof opts.king === 'string' ? opts.king : '';
  if (!seedKing) {
    for (const n of save.owned) {
      const c = list.find((x) => x && x.NAME === n);
      if (c && typeof c.KING === 'string' && c.KING) { seedKing = c.KING; break; }
    }
  }
  save.king = seedKing;
  save.monarch = seedKing;
  save.force = seedKing;      // 勢力 id（= 開國君主，繼承後不變）
  save.monarchSince = 1;
  save.forces = {};    // R78 勢力表：由 campaign 的 refreshForces() 反建（旗/城/存續）
  save.fate = {};      // R78 殘將歸宿 {武將名:{fate,force,month}}
  save.drift = null;   // R65 上個月度漂移摘要（公式在 ai_model.monthlyDrift）
  // R70：存檔結構的其餘必填欄位（400 將等級/經驗、已學技能、忠誠/疲勞/士氣、城內名冊）
  save.roster = { _moved: {} };
  save.appointed = {};
  save.generalLevel = {};
  save.generalExp = {};
  save.learned = {};
  save.loyal = {};
  save.tire = {};
  save.morale = {};
  // v3（R84）：时间 / 武将档案。一次写全 ⇒ snapshotIsCurrent() 立刻为真，
  // 新开档不必跑迁移（yearsettle_r7:295 断言 up.changed === false 就靠这个）。
  // `ledger` 故意不写：R7 语义"没结过账就没有账本"（yearsettle_r7:96 断言它是 undefined）。
  save.year = 1;
  save.yearFlag = 0;
  save.generalStatus = {};   // 原作段4 +0x0B9 STATUS
  save.weapon = {};          // +0x0C3 WEAPON
  save.horse = {};           // +0x0C1 HORSE
  save.thing = {};           // +0x0C5 THING
  return save;
}

// ---------------------------------------------------------------------------
// R63 战绩累加（0x4084C9）
// ---------------------------------------------------------------------------

/**
 * 战绩累加 `0x4084C9(g, kind)`（docs/04b 550-556）：
 * ```
 * kind = +1 胜：+0x9F++（胜场）、+0xA3++（连胜）、+0xA5 = max(+0xA5, +0xA3)
 * kind = -1 败：+0xA1++（败场）、+0xA3 = 0
 * kind =  0 平：+0xA3 = 0（胜败场都不动）
 * ```
 * 与 `src/core/battle.ts:678` 的 `updateRecord` **口径一致**（wins/losses/streak/bestStreak），
 * 但签名不同：那边是纯函数吃 BattleRecord，这边直接读写 campaign 存档对象
 * （`save.wins/losses/streak/bestStreak`），因为 main.js 的战斗写回只认存档。
 */
export function recordOf(save) {
  const s = save && typeof save === 'object' ? save : {};
  return {
    wins: Math.max(0, Math.round(num(s.wins))),
    losses: Math.max(0, Math.round(num(s.losses))),
    streak: Math.max(0, Math.round(num(s.streak))),
    bestStreak: Math.max(0, Math.round(num(s.bestStreak))),
  };
}

/**
 * 把一场结果累加进存档，返回累加后的 record。
 * `won` 取 true / false / 'draw'（与 core 版同义）。
 */
export function updateRecord(save, won) {
  const s = save && typeof save === 'object' ? save : {};
  const prev = recordOf(s);
  let next;
  if (won === 'draw') {
    next = { ...prev, streak: 0 };
  } else if (won) {
    const streak = prev.streak + 1;
    next = {
      wins: prev.wins + 1,
      losses: prev.losses,
      streak,
      bestStreak: Math.max(prev.bestStreak, streak),
    };
  } else {
    next = { wins: prev.wins, losses: prev.losses + 1, streak: 0, bestStreak: prev.bestStreak };
  }
  s.wins = next.wins;
  s.losses = next.losses;
  s.streak = next.streak;
  s.bestStreak = next.bestStreak;
  return next;
}

/** HUD 文本：`3 勝 1 敗` / 连胜≥2 时补 ` · 2 連勝` / 有历史最佳时补 `（最佳 4）` */
export function recordText(save) {
  const r = recordOf(save);
  const tail = r.streak >= 2 ? ` · ${r.streak} 連勝` : '';
  const best = r.bestStreak >= 2 ? `（最佳 ${r.bestStreak}）` : '';
  return `${r.wins} 勝 ${r.losses} 敗${tail}${best}`;
}

// ---------------------------------------------------------------------------
// 展示文本
// ---------------------------------------------------------------------------

/**
 * 槽位摘要片段，槽位行与自测共用（前 6 段是 R70 之前的形状，6..8 是 R70 新增）：
 *   满槽 → ['槽1', '黃巾之亂', '第1年1月', '城3', '0勝0敗', '11-24 19:20',
 *           '君主何進', '勢力14', '將0']
 *   空槽 → ['槽4', '空']
 * `勢力N` 只算存活势力；灭亡数在 `entry.extinctCount`（行里另外显示）。
 */
export function slotParts(entry, index) {
  const i = slotIndex(index);
  const no = `槽${i >= 0 ? i + 1 : (intOr(index, 0, 0) + 1) || '?'}`;
  if (!entry || typeof entry !== 'object') return [no, '空'];
  const scenarioName = String(entry.scenarioName || '').trim() || `劇本${intOr(entry.scenario, 1, 1)}`;
  const time = String(entry.time || '').trim() || monthLabel(entry.month);
  const monarch = String(entry.monarch || '').trim() || '—';
  const forceCount = intOr(entry.forceCount, 0);
  const generalCount = intOr(entry.generalCount, 0);
  return [
    no,
    scenarioName,
    time,
    `城${intOr(entry.ownedCount, 0)}`,
    `${intOr(entry.wins, 0)}勝${intOr(entry.losses, 0)}敗`,
    clockLabel(entry.ts),
    `君主${monarch}`,
    `勢力${forceCount}`,
    `將${generalCount}`,
  ];
}

/** 一行摘要：`槽1 · 黃巾之亂 · 第1年1月 · 城3 · 0勝0敗 · 11-24 19:20` / `槽4 · 空` */
export function slotSummary(entry, index) {
  return slotParts(entry, index).join(' · ');
}

// ---------------------------------------------------------------------------
// 原作 4 段存檔行（記錄NN ｜ 君主名 ｜ 城數NN ｜ 武將NNN ｜ 時間NNN年）
// ---------------------------------------------------------------------------
//
// 依據 `project/178_全系统界面差异_A组.md` §4 與 `work/video_ui/A_save_t0035.png`：
//   記錄01 | 金 旋 | 城數47 | 武將202 | 時間286年
//   記錄08 | 金 旋 | 城數01 | 武將001 | 時間210年      ← 選中行整行變紅
// ・行標籤 `記錄01`…`記錄10`，兩位補零（原作是繁體「記錄」，178 文檔轉寫成「记录」）；
// ・君主欄只有名字，**沒有「君主」二字前綴**（`slotParts()` 的 `君主X` 是老口徑，別混用）；
// ・城數 2 位補零、武將 3 位補零、時間只到年（`209年`，沒有「西元」也沒有月）。
//
// 為什麼不直接改 `slotParts()`：它的 9 段形狀被 `tests/saves_r70.test.ts:594-623` 與
// `web/saves_selftest.mjs:72` 釘死（`槽1`/`第1年1月`/`君主公孫瓚`/`勢力14`/`將7`），
// 改了會壞既有測試與自測。所以**另加一組純函式**給「原作風」的存檔對話框用；
// 兩組並存，campaign.html 想換哪一組都只是換呼叫，不動資料。

/** 原作行標籤前綴（繁體；簡體轉寫見 `project/178` 的「记录」，本項目 UI 用繁體） */
export const SLOT_LABEL = '記錄';

/** `記錄01` … `記錄10`；`label` 可換（例如簡體 `记录`），越界槽號不拋 */
export function slotTitle(index, label = SLOT_LABEL) {
  const i = slotIndex(index);
  const n = i >= 0 ? i + 1 : (intOr(index, 0, 0) + 1) || 1;
  return `${label}${era.pad2(n)}`;
}

/**
 * 原作 4 段（不含行標籤）：
 *   滿槽 → ['金旋', '城數01', '武將003', '時間209年']
 *   空槽 → ['空']
 * 時間用 `entry.adYear`（新檔有）；老檔沒有就從 `entry.snapshot.startYear`（F5）或
 * `entry.year`／`entry.month` 現算，所以老槽升級後不會出現「時間undefined年」。
 */
export function slotLineParts(entry, index) {
  if (!entry || typeof entry !== 'object') return ['空'];
  const monarch = String(entry.monarch || '').trim() || '—';
  const months = Number.isFinite(Number(entry.month)) ? entry.month : (intOr(entry.year, 1, 1) - 1) * 12 + 1;
  const snapStart = Math.trunc(num(entry.snapshot && entry.snapshot.startYear));
  const adYear = Number.isFinite(Number(entry.adYear))
    ? Math.trunc(Number(entry.adYear))
    : (Number.isFinite(snapStart) && snapStart > 0
      ? snapStart + yearOf(months) - 1                 // [F5] 這格存檔自己的起始年
      : era.adYearOfMonth(months));                    // 老檔沒有 startYear：退回 era 錨點
  return [
    monarch,
    `城數${era.pad2(intOr(entry.ownedCount, 0, 0))}`,
    `武將${era.pad3(intOr(entry.generalCount, 0, 0))}`,
    `時間${adYear}年`,
  ];
}

/** 一行文字（段間用 ` ｜ `）：`金旋 ｜ 城數01 ｜ 武將003 ｜ 時間209年` / `空` */
export function slotLine(entry, index) {
  return slotLineParts(entry, index).join(' ｜ ');
}

/**
 * 原作月推進提示的**唯一一句話**（`work/video_ui/A_map_monthprompt_t0183.png`）：
 * `內政時間到了....` —— 四個半形點，不是一個省略號「…」，別順手改成「……」。
 * campaign.html 由別的 agent 持有，這裡只把字串備好（`Saves.advanceNotice`）；
 * 想接線就 `flash(Saves.advanceNotice)`，不要自己再抄一份字串。
 */
export const advanceNotice = '內政時間到了....';

/** 任務書/文檔用的簡體轉寫（**不要拿去顯示**，UI 是繁體） */
export const advanceNoticeSimp = '内政时间到了....';


// ---------------------------------------------------------------------------
// R7 年度结算（每年正月）
// ---------------------------------------------------------------------------

/**
 * 原作钩子（`docs/04c_世界与内政.md:57-79`，年进位标志见 `docs/07b_存档字段详解.md:111`）：
 *
 * ```
 * 0x4238AF:  if ([0x4A64FC] == 1) {       ; 年进位标志（存档 +0x05E，u16）
 *              [0x4BD390]++;              ; 当前年 +1（SYSTEM+0x10）
 *              call 0x423885;             ; 年度结算
 *              [0x4A64FC] = 0;
 *            }
 * 0x423885:  call 0x423681;  call 0x423765;  call 0x42379E;  call 0x4237A6;
 *            if ([0x4A6444] == 0) call 0x423824;
 * ```
 *
 * **五个子函数的语义在整个 docs 库都「未定位」**（04c:72-79、04c:491 列为待反汇编项），
 * 而且本作**没有**粮草 / 治安 / 季节系统（04c:79「本作无季节系统」、04c:170-172 城池记录
 * 只有 `MONEY +0x92`、`CITY%02d` 键集无粮草键），`data/generals.json` 的 401 条记录里也
 * **没有年龄/生卒字段**（键集 FACE…SKILLLEVEL4 共 30 个，无 AGE/Birth/Life）。
 * 所以这里只做「能查到的部分」，语义未定位的段落一律留成**只读归账**，不凭空造数值：
 *
 * | 段 | 原作 | 语义 | 本档实现 | 依据 |
 * |----|------|------|----------|------|
 * | 年进位 | `0x4BD390++`、清 `0x4A64FC` | 年 +1 | `save.year` + `save.yearFlag` | 04c:62-66、07b:111 |
 * | 1 | `0x423681` | 未定位 | **年度总账**：上一年 12 个月的入账/官俸汇总（不改余额） | `[推测]` |
 * | 2 | `0x423765` | 未定位 | **城池巡查**：在册城数、人口合计（只读） | `[推测]` |
 * | 3 | `0x42379E` | 未定位 | **武将名册**：在册武将数（只读） | `[推测]` |
 * | 4 | `0x4237A6` | 未定位 | **年度战绩**：胜/负/守城胜（字段同 `recordOf`，`0x4084C9`） | `[推测]` |
 * | 5 | `0x423824` | 受 `[0x4A6444]==0` 抑制 | **势力存亡复核**：页面层只读巡检（见 campaign.html `annualYearRollover`） | `[推测]` |
 *
 * **明确不做的项**（原作/数据没有，做了就是发明）：
 *   · **粮草入库** —— 本作无粮草概念（37a §三：粮草相关档案在 EXE 零命中；04c:170-172）；
 *   · **治安恢复** —— 城池记录里没有治安/民心字段（04c:170-172 的字段表）；
 *   · **武将年龄 +1 / 寿命判定（老死）** —— 无年龄字段，docs 全库 grep `年龄|寿命|老死` 0 命中；
 *   · **人口自然增长公式** —— 04c:178 明写「未定位」；月推进已按 `×1.01` 近似，年度不重复加。
 */
export const YEAR_MONTHS = 12;

/**
 * [F5] 舊檔沒有 `startYear` 時的兜底 = 剧本 0《黃巾之亂》的 184（= `era.js` 的 `AD_ANCHOR_DEFAULT`）。
 * 只在「存檔缺這一欄」時用；新開局一律由 `startYearFrom(劇本)` 寫真值。
 */
export const START_YEAR_FALLBACK = 184;

/**
 * [F5] 劇本 → 起始公元年。`scenarios.json` 的真源是 `system.YEAR`（184/189/200/208/219）；
 * campaign.html 的 `SCEN` 另外攤平成 `year`，兩個都認，認不出來回 184。
 */
export function startYearFrom(scenario) {
  const sc = scenario && typeof scenario === 'object' ? scenario : {};
  for (const v of [sc.system && sc.system.YEAR, sc.year, sc.YEAR]) {
    const n = Math.trunc(num(v));
    if (Number.isFinite(n) && n > 0 && n < 10000) return n;
  }
  return START_YEAR_FALLBACK;
}

/**
 * [F5] 存檔的起始公元年（顯示錨點）。缺/非法 → 184；**不做年內換算**
 * （年內換算仍走 `yearOf()`，兩者相加才是「西元 N 年」：`startYear + yearOf(m) - 1`）。
 */
export function startYearOf(save) {
  const n = Math.trunc(num(save?.startYear));
  return Number.isFinite(n) && n > 0 && n < 10000 ? n : START_YEAR_FALLBACK;
}

/** 绝对月数 → 年（1 起）。与 `monthLabel` 同一个式子，拆成两半给年度结算与显示共用 */
export function yearOf(month) {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return Math.floor((m - 1) / YEAR_MONTHS) + 1;
}

/** 绝对月数 → 年内月份 1..12 */
export function monthOfYear(month) {
  const m = Math.max(1, Math.trunc(num(month)) || 1);
  return ((m - 1) % YEAR_MONTHS) + 1;
}

/** 正月（年内 1 月）= 年度结算触发月（`0x4238AF` 消费年进位标志的那一回合） */
export function isYearStart(month) {
  return monthOfYear(month) === 1;
}

/**
 * 老档迁移：`save.year` 缺失/过时就地按 `month` 补（幂等，只补不改其它键）。
 * 原作没有独立的"年"存档字段（年由月序号推出，`0x4BD390` 只在内存），
 * 本档把年冗余存一份只为显示/对账方便；**真源仍是 `save.month`**。
 */
export function ensureYear(save) {
  const s = save && typeof save === 'object' ? save : {};
  const y = yearOf(s.month);
  if (num(s.year) !== y) s.year = y;
  return y;
}

/**
 * 当年账本 `save.ledger = { year, months, income, salary }`（`[推测]`，见文件头表第 1 段）。
 * 跨年/老档自动重建；只补不删别的键；坏值一律夹回 0。
 * **只累计、不改 `save.gold`** —— 金钱只在正月年度结算第 5 段 `0x423824` 一次性发（`pop×75/10000 + 2250` 每城，`[確認]` 见 `project/133` §2），月度不发钱、不收俸禄。
 */
export function ledgerOf(save) {
  const s = save && typeof save === 'object' ? save : {};
  const year = ensureYear(s);
  const cur = s.ledger && typeof s.ledger === 'object' && !Array.isArray(s.ledger) ? s.ledger : null;
  if (!cur || num(cur.year) !== year) s.ledger = { year, months: 0, income: 0, salary: 0 };
  const l = s.ledger;
  for (const k of ['months', 'income', 'salary']) {
    const n = Number(l[k]);
    l[k] = Number.isFinite(n) && n > 0 ? Math.trunc(n) : 0;
  }
  l.year = year;
  return l;
}

/** 月推进里累计（`campaign.html` 每月 `ledgerAdd(…{months:1})`；`income`/`salary` 只在年度结算时由第五段与账本段给） */
export function ledgerAdd(save, patch = {}) {
  const l = ledgerOf(save);
  for (const k of ['months', 'income', 'salary']) {
    const n = Number(patch[k]);
    if (Number.isFinite(n) && n > 0) l[k] = Math.trunc(l[k] + n);   // 负值/0/NaN 一律不倒扣
  }
  return l;
}

/** 年度结算的 5 段（顺序 = `0x423885` 的 call 顺序，逐字对齐 04c:72-76） */
export const YEAR_STAGES = [
  { id: '0x423681', key: 'ledger', label: '年度總賬', evidence: '[推測]' },
  { id: '0x423765', key: 'cities', label: '城池巡查', evidence: '[推測]' },
  { id: '0x42379E', key: 'officers', label: '武將名冊', evidence: '[推測]' },
  { id: '0x4237A6', key: 'record', label: '年度戰績', evidence: '[推測]' },
  { id: '0x423824', key: 'sweep', label: '年稅結算（逐城 pop×75/10000+2250）', evidence: '[確認]', gate: '0x4A6444', delegated: 'saves.js:annualSettle' },
];

/** 战报一行（`annualSettle` 的返回值里也用这一份，测试与页面共用同一串） */
export function annualText(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const y = Math.max(1, Math.trunc(num(r.year)) || 1);
  const months = Math.max(0, Math.trunc(num(r.months)));
  const tail = months > 0 && months < YEAR_MONTHS ? `（賬本 ${months}/${YEAR_MONTHS} 月）` : '';
  return `${y}年 年 度 結 算：歲入 ${Math.trunc(num(r.income))} 金`
    + ` · 城 ${Math.trunc(num(r.cities))} · 將 ${Math.trunc(num(r.officers))}`
    + ` · 戰績 ${Math.trunc(num(r.wins))} 勝 ${Math.trunc(num(r.losses))} 敗${tail}`;
}

/**
 * 年度结算（纯函数，无 DOM / 无随机 / 无 storage）：只在**正月**、且**已有上一年**时生效
 * （开局第 1 年 1 月没有可结的账，返回 `reason:'first-year'`；第一次真结账发生在月 13）。
 *
 * @param {object} save  campaign 存档对象（就地写 `year` / `yearFlag` / `ledger` / `annual`）
 * @param {object} [opts] `{ ts?:number, force?:boolean }`
 *   · `ts`    结算时刻（默认 0，保持可复现；页面传 `Date.now()`）
 *   · `force` 非正月也强制结一次（调试/测试用）
 * @returns {{ok:boolean, reason?:string, month:number, year:number, closed:number,
 *            record:object|null, text:string}}
 *   `year` = 结算后所处的年（正月所在年），`closed` = 刚结束、被结账的那一年。
 */
export function annualSettle(save, opts = {}) {
  const s = save && typeof save === 'object' ? save : null;
  if (!s) return { ok: false, reason: 'no-save', month: 0, year: 0, closed: 0, record: null, text: '' };
  const month = Math.max(1, Math.trunc(num(s.month)) || 1);
  const year = yearOf(month);
  if (!opts.force && !isYearStart(month)) {
    return { ok: false, reason: 'not-january', month, year, closed: 0, record: s.annual ?? null, text: '' };
  }
  // 開局就在第 1 年 1 月：沒有「上一年」可結，直接跳過（第一次真結賬發生在月 13）
  if (!opts.force && year < 2) {
    return { ok: false, reason: 'first-year', month, year, closed: 0, record: s.annual ?? null, text: '' };
  }
  // 过了上面两道闸才动档：被拒的调用不许留下任何字段（含 year 的补写）
  ensureYear(s);
  // 上一年账本：老档没有就是空账（不补造 12 个月的假数）
  const prev = s.ledger && typeof s.ledger === 'object' && !Array.isArray(s.ledger) ? s.ledger : null;
  const closed = Math.max(1, year - 1);
  const led = prev && num(prev.year) === closed
    ? { months: num(prev.months), income: num(prev.income), salary: num(prev.salary) }
    : { months: 0, income: 0, salary: 0 };

  const cities = s.cities && typeof s.cities === 'object' && !Array.isArray(s.cities) ? s.cities : {};
  let pop = 0;
  for (const st of Object.values(cities)) pop += Math.max(0, Math.trunc(num(st && st.pop)));
  let cityCount = 0;
  for (const n of Array.isArray(s.owned) ? s.owned : []) if (typeof n === 'string' && n) cityCount += 1;
  const roster = s.roster && typeof s.roster === 'object' && !Array.isArray(s.roster) ? s.roster : {};
  let officers = 0;
  for (const [k, v] of Object.entries(roster)) if (k !== '_moved' && Array.isArray(v)) officers += v.length;

  const rec = {
    v: 1,
    year: closed,                     // 被结账的那一年（战报上写这一年）
    intoYear: year,                   // 结算后进入的年
    at: Number.isFinite(Number(opts.ts)) ? Math.trunc(Number(opts.ts)) : 0,
    months: Math.trunc(led.months),
    income: Math.trunc(led.income),
    salary: Math.trunc(led.salary),
    cities: cityCount,
    pop: Math.trunc(pop),
    officers,
    wins: Math.max(0, Math.trunc(num(s.wins))),
    losses: Math.max(0, Math.trunc(num(s.losses))),
    defWins: Math.max(0, Math.trunc(num(s.defWins))),
    gold: Math.max(0, Math.trunc(num(s.gold))),
    stages: YEAR_STAGES.map((x) => ({ id: x.id, key: x.key, label: x.label, evidence: x.evidence })),
  };
  const text = annualText(rec);
  rec.text = text;

  s.yearFlag = 0;                     // `0x4A64FC = 0`（04c:65）
  s.annual = rec;                     // 上一年度结算记录（落档，槽一存就有）
  s.ledger = { year, months: 0, income: 0, salary: 0 };   // 新一年从零记
  return { ok: true, month, year, closed, record: rec, text };
}
