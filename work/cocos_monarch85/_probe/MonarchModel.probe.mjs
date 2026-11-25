/**
 * MonarchModel.ts — 君主 / 勢力 / 滅亡·繼承·漂移 的**純邏輯**（Cocos / 微信版）。
 *
 * 移植自 `game/web/monarch_model.js`（616 行：R4 君主 / R78 勢力·滅亡·繼承 /
 * R65 漂移展示 / R75 帶兵上限），另把 `game/web/saves.js:113-186` 的**勢力色板**
 * 一併搬過來（大地圖城點要按勢力分色，見 §7）與 `saves.js:1030-1046` 的開局播種（§8）。
 *
 * ## 對外契約（`work/cocos_monarch84/parity.mjs` 逐字段對拍）
 * · **同名導出、同算法、同 seed 同結果**：本檔所有函數都只讀寫傳進來的 `save` /
 *   參數物件，不讀時鐘、不讀隨機數、不讀 localStorage、不 import `cc`；
 * · 因此它既能在 Cocos 裡跑，也能被 node 直接 import（對拍用）。
 *
 * ## 為什麼不 import 'cc'、不碰 GameState.ts
 * 1. 對拍要在 node 裡把 web 的 `monarch_model.js` 與本檔並排跑，任何引擎依賴都會擋住；
 * 2. `GameState.normalize()` 是**白名單**（未知鍵全丟），君主欄位塞進去會被喫掉。
 *    所以 Cocos 側照 `CityPanel.ts` 的先例另開補丁鍵 `sanguo_monarch_v1`
 *    （見 `MonarchPanel.ts` 的 `MONARCH_EXTRAS_KEY` 與 project/106 §5），
 *    本檔只關心「傳進來的 save 物件長什麼樣」，不關心它存在哪。
 *
 * ## 原作依據（docs/04c_世界與內政.md）
 * · `0x40975E` 君主不可俘（R55）→ 君主只有**陣亡**與**讓位**兩條退場路徑；
 * · `city + 0x10` = 該城所屬君主編號（0 = 空城），見 04c:129 / :339；
 * · 玩家君主編號 `0x4A64F0`（04c:342）；
 * · 劇本 `KING` 段只有 NAME / FLAGNUM（04c:327），**沒有國號** —— 群英傳 2 的「勢力」
 *   就是君主本人，所以勢力 id 取初代君主名，繼承時**只換君主、不換勢力 id**；
 * · 武將 `+0x91` STATUS：1 登用 / 2 俘虜 / 8 在野（04c:223）、`+0xBF` LOYAL 忠誠（04c:229）。
 *
 * ⚠️ 資料陷阱（必須記住）：`generals.json` 的 `Force` / `UseForce` 是**兵種適性**
 *   （刀/弓/槍/鐵/飛/錬/賊/武…），不是「武將所屬勢力」。真正的效忠對象是 `LoyalKing`
 *   （docs/04c:304，`%s\KING`），但 401 條裡只有 24 條非空（家臣/同族）。所以：
 *     1) 勢力的「武將列表」以**運行時駐城**為準（武將駐在誰的城 → 歸於誰的勢力）；
 *     2) `LoyalKing` 只作**同族/家臣**的證據，用在繼承與殘將處置上。
 *   `Force` 欄位一律不讀（`normOfficer` 只認 `loyalKing` / `LoyalKing`）。
 */
/* =====================================================================
 * §0 常量 / 型別 / 小工具
 * =================================================================== */
/** 原作地址與字段偏移（報告引用用；本檔不讀二進制） */
export const MONARCH_SRC = Object.freeze({
    KING_UNCATCHABLE: '0x40975E', // R55：君主不可俘
    CITY_OWNER: 0x10, // city+0x10 所屬君主
    PLAYER_KING: '0x4A64F0', // 玩家君主編號
    LOYAL: 0xbf, // 武將忠誠
    STATUS: 0x91, // 武將狀態
    STATUS_EMPLOYED: 1, // 登用
    STATUS_CAPTIVE: 2, // 俘虜
    STATUS_WILD: 8, // 在野
    LOYAL_KING: 'LoyalKing', // generals.json 的效忠對象（不是 Force）
    /**
     * 殘將去留的忠誠門檻。原作招降公式未定位（04c:312 只給了消息串），
     * 這裡按「低忠誠願降、高忠誠/同族不事二主」取 60。等級：[推測]
     */
    LOYAL_SURRENDER: 60,
});
/** 殘將歸宿 */
export const FATE = Object.freeze({ SURRENDER: 'surrender', WILD: 'wild' });
/** 歸宿中文（戰報/UI 共用） */
export const FATE_TEXT = Object.freeze({ surrender: '投降', wild: '在野' });
/** 狀態碼 ↔ 中文 */
export const STATUS_TEXT = Object.freeze({
    登: '在職',
    俘: '俘虜',
    野: '在野',
});
/** 復姓表：同姓判定要先喫掉兩個字，否則「公孫越」會被當成「公」姓 */
const COMPOUND = Object.freeze([
    '公孫', '司馬', '夏侯', '諸葛', '皇甫', '歐陽', '太史', '上官', '令狐', '尉遲',
    '長孫', '宇文', '獨孤', '慕容', '呼延', '端木', '西門', '東方', '南宮', '萬俟',
    '聞人', '澹臺', '公冶', '宗政', '濮陽', '淳于', '單于', '太叔', '申屠', '仲孫',
    '軒轅', '鐘離', '鮮于', '閭丘', '司徒', '司空', '司寇', '子車', '顓孫', '巫馬',
    '公西', '漆雕', '樂正', '壤駟', '公良', '拓跋', '夾谷', '宰父', '穀梁', '段干',
    '百里', '東郭', '南門', '羊舌', '微生', '梁丘', '左丘', '東門', '南榮', '第五',
]);
/** 非數組物件才算存檔；其餘一律當空物件（與 web `saveOf` 同口徑） */
function saveOf(save) {
    return save !== null && typeof save === 'object' && !Array.isArray(save) ? save : {};
}
/** 非數組物件 → 記錄；null/原始值/數組 → null */
function objOf(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value
        : null;
}
/** 只有真字串才算；其餘 → ''（與 web `str` 同口徑，**不做** String() 轉換） */
export function str(value) {
    return typeof value === 'string' ? value : '';
}
/** 有限數 → 原值，其餘 → 0（`Number('')` = 0，與 web 一致） */
export function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
/** 有限數 → trunc + clamp；非有限 → fallback */
export function intOr(value, fallback, min = -Infinity, max = Infinity) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return fallback;
    return Math.min(max, Math.max(min, Math.trunc(n)));
}
/** 城條目 → 城名（web 兩處寫法不同：forceRoster 只認 `NAME`，讓位候選還收裸字串） */
function cityNameOf(city) {
    return str(objOf(city)?.NAME);
}
/* =====================================================================
 * §1 君主是誰：monarch / force / king 三個欄位的分工
 * =================================================================== */
/**
 * 當前君主（武將名）。`save.monarch` 是新字段；老檔沒有就退回 `save.king`。
 * 繼承/讓位只改 monarch，不動 king。
 */
export function monarchOf(save) {
    const s = saveOf(save);
    return str(s.monarch) || str(s.king);
}
/**
 * 勢力 id（= 城 owner 裡存的那個名字）。`save.force` 是新字段；老檔退回 `save.king`。
 * 勢力 id 一旦開局就**不再變**：繼承只換君主，勢力名/顏色/城池都不動。
 */
export function forceIdOf(save) {
    const s = saveOf(save);
    return str(s.force) || str(s.king);
}
/** 勢力顯示名：勢力 id 就是名（群英傳 2 沒有國號）；勢力已亡則保留原名 */
export function forceNameOf(save) {
    return forceIdOf(save);
}
/**
 * 開局 / 補登：一次寫齊 monarch / force / monarchSince / king。
 *   · 新遊戲：king = 劇本 KING 的君主名，monarch = 同一個名字，force = 同一個名字。
 *   · 老檔補登：同樣按 owned 裡最常見的 KING 補。
 * `opts.force` 只在「繼承後仍沿用舊勢力 id」時顯式傳入（見 inheritForce）。
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
        if (opts.keepKing !== true)
            s.king = '';
        return { ok: true, monarch: '', force: '', since: month, prev, changed: Boolean(prev) };
    }
    const force = str(opts.force) || name;
    s.monarch = name;
    s.force = force;
    s.monarchSince = month;
    if (opts.keepKing !== true)
        s.king = force;
    return { ok: true, monarch: name, force, since: month, prev, changed: prev !== name };
}
/**
 * 讓位（大地圖上「換君主」的合法動作）。勢力不變，只換君主與即位月。
 * 原作判定點未定位（04c §2.1 只給了君主編號的存放位置），「讓位」本身是任務書 R4 要求
 * 的大地圖動作，等級：[新設計]（合法性受 UI 限制：只能從本勢力在職武將裡選）。
 */
export function abdicate(save, heir, opts = {}) {
    const s = saveOf(save);
    const to = str(heir);
    const from = monarchOf(s);
    const force = forceIdOf(s);
    const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
    if (!to)
        return { ok: false, reason: 'no-heir', from, force, month };
    if (!from)
        return { ok: false, reason: 'no-monarch', from, force, month };
    if (to === from)
        return { ok: false, reason: 'same', from, force, month };
    s.monarch = to;
    s.monarchSince = month;
    const f = objOf(objOf(s.forces)?.[force]);
    if (force && f)
        f.king = to;
    return { ok: true, from, to, force, month, reason: 'abdicate' };
}
/**
 * 繼承：勢力 id 不變（城 owner / 旗色 / 勢力名全部沿用），只把 forces[force].king
 * 與（若是我方勢力）save.monarch 換成繼任者。
 * 原作繼承規則未定位，繼任者由 pickSuccessor 按「同族 > 忠誠 > 能力」選，[推測]。
 */
export function inheritForce(save, forceId, heir, opts = {}) {
    const s = saveOf(save);
    const id = str(forceId);
    const to = str(heir);
    const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
    if (!id || !to)
        return { ok: false, reason: 'bad-args', force: id, heir: to, month };
    if (!objOf(s.forces))
        s.forces = {};
    const forces = objOf(s.forces);
    if (!objOf(forces[id])) {
        forces[id] = { id, king: id, flag: 0, alive: true, cities: [], ts: 0 };
    }
    const f = objOf(forces[id]);
    f.king = to;
    f.alive = true;
    if (typeof f.endedAt === 'number')
        delete f.endedAt;
    const isPlayer = id === forceIdOf(s);
    if (isPlayer) {
        s.monarch = to;
        s.monarchSince = month;
    }
    return { ok: true, force: id, heir: to, month, player: isPlayer, reason: 'inherit' };
}
/* =====================================================================
 * §2 繼承人選：同族 > 忠誠 > 能力
 * =================================================================== */
/** 姓：復姓優先，否則首字。沒有名字 → '' */
export function clanOf(name) {
    const n = str(name);
    if (!n)
        return '';
    for (const c of COMPOUND)
        if (n.startsWith(c))
            return c;
    return n.slice(0, 1);
}
/** 同姓（同族）。「公孫瓚 / 公孫越」→ true；「孫堅 / 孫策」→ true；「曹操 / 曹仁」→ true */
export function sameClan(a, b) {
    const x = clanOf(a);
    const y = clanOf(b);
    return Boolean(x) && x === y;
}
/**
 * 武將狀態歸一：accept `{name,status,loyal,...}` 或 generals.json 原始行。
 * 缺 status 時按「登用」處理（garrison.json 的在野武將會明確寫 '野'）。
 */
export function normOfficer(raw) {
    if (raw === null || raw === undefined)
        return null;
    if (typeof raw === 'string') {
        const name = raw.trim();
        return name ? { name, str: 0, int: 0, loyal: null, status: '登', loyalKing: '', constancy: 0 } : null;
    }
    if (typeof raw !== 'object')
        return null;
    const r = raw;
    const name = str(r.name) || str(r.NAME);
    if (!name)
        return null;
    const loy = r.loyal ?? r.Loyal ?? r.LOYAL;
    return {
        name,
        str: num(r.str ?? r.STR),
        int: num(r.int ?? r.INT),
        loyal: Number.isFinite(Number(loy)) ? Number(loy) : null,
        // 只認 LoyalKing；**絕不讀 Force**（那是兵種適性）
        loyalKing: str(r.loyalKing) || str(r.LoyalKing),
        status: normStatus(r.status ?? r.Status),
        constancy: num(r.constancy ?? r.CONSTANCY),
    };
}
/**
 * [OFFICER_OBJ] 武將清單的相容入口：`unknown` 進、`Officer[]` 出。
 *
 * 同一支函式被兩條來源餵，形狀不一致：
 *   · 數組 —— `['張飛','關羽']`（更早的 `GameState.CityRuntime.officers` 是 `string[]`）或
 *     `[{name,str,int,loyal,status}]`（現在的物件陣列 / garrison.json 的 officers）；
 *   · 記錄 —— `{ 城名: [武將] }`（`opts.officersByCity` 整表被誤傳進來的保底處理）。
 * 逐項只走 `normOfficer()`：它已經同時吃字串與物件、認 `NAME/STR/LOYAL` 大寫別名，
 * 這裡只負責「把外面的形狀拍平」，不再重複一套清洗規則。
 *
 * `dedupe` 預設 true（同名只留第一次）：城內同名在資料層就是異常；
 * 繼承/讓位候選那幾條要保持「同名不同狀態各看各的」的舊行為，傳 false。
 */
export function officerListOf(raw, dedupe = true) {
    const out = [];
    const seen = new Set();
    const push = (item) => {
        const o = normOfficer(item);
        if (!o)
            return;
        if (dedupe) {
            if (seen.has(o.name))
                return;
            seen.add(o.name);
        }
        out.push(o);
    };
    if (Array.isArray(raw)) {
        for (const item of raw)
            push(item);
    }
    else {
        const rec = objOf(raw);
        if (rec) {
            for (const key of Object.keys(rec)) {
                const list = rec[key];
                if (Array.isArray(list))
                    for (const item of list)
                        push(item);
            }
        }
    }
    return out;
}
/** 狀態歸一：數字 2/8 與中文「登/俘/野」都收；其餘按在職 */
export function normStatus(value) {
    if (typeof value === 'number') {
        if (value === MONARCH_SRC.STATUS_CAPTIVE)
            return '俘';
        if (value === MONARCH_SRC.STATUS_WILD)
            return '野';
        return '登';
    }
    const v = str(value).trim();
    if (!v)
        return '登';
    if (v.includes('俘') || v.includes('虜') || v.includes('虏'))
        return '俘';
    if (v.includes('野') || v.includes('未'))
        return '野';
    return '登';
}
/** 在職（登用）才算候選人 */
export function isEmployed(officer) {
    const rec = objOf(officer);
    return normStatus(rec ? (rec.status ?? rec.Status) : undefined) === '登';
}
/**
 * 繼承評分：同族 2 分 > 同姓 1 分（clanOf 已合併兩種情況），其次忠誠，再其次 STR+INT。
 * 回傳 `{ score, clan, blood, loyal, power }`；score 越大越優先。
 */
export function successionScore(officer, deadKing) {
    const o = normOfficer(officer);
    if (!o)
        return null;
    const dead = str(deadKing);
    const clan = dead ? sameClan(o.name, dead) : false;
    // 同族（包含 LoyalKing 明確寫著效忠舊主）優先；沒有族親才看忠誠
    const blood = clan ? 2 : o.loyalKing && dead && o.loyalKing === dead ? 1 : 0;
    const loyal = o.loyal !== null && Number.isFinite(o.loyal) ? o.loyal : 90;
    return { score: blood * 10000 + loyal * 100 + o.str + o.int, clan, blood, loyal, power: o.str + o.int };
}
/**
 * 繼承候選（已排序）。排除：已死者本人、**現任君主**、俘虜、在野、盜賊模板。
 * 原作繼承規則未定位（04c 只給了君主編號的存放位置），本排序是 [推測]。
 *
 * `opts.king` = 現任君主。以前只排 `dead`，於是「死的其實是城裡的太守、現任君主還活著」時
 * 現任君主自己會被選成繼任者 → 戰報出現「X 陣亡：X 繼位」（project/89 / project/93 §3）。
 * 現在把現任君主也排掉：無論調用方傳的 `dead` 是誰，活著的君主都不會被「繼承」自己。
 */
export function successionList(forceId, officers, opts = {}) {
    const dead = str(opts.dead) || str(forceId);
    const sitting = str(opts.king);
    // [OFFICER_OBJ] 字串（舊檔）/ 物件（現在的存檔、garrison）都吃；不去重，交給下面的 seen 判。
    const list = officerListOf(officers, false);
    const out = [];
    const seen = new Set();
    for (const o of list) {
        if (o.name === dead || (sitting && o.name === sitting) || o.name === '盜賊' || seen.has(o.name))
            continue;
        if (!isEmployed(o))
            continue;
        const sc = successionScore(o, dead);
        if (!sc)
            continue;
        out.push({ ...o, ...sc });
        seen.add(o.name);
    }
    out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return out;
}
/** 繼任者名字；沒有 → ''（勢力滅亡） */
export function pickSuccessor(forceId, officers, opts = {}) {
    const list = successionList(forceId, officers, opts);
    return list.length ? list[0].name : '';
}
/**
 * 讓位候選：本勢力**在職**武將裡排除現任君主，按同一套評分排序。
 * `officersByCity` = `{城: [武將]}`；只取 `opts.cities`（預設該勢力現有城）裡的武將。
 */
export function abdicateCandidates(save, opts = {}) {
    const s = saveOf(save);
    const sCities = objOf(s.cities);
    const ownerOf = typeof opts.ownerOf === 'function' ? opts.ownerOf : (n) => str(objOf(sCities?.[n])?.owner);
    const cities = Array.isArray(opts.cities) ? opts.cities : [];
    const byCity = opts.officersByCity && typeof opts.officersByCity === 'object' ? opts.officersByCity : {};
    const force = forceIdOf(s);
    const cur = monarchOf(s);
    const seen = new Set();
    const out = [];
    for (const c of cities) {
        const name = cityNameOf(c) || str(c);
        if (!name || ownerOf(name) !== force)
            continue;
        // [OFFICER_OBJ] 每城一份清單：字串/物件都收，跨城用 seen 去重。
        const list = officerListOf(byCity[name], false);
        if (!list.length)
            continue;
        for (const o of list) {
            if (o.name === cur || o.name === '盜賊' || seen.has(o.name))
                continue;
            if (!isEmployed(o))
                continue;
            const sc = successionScore(o, cur);
            if (!sc)
                continue;
            out.push({ ...o, ...sc, city: name });
            seen.add(o.name);
        }
    }
    out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return out;
}
/**
 * 殘將歸宿：低忠誠願降（`LOYAL_SURRENDER` 以下），高忠誠或同族/家臣 → 在野。
 * 原作「招降」按 LOYAL/CONSTANCY 判定（04c:312），具體式子未定位 → 門檻 60 是 [推測]。
 */
export function decideFate(officer, opts = {}) {
    const o = normOfficer(officer);
    if (!o)
        return FATE.WILD;
    const loyal = o.loyal !== null && Number.isFinite(o.loyal) ? o.loyal : intOr(opts.loyal, 90, 0, 100);
    const limit = intOr(opts.limit, MONARCH_SRC.LOYAL_SURRENDER, 0, 100);
    const clan = Boolean(o.loyalKing) && sameClan(o.loyalKing, o.name);
    if (clan)
        return FATE.WILD; // 同族不事二主
    return loyal < limit ? FATE.SURRENDER : FATE.WILD;
}
/**
 * 勢力滅亡：標 forces.alive=false / cities=[] / endedAt，結算殘將歸宿寫進 `save.fate`。
 * **不碰城池歸屬**（那是 AI.extinguishForce / 破城代碼的事，本函數保持純記錄）。
 * 我方勢力滅亡時清空 monarch/force（頂欄回「未選」）。
 */
export function extinguish(save, forceId, opts = {}) {
    const s = saveOf(save);
    const id = str(forceId);
    const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
    const empty = {
        ok: false,
        force: id,
        month,
        fates: [],
        surrender: [],
        wild: [],
        reason: 'no-force',
    };
    if (!id)
        return empty;
    if (!objOf(s.forces))
        s.forces = {};
    const forces = objOf(s.forces);
    if (!objOf(forces[id])) {
        forces[id] = { id, king: id, flag: 0, alive: true, cities: [], ts: 0 };
    }
    const f = objOf(forces[id]);
    if (f.alive === false) {
        return { ...empty, ok: true, reason: 'already-dead', fates: [] };
    }
    f.alive = false;
    f.cities = [];
    f.endedAt = month;
    const dead = str(opts.dead);
    const officers = officerListOf(opts.officers, false).filter((o) => o.name !== dead);
    if (!objOf(s.fate))
        s.fate = {};
    const fateMap = objOf(s.fate);
    const fates = [];
    for (const o of officers) {
        const fate = decideFate(o);
        fates.push({ name: o.name, fate, loyal: o.loyal, force: id, month });
        fateMap[o.name] = { fate, force: id, month };
    }
    const surrender = fates.filter((x) => x.fate === FATE.SURRENDER).map((x) => x.name);
    const wild = fates.filter((x) => x.fate === FATE.WILD).map((x) => x.name);
    if (id === forceIdOf(s)) {
        // 我方勢力滅亡：頂欄回「未選」。king 也清空 —— 否則 monarchOf 會從 king 回退出一個死人名字。
        s.monarch = '';
        s.force = '';
        s.king = '';
        s.monarchSince = month;
    }
    return { ok: true, force: id, month, fates, surrender, wild, reason: 'extinct' };
}
/**
 * 君主陣亡的統一入口（城內陣亡 / 城破被殺）。**純邏輯**，不搬城。
 *   1) 還有城（`opts.remaining > 0`）且選得出繼任者 → inheritForce 續命（勢力名/旗/城不變）。
 *   2) 沒城、或選不出繼任者 → extinguish（殘將按 Loyal/LoyalKing 定去留）。
 * `opts.officers` 傳該勢力（或那座城）的在職武將；`opts.remaining` 傳「除失守城之外還剩幾城」。
 * 原作「君主死 = 勢力滅還是繼承」未定位，本規則 [推測]；0x40975E 只證明君主不會被俘。
 */
export function kingDeath(save, forceId, opts = {}) {
    const s = saveOf(save);
    const id = str(forceId);
    const month = intOr(opts.month, intOr(s.month, 1, 1), 1);
    const out = {
        dead: false,
        force: id,
        heir: '',
        extinct: false,
        fates: [],
        month,
        reason: '',
    };
    if (!id)
        return { ...out, reason: 'no-force' };
    const f0 = objOf(objOf(s.forces)?.[id]);
    if (f0 && f0.alive === false)
        return { ...out, reason: 'already-dead' };
    // 現任君主：forces[id].king 沒有就退回勢力 id（開國君主 = 勢力 id）
    const sitting = str(f0?.king) || id;
    const dead = str(opts.dead) || sitting;
    // 死者必須是現任君主。campaign.html 的 kingFell() 拿的是「失守城的太守」，
    // 那未必是君主 —— 以前不校驗，於是太守死了卻觸發「君主繼承」，
    // 還把活著的君主選成繼任者，戰報就成了「嚴白虎 君主陣亡：嚴白虎 繼位」
    // （project/89 / project/93 §3）。這裡直接判「沒人死」。
    if (dead !== sitting) {
        return { ...out, dead: false, reason: 'not-monarch', deadName: dead, monarch: sitting };
    }
    const remaining = Number.isFinite(Number(opts.remaining)) ? Number(opts.remaining) : null;
    const officers = officerListOf(opts.officers, false);
    // 繼任者裡把現任君主也排掉（他現在是「死者」，本來就該死）——見 successionList 的 opts.king
    const heir = remaining === 0 ? '' : pickSuccessor(id, officers, { dead, king: sitting });
    if (heir) {
        inheritForce(s, id, heir, { month });
        return { ...out, dead: true, heir, deadName: dead, reason: 'inherit' };
    }
    const ex = extinguish(s, id, { month, officers, dead });
    return { ...out, dead: true, extinct: true, deadName: dead, fates: ex.fates, reason: 'extinct' };
}
/**
 * 把「城 + 歸屬函數 + 各城武將」聚合成勢力表。
 *   `opts.cities`        全部城（scenarios.json 的 cities）
 *   `opts.ownerOf(name)` 當前歸屬（campaign 傳 forceAt，預設讀 save.cities[name].owner）
 *   `opts.officersByCity` {城: [武將]}（campaign 傳 garrison.json 的守將）
 *
 * 回傳每項：`{id, name, monarch, flag, alive, player, cities[], officers[], cityCount,
 *            officerCount, endedAt, surrenderCount}`，已排序（我方 → 存續 → 城多）。
 * 聲明存續但 0 城的勢力按**滅亡**算（checkForceDeaths 的同一口徑）。
 */
export function forceRoster(save, opts = {}) {
    const s = saveOf(save);
    const allCities = Array.isArray(opts.cities) ? opts.cities : [];
    const sCities = objOf(s.cities);
    const ownerOf = typeof opts.ownerOf === 'function' ? opts.ownerOf : (n) => str(objOf(sCities?.[n])?.owner);
    const byCity = opts.officersByCity && typeof opts.officersByCity === 'object' ? opts.officersByCity : {};
    const player = forceIdOf(s);
    const forcesRec = objOf(s.forces);
    const fateRec = objOf(s.fate);
    const rows = new Map();
    const ensure = (id) => {
        const key = str(id);
        if (!key)
            return null;
        const hit = rows.get(key);
        if (hit)
            return hit;
        const f = objOf(forcesRec?.[key]);
        const declared = f ? f.alive !== false : true;
        const row = {
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
        };
        rows.set(key, row);
        return row;
    };
    if (forcesRec)
        for (const id of Object.keys(forcesRec))
            ensure(id);
    if (player)
        ensure(player);
    for (const c of allCities)
        ensure(ownerOf(cityNameOf(c)));
    for (const row of rows.values()) {
        for (const c of allCities) {
            const n = cityNameOf(c);
            if (!n || ownerOf(n) !== row.id)
                continue;
            row.cities.push(n);
            // [OFFICER_OBJ] 城內武將：字串（舊檔）/ 物件（現在）/ `{城:[武將]}` 整表都認。
            const list = officerListOf(byCity[n], false);
            for (const o of list) {
                if (row.officers.some((x) => x.name === o.name))
                    continue;
                row.officers.push(o);
            }
        }
        row.cityCount = row.cities.length;
        row.officerCount = row.officers.filter((o) => o.status === '登').length;
        row.surrenderCount = row.officers.filter((o) => str(objOf(fateRec?.[o.name])?.fate) === FATE.SURRENDER).length;
        row.alive = row.declared && row.cityCount > 0;
    }
    // Array.from 而不是 `[...rows.values()]`：Creator 的 Babel loose 会把 spread 编成 [].concat。
    const list = Array.from(rows.values());
    list.sort((a, b) => Number(b.player) - Number(a.player) ||
        Number(b.alive) - Number(a.alive) ||
        b.cityCount - a.cityCount ||
        a.id.localeCompare(b.id));
    return list;
}
/** 武將的當前狀態（存檔覆蓋 generals.json）：忠誠/士氣/疲勞 + 殘將歸宿 */
export function officerStatus(save, officer, row) {
    const s = saveOf(save);
    const o = normOfficer(officer);
    if (!o)
        return null;
    const base = objOf(row);
    const loyalMap = objOf(s.loyal);
    const moraleMap = objOf(s.morale);
    const tireMap = objOf(s.tire);
    const fateMap = objOf(s.fate);
    const loyalRaw = loyalMap?.[o.name];
    const loyal = Number.isFinite(Number(loyalRaw))
        ? Number(loyalRaw)
        : o.loyal !== null && Number.isFinite(o.loyal)
            ? o.loyal
            : num(base?.LOYAL ?? base?.loyal) || 90;
    const moraleRaw = moraleMap?.[o.name];
    const spirit = Number.isFinite(Number(moraleRaw)) ? Number(moraleRaw) : 80;
    const tireRaw = tireMap?.[o.name];
    const tire = Number.isFinite(Number(tireRaw)) ? Number(tireRaw) : 0;
    return {
        ...o,
        str: o.str || num(base?.STR),
        int: o.int || num(base?.INT),
        loyal,
        spirit,
        tire,
        statusText: STATUS_TEXT[o.status] || '在職',
        fate: str(objOf(fateMap?.[o.name])?.fate),
    };
}
/** 單勢力的武將明細（含忠誠/士氣/疲勞與殘將歸宿），勢力列表點開用。 */
export function forceDetail(save, forceId, opts = {}) {
    const s = saveOf(save);
    const id = str(forceId);
    const roster = forceRoster(s, {
        cities: opts.cities,
        ownerOf: opts.ownerOf,
        officersByCity: opts.officersByCity,
    });
    const row = roster.find((x) => x.id === id) ?? null;
    if (!row)
        return null;
    const rowOf = typeof opts.rowOf === 'function' ? opts.rowOf : () => null;
    const detail = row;
    detail.officers = row.officers.map((o) => officerStatus(s, o, rowOf(o.name)));
    return detail;
}
/**
 * 把 `AI.monthlyDrift()` 的回傳記進 `save.drift`，給城詳情/勢力列表顯示「上月漂移」。
 * 原作月度流水線 0x41B1BF 只改數值，**不存摘要**；摘要是本實作給 UI 用的 [新設計]。
 */
export function recordDrift(save, drift, month) {
    const s = saveOf(save);
    const d = objOf(drift) ?? {};
    const tire = objOf(d.tire);
    const spirit = objOf(d.spirit);
    const loyal = objOf(d.loyal);
    const rec = {
        month: intOr(month, intOr(s.month, 1, 1), 1),
        tireDown: intOr(tire?.down, 0, 0),
        spiritDown: intOr(spirit?.down, 0, 0),
        spiritUp: intOr(spirit?.up, 0, 0),
        spiritSkipped: intOr(spirit?.skipped, 0, 0),
        loyalDown: intOr(loyal?.down, 0, 0),
        loyalUp: intOr(loyal?.up, 0, 0),
        loyalSkipped: intOr(loyal?.skipped, 0, 0),
        names: intOr(d.names, 0, 0),
    };
    s.drift = rec;
    return rec;
}
/** 讀回摘要；沒有 → null */
export function driftSummary(save) {
    const d = saveOf(save).drift;
    if (!d || typeof d !== 'object' || Array.isArray(d))
        return null;
    const rec = d;
    return {
        month: intOr(rec.month, 0, 0),
        tireDown: intOr(rec.tireDown, 0, 0),
        spiritDown: intOr(rec.spiritDown, 0, 0),
        spiritUp: intOr(rec.spiritUp, 0, 0),
        loyalDown: intOr(rec.loyalDown, 0, 0),
        loyalUp: intOr(rec.loyalUp, 0, 0),
        names: intOr(rec.names, 0, 0),
    };
}
/** 一行的漂移摘要：`第1年5月：疲勞 -3 · 士氣 +2/-1 · 忠誠 +12/-1（18 人）` */
export function driftText(save) {
    const d = driftSummary(save);
    if (!d)
        return '';
    const bits = [];
    if (d.tireDown)
        bits.push(`疲勞 -${d.tireDown}`);
    if (d.spiritUp || d.spiritDown)
        bits.push(`士氣 +${d.spiritUp}/-${d.spiritDown}`);
    if (d.loyalUp || d.loyalDown)
        bits.push(`忠誠 +${d.loyalUp}/-${d.loyalDown}`);
    if (!bits.length)
        bits.push('全員無變化');
    return `${monthTag(d.month)}：${bits.join(' · ')}（${d.names} 人）`;
}
/** 第 X 年 Y 月（與 HUD 同口徑） */
export function monthTag(month) {
    const m = Math.max(1, intOr(month, 1, 1));
    return `第${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}
/* =====================================================================
 * §6 R75 出兵數上限（復用 deploy 的 1..min(等級×5,100) 滑桿口徑）
 * =================================================================== */
/**
 * 帶兵上限：`min(等級×5, 100)`，與 `deploy.html:323` 的 `SOLDIER_CAP` 完全同口徑。
 * 原作帶兵上限是 `min(5L,100) + clamp((L−20)×5,0,100)`（0x409FB6/0x409FD8），
 * 但大地圖出征頁（deploy.html）已經按 min(5L,100) 做滑桿，campaign 側只跟它對齊，
 * 不另造第二套數字。等級 ≤0 → 1。
 */
export function troopCapOf(level) {
    const lv = Math.max(1, intOr(level, 1, 1, 99));
    return Math.max(1, Math.min(lv * 5, 100));
}
/** 戰報裡殘將一行：`殘將 3 人：降 2（甲、乙）/ 在野 1（丙）` */
export function fateText(fates) {
    const list = Array.isArray(fates) ? fates : [];
    if (!list.length)
        return '殘將 0 人（城中已無武將）';
    const surrender = list.filter((x) => str(objOf(x)?.fate) === FATE.SURRENDER).map((x) => str(objOf(x)?.name));
    const wild = list.filter((x) => str(objOf(x)?.fate) === FATE.WILD).map((x) => str(objOf(x)?.name));
    const bits = [];
    if (surrender.length)
        bits.push(`降 ${surrender.length}（${surrender.join('、')}）`);
    if (wild.length)
        bits.push(`在野 ${wild.length}（${wild.join('、')}）`);
    return `殘將 ${list.length} 人：${bits.join(' / ')}`;
}
export const FORCE_PALETTE = Object.freeze([
    { force: '公孫瓚', color: '#6E8FBF' }, // 白馬義從：冷藍灰
    { force: '劉焉', color: '#B98A3E' }, // 益州：土黃褐
    { force: '張角', color: '#C9A82E' }, // 黃巾：芥黃
    { force: '韓馥', color: '#8E6BA8' }, // 冀州：紫
    { force: '龔景', color: '#4F8F8B' }, // 青灰
    { force: '喬玄', color: '#7C8A48' }, // 橄欖
    { force: '何進', color: '#B14A3B' }, // 大將軍：朱紅
    { force: '董卓', color: '#6B6F76' }, // 西涼：鐵灰
    { force: '孫堅', color: '#D0803C' }, // 江東：亮橙
    { force: '陶謙', color: '#4F9A6E' }, // 徐州：玉綠
    { force: '孔岫', color: '#3F6E9A' }, // 靛青
    { force: '丁原', color: '#8C6248' }, // 并州：磚棕
    { force: '劉繇', color: '#7A6FB0' }, // 揚州：青蓮
    { force: '嚴白虎', color: '#5E7D5A' }, // 吳郡：苔綠
]);
/** 備色（劇本 2 的 18 家 / 以後新增勢力用；與上面 14 條不重複） */
export const FORCE_RESERVE = Object.freeze([
    '#4A8D9E', '#9E4F6E', '#6E8E3A', '#8A5FA0', '#3E6F5A', '#A0603A', '#5A6E8E',
    '#8E8A3A', '#6E4A6E', '#3A7F8E', '#8E6E4A', '#4A6E5A', '#7A4A4A', '#5A8A6E',
]);
/** 無主 / 空城的顏色（中性灰，不參與勢力分色） */
export const FORCE_COLOR_NEUTRAL = '#8A8478';
/** 玩家勢力金環（大地圖畫城點用） */
export const FORCE_GOLD = '#EFC978';
/** 城點深色描邊（1px 級，壓在底圖上防被喫掉） */
export const FORCE_EDGE = '#080C10';
const FORCE_FIXED = new Map(FORCE_PALETTE.map((e, i) => [e.force, i]));
/** FNV-1a（32 位）：只求「同名同色」，不追求雪崩質量 */
function forceHash(name) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < name.length; i += 1) {
        h ^= name.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    return h;
}
/**
 * 勢力 → 色板下標：0..13＝固定 14 家，14..27＝備色，-1＝無主/非法。
 * 劇本 1 的 14 家全部落在 0..13（web tests 裡有斷言）。
 */
export function forceColorIndex(force) {
    if (typeof force !== 'string')
        return -1;
    const name = force.trim(); // 前後空白不算不同勢力（存檔裡 monarch 有時帶空白）
    if (!name)
        return -1;
    const fixed = FORCE_FIXED.get(name);
    if (fixed !== undefined)
        return fixed;
    return FORCE_PALETTE.length + (forceHash(name) % FORCE_RESERVE.length);
}
/** 勢力 → `'#RRGGBB'`（空/非法 → 中性灰）。純函數，不讀存檔。 */
export function forceColorOf(force) {
    const i = forceColorIndex(force);
    if (i < 0)
        return FORCE_COLOR_NEUTRAL;
    return i < FORCE_PALETTE.length ? FORCE_PALETTE[i].color : FORCE_RESERVE[i - FORCE_PALETTE.length];
}
/** 當前存檔裡「有城的勢力」及其顏色（圖例用；順序＝城列表裡第一次出現的順序） */
export function forceColorMap(cityNames, forceOf) {
    const out = {};
    const list = Array.isArray(cityNames) ? cityNames : [];
    const fn = typeof forceOf === 'function' ? forceOf : () => '';
    for (const name of list) {
        const f = fn(str(name));
        if (typeof f !== 'string' || !f || out[f])
            continue;
        out[f] = forceColorOf(f);
    }
    return out;
}
/**
 * 新開局播種：`king / monarch / force = 開國君主名`，`monarchSince = 1`，
 * `forces = {}`、`fate = {}`、`drift = null`。
 *
 * 開國君主取「owned 裡第一座 KING 為非空字串的城」的 KING —— 與 web `newCampaign`
 * （`saves.js:1033-1043`）逐字同口徑：劇本 1/2 的前三城是「襄平(空)→北平(公孫瓚)」，
 * 所以玩家開局就是公孫瓚。`[推測]`：原作沒有「玩家選勢力」的存檔欄位，
 * web 這一條是實作決定（docs/03c 的 KING.SELECT 沒被用到）。
 *
 * @returns 播種後的君主名（空字串 = 劇本裡前三城都沒 KING，UI 顯示「未選」）
 */
export function seedMonarch(save, cities, opts = {}) {
    const s = saveOf(save);
    const list = Array.isArray(cities) ? cities : [];
    const owned = Array.isArray(s.owned) ? s.owned : [];
    let seedKing = typeof opts.king === 'string' ? opts.king : '';
    if (!seedKing) {
        for (const n of owned) {
            const name = str(n);
            const city = list.find((x) => cityNameOf(x) === name);
            const king = str(objOf(city)?.KING);
            if (king) {
                seedKing = king;
                break;
            }
        }
    }
    s.king = seedKing;
    s.monarch = seedKing;
    s.force = seedKing; // 勢力 id（= 開國君主，繼承後不變）
    s.monarchSince = 1;
    s.forces = {}; // R78 勢力表：由 refreshForces() 反建（旗/城/存續）
    s.fate = {}; // R78 殘將歸宿 {武將名:{fate,force,month}}
    s.drift = null; // R65 上個月度漂移摘要（公式在 ai_model.monthlyDrift）
    seedCityOwners(s, list);
    return seedKing;
}
/**
 * 把「劇本 KING → 城歸屬」落到存檔與執行期城對象上。
 *
 * 為什麼需要它：`forceRoster()` / `forceColorOf()` / 君主卡片的「名下城數」全都按
 * `save.cities[城].owner` 聚合。新開局時 Cocos 的城對象只有 troops/pop/money
 * （`GameState.normalize()` 的白名單），owner 是空的 ⇒ 勢力一覽顯示「0 家」、
 * 君主卡片「名下城數 0」而頁頭卻寫「城 3」。web 側是 `saves.js` 建檔時就寫了 owner，
 * Cocos 缺這一步。只補空值，不覆蓋 AI/佔領寫過的值。
 */
export function seedCityOwners(save, cities) {
    const s = saveOf(save);
    const list = Array.isArray(cities) ? cities : [];
    const bag = objOf(s.cities);
    const rec = bag || {};
    let filled = 0;
    for (const c of list) {
        const o = objOf(c);
        const name = cityNameOf(c);
        if (!name)
            continue;
        const king = str(o?.KING);
        const row = objOf(rec[name]);
        const cur = str(o?.owner) || str(row?.owner);
        const owner = cur || king;
        if (!owner)
            continue;
        if (!cur)
            filled += 1;
        if (o)
            o.owner = owner;
        rec[name] = { ...(row || {}), owner };
    }
    s.cities = rec;
    return filled;
}
