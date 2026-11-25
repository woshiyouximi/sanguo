/**
 * monarch_model.js — R4 君主 / R78 势力·灭亡·继承 / R65 漂移展示 的**纯逻辑**。
 *
 * 无 DOM、无 fetch、无 localStorage、无顶层副作用：`campaign.html` 与 `node --test` 共用。
 * `saves.js` 负责「存档容器」；这里只负责「君主/势力」的判定与聚合，改的是传进来的 save 对象。
 *
 * 原作依据（docs/04c_世界与内政.md）：
 *   · `0x40975E` 君主不可俘 —— 被俘判定直接跳 0（R55，`src/core/capture.ts:191` 已落实）。
 *     所以君主只有两条退场路径：**阵亡**（城破/战死）与**让位**（大地图换君主）。
 *   · city+0x10 = 该城所属君主编号（0 = 空城），见 04c:129/:339。
 *   · 玩家君主编号 `0x4A64F0`，见 04c:342。
 *   · 剧本 `KING` 段只有 NAME/FLAGNUM（04c:327），**没有国号字段** —— 群英传 2 的「势力」
 *     就是君主本人，所以势力 id 取初代君主名，继承时**只换君主、不换势力 id**。
 *   · 武将 `+0x91` STATUS：1 登用 / 2 俘虏 / 8 在野（04c:223）；`+0xBF` LOYAL 忠诚（04c:229）。
 *
 * ⚠️ 数据陷阱（必须记住）：`generals.json` 的 `Force` / `UseForce` 是**兵种适性**
 *   （刀/弓/槍/鐵/飛/錬/賊/武…），不是「武将所属势力」。真正的效忠对象是 `LoyalKing`
 *   （docs/04c:304，`%s\KING`），但 401 条里只有 24 条非空（家臣/同族），所以：
 *     1) 势力的「武将列表」以**运行时驻城**为准（武将驻在谁的城 → 归于谁的势力）；
 *     2) `LoyalKing` 只作**同族/家臣**的证据，用在继承与残将处置上。
 *   `Force` 字段一律不读。
 */

/** 原作地址与字段偏移（报告/文档引用用；本文件不读二进制） */
export const MONARCH_SRC = Object.freeze({
  KING_UNCATCHABLE: '0x40975E',   // R55：君主不可俘
  CITY_OWNER: 0x10,               // city+0x10 所属君主
  PLAYER_KING: '0x4A64F0',        // 玩家君主编号
  LOYAL: 0xBF,                    // 武将忠诚
  STATUS: 0x91,                   // 武将状态
  STATUS_EMPLOYED: 1,             // 登用
  STATUS_CAPTIVE: 2,              // 俘虏
  STATUS_WILD: 8,                 // 在野
  LOYAL_KING: 'LoyalKing',        // generals.json 的效忠对象（不是 Force）
  /**
   * 残将去留的忠诚门槛。原作招降公式未定位（04c:312 只给了消息串），
   * 这里按「低忠诚愿降、高忠诚/同族不事二主」取 60。等级：[推测]
   */
  LOYAL_SURRENDER: 60,
});

/** 残将归宿 */
export const FATE = Object.freeze({ SURRENDER: 'surrender', WILD: 'wild' });
/** 归宿中文（战报/UI 共用） */
export const FATE_TEXT = Object.freeze({ surrender: '投降', wild: '在野' });
/** 武将状态码 ↔ 中文 */
export const STATUS_TEXT = Object.freeze({ 登: '在職', 俘: '俘虜', 野: '在野' });

/** 复姓表：同姓判定要先吃掉两个字，否则「公孫越」會被當成「公」姓 */
const COMPOUND = Object.freeze([
  '公孫', '司馬', '夏侯', '諸葛', '皇甫', '歐陽', '太史', '上官', '令狐', '尉遲',
  '長孫', '宇文', '獨孤', '慕容', '呼延', '端木', '西門', '東方', '南宮', '萬俟',
  '聞人', '澹臺', '公冶', '宗政', '濮陽', '淳于', '單于', '太叔', '申屠', '仲孫',
  '軒轅', '鐘離', '鮮于', '閭丘', '司徒', '司空', '司寇', '子車', '顓孫', '巫馬',
  '公西', '漆雕', '樂正', '壤駟', '公良', '拓跋', '夾谷', '宰父', '穀梁', '段干',
  '百里', '東郭', '南門', '羊舌', '微生', '梁丘', '左丘', '東門', '南榮', '第五',
]);

export function str(value) {
  return typeof value === 'string' ? value : '';
}

export function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function intOr(value, fallback, min = -Infinity, max = Infinity) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(n)));
}

function saveOf(save) {
  return save && typeof save === 'object' && !Array.isArray(save) ? save : {};
}

// ---------------------------------------------------------------------------
// §1 君主是谁：monarch / force / king 三个字段的分工
// ---------------------------------------------------------------------------
/**
 * 当前君主（武将名）。`save.monarch` 是新字段；老档没有就退回 `save.king`。
 * 继承/让位只改 monarch，不动 king。
 */
export function monarchOf(save) {
  const s = saveOf(save);
  return str(s.monarch) || str(s.king);
}

/**
 * 势力 id（= 城 owner 里存的那个名字）。`save.force` 是新字段；老档退回 `save.king`。
 * 势力 id 一旦开局就**不再变**：继承只换君主，势力名/颜色/城池都不动。
 */
export function forceIdOf(save) {
  const s = saveOf(save);
  return str(s.force) || str(s.king);
}

/** 势力显示名：势力 id 就是名（群英传 2 没有国号）；势力已亡则保留原名 */
export function forceNameOf(save) {
  return forceIdOf(save);
}

/**
 * 开局/补登：一次写齐 monarch / force / monarchSince / king。
 *   · 新游戏：king = 剧本 KING 的君主名，monarch = 同一个名字，force = 同一个名字。
 *   · 老档补登：同样按 owned 里最常見的 KING 补。
 * `opts.force` 只在「继承后仍沿用旧势力 id」时显式传入（见 inheritForce）。
 */
export function setMonarch(save, king, opts = {}) {
  const s = saveOf(save);
  const name = str(king);
  const month = intOr(opts.month, 1, 1);
  const prev = monarchOf(s);
  if (!name) {
    s.monarch = '';
    s.force = '';
    s.monarchSince = month;
    if (opts.keepKing !== true) s.king = '';
    return { ok: true, monarch: '', force: '', since: month, prev, changed: Boolean(prev) };
  }
  const force = str(opts.force) || name;
  s.monarch = name;
  s.force = force;
  s.monarchSince = month;
  if (opts.keepKing !== true) s.king = force;
  return { ok: true, monarch: name, force, since: month, prev, changed: prev !== name };
}

/**
 * 让位（大地图上「換君主」的合法动作）。势力不变，只换君主与即位月。
 * 原作判定点未定位（04c §2.1 只给了君主编号的存放位置），「让位」本身是任务书 R4 要求
 * 的大地图动作，等级：[新设计]（合法性受 ui 限制：只能从本势力在职武将里选）。
 */
export function abdicate(save, heir, opts = {}) {
  const s = saveOf(save);
  const to = str(heir);
  const from = monarchOf(s);
  const force = forceIdOf(s);
  const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
  if (!to) return { ok: false, reason: 'no-heir', from, force, month };
  if (!from) return { ok: false, reason: 'no-monarch', from, force, month };
  if (to === from) return { ok: false, reason: 'same', from, force, month };
  s.monarch = to;
  s.monarchSince = month;
  if (force && s.forces && s.forces[force] && typeof s.forces[force] === 'object') {
    s.forces[force].king = to;
  }
  return { ok: true, from, to, force, month, reason: 'abdicate' };
}

/**
 * 继承：势力 id 不变（城 owner / 旗色 / 势力名全部沿用），只把 forces[force].king
 * 与（若是我方势力）save.monarch 换成继任者。
 * 原作继承规则未定位，继任者由 pickSuccessor 按「同族 > 忠诚 > 能力」选，[推测]。
 */
export function inheritForce(save, forceId, heir, opts = {}) {
  const s = saveOf(save);
  const id = str(forceId);
  const to = str(heir);
  const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
  if (!id || !to) return { ok: false, reason: 'bad-args', force: id, heir: to, month };
  if (!s.forces || typeof s.forces !== 'object') s.forces = {};
  if (!s.forces[id] || typeof s.forces[id] !== 'object') {
    s.forces[id] = { id, king: id, flag: 0, alive: true, cities: [], ts: 0 };
  }
  const f = s.forces[id];
  f.king = to;
  f.alive = true;
  if (typeof f.endedAt === 'number') delete f.endedAt;
  const isPlayer = id === forceIdOf(s);
  if (isPlayer) {
    s.monarch = to;
    s.monarchSince = month;
  }
  return { ok: true, force: id, heir: to, month, player: isPlayer, reason: 'inherit' };
}

// ---------------------------------------------------------------------------
// §2 继承人选：同族 > 忠诚 > 能力
// ---------------------------------------------------------------------------
/** 姓：复姓优先，否则首字。没有名字 → '' */
export function clanOf(name) {
  const n = str(name);
  if (!n) return '';
  for (const c of COMPOUND) if (n.startsWith(c)) return c;
  return n.slice(0, 1);
}

/** 同姓（同族）。「公孫瓚 / 公孫越」→ true；「孫堅 / 孫策」→ true；「曹操 / 曹仁」→ true */
export function sameClan(a, b) {
  const x = clanOf(a);
  const y = clanOf(b);
  return Boolean(x) && x === y;
}

/**
 * 武将状态归一：accept `{name,status,loyal,...}` 或 generals.json 原始行。
 * 缺 status 时按「登用」处理（garrison.json 的在野武将会明确写 '野'）。
 */
export function normOfficer(raw) {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'string') {
    const name = raw.trim();
    return name ? { name, str: 0, int: 0, loyal: null, status: '登', loyalKing: '', constancy: 0 } : null;
  }
  if (typeof raw !== 'object') return null;
  const name = str(raw.name) || str(raw.NAME);
  if (!name) return null;
  const loy = raw.loyal ?? raw.Loyal ?? raw.LOYAL;
  return {
    name,
    str: num(raw.str ?? raw.STR),
    int: num(raw.int ?? raw.INT),
    loyal: Number.isFinite(Number(loy)) ? Number(loy) : null,
    // 只认 LoyalKing；**绝不读 Force**（那是兵种适性）
    loyalKing: str(raw.loyalKing) || str(raw.LoyalKing),
    status: normStatus(raw.status ?? raw.Status),
    constancy: num(raw.constancy ?? raw.CONSTANCY),
  };
}

/** 状态归一：数字 1/2/8 与中文「登/俘/野」都收；其余按在職 */
export function normStatus(value) {
  if (typeof value === 'number') {
    if (value === MONARCH_SRC.STATUS_CAPTIVE) return '俘';
    if (value === MONARCH_SRC.STATUS_WILD) return '野';
    return '登';
  }
  const v = str(value).trim();
  if (!v) return '登';
  if (v.includes('俘') || v.includes('虜') || v.includes('虏')) return '俘';
  if (v.includes('野') || v.includes('未')) return '野';
  return '登';
}

/** 在职（登用）才算候选人 */
export function isEmployed(officer) {
  return normStatus(officer?.status ?? officer?.Status) === '登';
}

/**
 * 继承评分：同族 2 分 > 同姓 1 分（clanOf 已合并两种情况），其次忠诚，再其次 STR+INT。
 * 回傳 `{ score, clan, loyal, power }`；score 越大越优先。
 */
export function successionScore(officer, deadKing) {
  const o = normOfficer(officer);
  if (!o) return null;
  const dead = str(deadKing);
  const clan = dead ? sameClan(o.name, dead) : false;
  // 同族（包含 LoyalKing 明确写着效忠旧主）优先；没有族亲才看忠诚
  const blood = clan ? 2 : (o.loyalKing && dead && o.loyalKing === dead ? 1 : 0);
  const loyal = Number.isFinite(o.loyal) ? o.loyal : 90;
  return { score: blood * 10000 + loyal * 100 + o.str + o.int, clan, blood, loyal, power: o.str + o.int };
}

/**
 * 继承候选（已排序）。排除：已死者本人、**现任君主**、俘虏、在野、盜賊模板。
 * 原作继承规则未定位（04c 只给了君主编号的存放位置），本排序是 [推测]。
 *
 * `opts.king` = 现任君主。以前只排 `dead`，于是「死的其实是城里的太守、现任君主还活着」时
 * 现任君主自己会被选成继任者 → 战报出现「X 陣亡：X 繼位」（project/89 / project/93 §3）。
 * 现在把现任君主也排掉：无论调用方传的 `dead` 是谁，活着的君主都不会被“继承”自己。
 */
export function successionList(forceId, officers, opts = {}) {
  const dead = str(opts.dead) || str(forceId);
  const sitting = str(opts.king);
  const list = Array.isArray(officers) ? officers : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const o = normOfficer(raw);
    if (!o || o.name === dead || (sitting && o.name === sitting) || o.name === '盜賊' || seen.has(o.name)) continue;
    if (!isEmployed(o)) continue;
    const sc = successionScore(o, dead);
    out.push({ ...o, ...sc });
    seen.add(o.name);
  }
  out.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
  return out;
}

/** 继任者名字；没有 → ''（势力灭亡） */
export function pickSuccessor(forceId, officers, opts = {}) {
  const list = successionList(forceId, officers, opts);
  return list.length ? list[0].name : '';
}

/**
 * 让位候选：本势力**在职**武将里排除现任君主，按同一套评分排序。
 * `officersByCity` = `{城: [武将]}`；只取 `opts.cities`（默认该势力现有城）里的武将。
 */
export function abdicateCandidates(save, opts = {}) {
  const s = saveOf(save);
  const ownerOf = typeof opts.ownerOf === 'function' ? opts.ownerOf : (n) => str(s.cities?.[n]?.owner);
  const cities = Array.isArray(opts.cities) ? opts.cities : [];
  const byCity = opts.officersByCity && typeof opts.officersByCity === 'object' ? opts.officersByCity : {};
  const force = forceIdOf(s);
  const cur = monarchOf(s);
  const seen = new Set();
  const out = [];
  for (const c of cities) {
    const name = str(c?.NAME) || str(c);
    if (!name || ownerOf(name) !== force) continue;
    for (const raw of byCity[name] || []) {
      const o = normOfficer(raw);
      if (!o || o.name === cur || o.name === '盜賊' || seen.has(o.name)) continue;
      if (!isEmployed(o)) continue;
      const sc = successionScore(o, cur);
      out.push({ ...o, ...sc, city: name });
      seen.add(o.name);
    }
  }
  out.sort((a, b) => (b.score - a.score) || a.name.localeCompare(b.name));
  return out;
}

// ---------------------------------------------------------------------------
// §3 灭亡：君主死 + 残将去留
// ---------------------------------------------------------------------------
/**
 * 残将归宿：低忠诚愿降（`LOYAL_SURRENDER` 以下），高忠诚或同族/家臣 → 在野。
 * 原作「招降」按 LOYAL/CONSTANCY 判定（04c:312），具体式子未定位 → 门槛 60 是 [推测]。
 */
export function decideFate(officer, opts = {}) {
  const o = normOfficer(officer);
  if (!o) return FATE.WILD;
  const loyal = Number.isFinite(o.loyal) ? o.loyal : intOr(opts.loyal, 90, 0, 100);
  const limit = intOr(opts.limit, MONARCH_SRC.LOYAL_SURRENDER, 0, 100);
  const clan = Boolean(o.loyalKing) && sameClan(o.loyalKing, o.name);
  if (clan) return FATE.WILD;               // 同族不事二主
  return loyal < limit ? FATE.SURRENDER : FATE.WILD;
}

/**
 * 势力灭亡：标 forces.alive=false / cities=[] / endedAt，结算残将归宿写进 `save.fate`。
 * **不碰城池归属**（那是 AI.extinguishForce / 破城代码的事，本函数保持纯记录）。
 * 我方势力灭亡时清空 monarch/force（顶栏回「未選」）。
 */
export function extinguish(save, forceId, opts = {}) {
  const s = saveOf(save);
  const id = str(forceId);
  const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
  const empty = { ok: false, force: id, month, fates: [], surrender: [], wild: [], reason: 'no-force' };
  if (!id) return empty;
  if (!s.forces || typeof s.forces !== 'object') s.forces = {};
  const f = s.forces[id] && typeof s.forces[id] === 'object'
    ? s.forces[id]
    : (s.forces[id] = { id, king: id, flag: 0, alive: true, cities: [], ts: 0 });
  if (f.alive === false) {
    return { ...empty, ok: true, reason: 'already-dead', fates: [] };
  }
  f.alive = false;
  f.cities = [];
  f.endedAt = month;
  const dead = str(opts.dead);
  const officers = (Array.isArray(opts.officers) ? opts.officers : [])
    .map(normOfficer)
    .filter((o) => o && o.name !== dead);
  if (!s.fate || typeof s.fate !== 'object' || Array.isArray(s.fate)) s.fate = {};
  const fates = [];
  for (const o of officers) {
    const fate = decideFate(o);
    fates.push({ name: o.name, fate, loyal: o.loyal, force: id, month });
    s.fate[o.name] = { fate, force: id, month };
  }
  const surrender = fates.filter((x) => x.fate === FATE.SURRENDER).map((x) => x.name);
  const wild = fates.filter((x) => x.fate === FATE.WILD).map((x) => x.name);
  if (id === forceIdOf(s)) {
    // 我方势力灭亡：顶栏回「未選」。king 也清空 —— 否则 monarchOf 会从 king 回退出一个死人名字。
    s.monarch = '';
    s.force = '';
    s.king = '';
    s.monarchSince = month;
  }
  return { ok: true, force: id, month, fates, surrender, wild, reason: 'extinct' };
}

/**
 * 君主阵亡的统一入口（城内阵亡 / 城破被杀）。**纯逻辑**，不搬城。
 *   1) 还有城（`opts.remaining > 0`）且选得出继任者 → inheritForce 续命（势力名/旗/城不变）。
 *   2) 没城、或选不出继任者 → extinguish（残将按 Loyal/LoyalKing 定去留）。
 * `opts.officers` 传该势力（或那座城）的在职武将；`opts.remaining` 传「除失守城之外还剩几城」。
 * 原作「君主死 = 势力灭还是继承」未定位，本规则 [推测]；0x40975E 只证明君主不会被俘。
 */
export function kingDeath(save, forceId, opts = {}) {
  const s = saveOf(save);
  const id = str(forceId);
  const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
  const out = { dead: false, force: id, heir: '', extinct: false, fates: [], month, reason: '' };
  if (!id) return { ...out, reason: 'no-force' };
  const f = s.forces?.[id];
  if (f && f.alive === false) return { ...out, reason: 'already-dead' };
  // 现任君主：forces[id].king 没有就退回势力 id（开国君主 = 势力 id，见 campaign.html 的快照）
  const sitting = str(f?.king) || id;
  const dead = str(opts.dead) || sitting;
  // 死者必须是现任君主。campaign.html 的 kingFell() 拿的是「失守城的太守」
  // （garrison.json 的静态 MAJOR / AI 的 oldMajor），那未必是君主 —— 以前不校验，
  // 于是太守死了却触发「君主继承」，还把活着的君主选成继任者，战报就成了
  // 「嚴白虎 君主陣亡：嚴白虎 繼位」（project/89 / project/93 §3）。
  // 这里直接判「没人死」：调用方（campaign.html:2829 `if (!res?.dead) return res;`）会静默跳过。
  if (dead !== sitting) {
    return { ...out, dead: false, reason: 'not-monarch', deadName: dead, monarch: sitting };
  }
  const remaining = Number.isFinite(Number(opts.remaining)) ? Number(opts.remaining) : null;
  const officers = (Array.isArray(opts.officers) ? opts.officers : [])
    .map(normOfficer)
    .filter(Boolean);
  // 继任者里把现任君主也排掉（他现在是「死者」，本来就该死）——见 successionList 的 opts.king
  const heir = remaining === 0 ? '' : pickSuccessor(id, officers, { dead, king: sitting });
  if (heir) {
    inheritForce(s, id, heir, { month });
    return { ...out, dead: true, heir, deadName: dead, reason: 'inherit' };
  }
  const ex = extinguish(s, id, { month, officers, dead });
  return { ...out, dead: true, extinct: true, deadName: dead, fates: ex.fates, reason: 'extinct' };
}

// ---------------------------------------------------------------------------
// §4 势力聚合：势力 → 城 → 武将
// ---------------------------------------------------------------------------
/**
 * 把「城 + 归属函数 + 各城武将」聚合成势力表。
 *   `opts.cities`        全部城（scenarios.json 的 cities）
 *   `opts.ownerOf(name)` 当前归属（campaign 传 forceAt，默认读 save.cities[name].owner）
 *   `opts.officersByCity` {城: [武将]}（campaign 传 garrison.json 的守将）
 *
 * 回傳每项：`{id, name, monarch, flag, alive, player, cities[], officers[], cityCount,
 *            officerCount, endedAt, surrenderCount}`，已排序（我方 → 存续 → 城多）。
 * 声明存续但 0 城的势力按**灭亡**算（checkForceDeaths 的同一口径）。
 */
export function forceRoster(save, opts = {}) {
  const s = saveOf(save);
  const allCities = Array.isArray(opts.cities) ? opts.cities : [];
  const ownerOf = typeof opts.ownerOf === 'function'
    ? opts.ownerOf
    : (n) => str(s.cities?.[n]?.owner);
  const byCity = opts.officersByCity && typeof opts.officersByCity === 'object' ? opts.officersByCity : {};
  const player = forceIdOf(s);
  const rows = new Map();
  const ensure = (id) => {
    const key = str(id);
    if (!key) return null;
    if (!rows.has(key)) {
      const f = s.forces?.[key];
      const declared = f && typeof f === 'object' ? f.alive !== false : true;
      rows.set(key, {
        id: key,
        name: key,
        monarch: str(f?.king) || (key === player ? monarchOf(s) : key),
        flag: num(f?.flag),
        declared,
        alive: declared,
        player: key === player,
        endedAt: intOr(f?.endedAt, 0, 0),
        cities: [],
        officers: [],
        cityCount: 0,
        officerCount: 0,
        surrenderCount: 0,
      });
    }
    return rows.get(key);
  };
  for (const id of Object.keys(s.forces || {})) ensure(id);
  if (player) ensure(player);
  for (const c of allCities) ensure(ownerOf(str(c?.NAME)));
  for (const row of rows.values()) {
    for (const c of allCities) {
      const n = str(c?.NAME);
      if (!n || ownerOf(n) !== row.id) continue;
      row.cities.push(n);
      for (const raw of byCity[n] || []) {
        const o = normOfficer(raw);
        if (!o || row.officers.some((x) => x.name === o.name)) continue;
        row.officers.push(o);
      }
    }
    row.cityCount = row.cities.length;
    row.officerCount = row.officers.filter((o) => o.status === '登').length;
    row.surrenderCount = row.officers.filter((o) => s.fate?.[o.name]?.fate === FATE.SURRENDER).length;
    row.alive = row.declared && row.cityCount > 0;
  }
  const list = [...rows.values()];
  list.sort((a, b) => (Number(b.player) - Number(a.player))
    || (Number(b.alive) - Number(a.alive))
    || (b.cityCount - a.cityCount)
    || a.id.localeCompare(b.id));
  return list;
}

/**
 * 单势力的武将明细（含忠誠/士氣/疲勞与残将归宿），势力列表点开用。
 * `opts.rowOf(name)` 可给 generals.json 的原始行（补 STR/INT/LOYAL）。
 */
export function forceDetail(save, forceId, opts = {}) {
  const s = saveOf(save);
  const id = str(forceId);
  const roster = forceRoster(s, {
    cities: opts.cities,
    ownerOf: opts.ownerOf,
    officersByCity: opts.officersByCity,
  });
  const row = roster.find((x) => x.id === id) || null;
  if (!row) return null;
  const rowOf = typeof opts.rowOf === 'function' ? opts.rowOf : () => null;
  row.officers = row.officers.map((o) => officerStatus(s, o, rowOf(o.name)));
  return row;
}

/** 武将的当前状态（存档覆盖 generals.json）：忠誠/士氣/疲勞 + 残将归宿 */
export function officerStatus(save, officer, row) {
  const s = saveOf(save);
  const o = normOfficer(officer);
  if (!o) return null;
  const base = row && typeof row === 'object' ? row : null;
  const loyal = Number.isFinite(Number(s.loyal?.[o.name]))
    ? Number(s.loyal[o.name])
    : (Number.isFinite(o.loyal) ? o.loyal : num(base?.LOYAL ?? base?.loyal) || 90);
  const spirit = Number.isFinite(Number(s.morale?.[o.name])) ? Number(s.morale[o.name]) : 80;
  const tire = Number.isFinite(Number(s.tire?.[o.name])) ? Number(s.tire[o.name]) : 0;
  return {
    ...o,
    str: o.str || num(base?.STR),
    int: o.int || num(base?.INT),
    loyal,
    spirit,
    tire,
    statusText: STATUS_TEXT[o.status] || '在職',
    fate: str(s.fate?.[o.name]?.fate),
  };
}

// ---------------------------------------------------------------------------
// §5 R65 月度漂移的存档摘要（公式在 ai_model.monthlyDrift / 0x41B1BF）
// ---------------------------------------------------------------------------
/**
 * 把 `AI.monthlyDrift()` 的回傳记进 `save.drift`，给城详情/势力列表显示「上月漂移」。
 * 原作月度流水线 0x41B1BF 只改数值，**不存摘要**；摘要是本实作给 UI 用的 [新设计]。
 */
export function recordDrift(save, drift, month) {
  const s = saveOf(save);
  const d = drift && typeof drift === 'object' ? drift : {};
  const rec = {
    month: intOr(month, intOr(s.month, 1, 1), 1),
    tireDown: intOr(d.tire?.down, 0, 0),
    spiritDown: intOr(d.spirit?.down, 0, 0),
    spiritUp: intOr(d.spirit?.up, 0, 0),
    spiritSkipped: intOr(d.spirit?.skipped, 0, 0),
    loyalDown: intOr(d.loyal?.down, 0, 0),
    loyalUp: intOr(d.loyal?.up, 0, 0),
    loyalSkipped: intOr(d.loyal?.skipped, 0, 0),
    names: intOr(d.names, 0, 0),
  };
  s.drift = rec;
  return rec;
}

/** 读回摘要；没有 → null */
export function driftSummary(save) {
  const d = saveOf(save).drift;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  return {
    month: intOr(d.month, 0, 0),
    tireDown: intOr(d.tireDown, 0, 0),
    spiritDown: intOr(d.spiritDown, 0, 0),
    spiritUp: intOr(d.spiritUp, 0, 0),
    loyalDown: intOr(d.loyalDown, 0, 0),
    loyalUp: intOr(d.loyalUp, 0, 0),
    names: intOr(d.names, 0, 0),
  };
}

/** 一行的漂移摘要：`5月：疲勞 -3 · 士氣 +2 · 忠誠 +12/-1（18 人）` */
export function driftText(save) {
  const d = driftSummary(save);
  if (!d) return '';
  const bits = [];
  if (d.tireDown) bits.push(`疲勞 -${d.tireDown}`);
  if (d.spiritUp || d.spiritDown) bits.push(`士氣 +${d.spiritUp}/-${d.spiritDown}`);
  if (d.loyalUp || d.loyalDown) bits.push(`忠誠 +${d.loyalUp}/-${d.loyalDown}`);
  if (!bits.length) bits.push('全員無變化');
  return `${monthTag(d.month)}：${bits.join(' · ')}（${d.names} 人）`;
}

/** 第 X 年 Y 月（与 HUD 同口径） */
export function monthTag(month) {
  const m = Math.max(1, intOr(month, 1, 1));
  return `第${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}

// ---------------------------------------------------------------------------
// §6 R75 出兵数上限（复用 deploy.html 的 1..min(等级×5,100) 滑杆口径）
// ---------------------------------------------------------------------------
/**
 * 带兵上限：`min(等级×5, 100)`，与 `deploy.html:323` 的 `SOLDIER_CAP` 完全同口径。
 * 原作带兵上限是 `min(5L,100) + clamp((L−20)×5,0,100)`（0x409FB6/0x409FD8），
 * 但大地图出征页（deploy.html）已经按 min(5L,100) 做滑杆，campaign 側只跟它对齐，
 * 不另造第二套数字。等级 ≤0 → 1。
 */
export function troopCapOf(level) {
  const lv = Math.max(1, intOr(level, 1, 1, 99));
  return Math.max(1, Math.min(lv * 5, 100));
}

/** 战报里残将一行：`殘將 3 人：降 2（甲、乙）/ 在野 1（丙）` */
export function fateText(fates) {
  const list = Array.isArray(fates) ? fates : [];
  if (!list.length) return '殘將 0 人（城中已無武將）';
  const surrender = list.filter((x) => x.fate === FATE.SURRENDER).map((x) => x.name);
  const wild = list.filter((x) => x.fate === FATE.WILD).map((x) => x.name);
  const bits = [];
  if (surrender.length) bits.push(`降 ${surrender.length}（${surrender.join('、')}）`);
  if (wild.length) bits.push(`在野 ${wild.length}（${wild.join('、')}）`);
  return `殘將 ${list.length} 人：${bits.join(' / ')}`;
}
