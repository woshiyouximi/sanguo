/** 旗面寬（web `MARCH_FLAG_W = 11`，campaign.html:1007） */
export const MARCH_FLAG_W = 11;
/** 部隊命中半徑（web `MARCH_HIT_R = 16`，campaign.html:1008；任務要求 ≥14） */
export const MARCH_HIT_R = 16;
/** 重疊部隊錯開間距（web `MARCH_STACK_GAP = 13`，campaign.html:1009） */
export const MARCH_STACK_GAP = 13;
/** 駐紮接觸點容差（web `STATION_EPS = 0.005`，campaign.html:1199） */
export const STATION_EPS = 0.005;
/** 浮點餘裕（web `STATION_SLACK = 1e-9`，campaign.html:1202） */
export const STATION_SLACK = 1e-9;
/** 隨軍武將上限（web `ARMY_MAX_OFFICERS = 5`，campaign.html:1250） */
export const ARMY_MAX_OFFICERS = 5;
/** 進城後守軍上限（web `enterCity()` 的 600，campaign.html:2988） */
export const CITY_TROOP_CAP = 600;
/** 一個月按 30 天折算（web `marchRemain(progress, step, daysPerMonth = 30)`） */
export const ARMY_DAYS_PER_MONTH = 30;
/** `Number` 收斂：非有限值 → fallback */
export function armyNum(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}
/** 夾到 [0,1]；非有限值 → 0（web `marchClamp01`，campaign.html:1011） */
export function armyClamp01(value) {
    const n = Number(value);
    if (!Number.isFinite(n))
        return 0;
    return n < 0 ? 0 : n > 1 ? 1 : n;
}
/**
 * 沿折線按段長等距插值（web `marchLerpPoint`，campaign.html:1020）：
 * 過濾非法點；單點＝該點；`reverse` 時取 `1-t`（從 End 往 Start 走）。
 */
export function armyLerpPoint(points, progress, reverse) {
    const pts = [];
    if (Array.isArray(points)) {
        for (const raw of points) {
            if (!Array.isArray(raw) || raw.length < 2)
                continue;
            const x = Number(raw[0]);
            const y = Number(raw[1]);
            if (Number.isFinite(x) && Number.isFinite(y))
                pts.push([x, y]);
        }
    }
    if (pts.length === 0)
        return [0, 0];
    if (pts.length === 1)
        return pts[0];
    const t = armyClamp01(progress);
    const along = reverse ? 1 - t : t;
    const segs = [];
    let total = 0;
    for (let i = 1; i < pts.length; i += 1) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        segs.push(d);
        total += d;
    }
    if (!(total > 0))
        return pts[0];
    let want = along * total;
    for (let i = 0; i < segs.length; i += 1) {
        const seg = segs[i];
        if (want <= seg || i === segs.length - 1) {
            const k = seg > 0 ? Math.min(1, want / seg) : 0;
            return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
        }
        want -= seg;
    }
    return pts[pts.length - 1];
}
/** 城點座標（`pos_xy`）；查不到 / 值壞 → null */
export function armyCityPos(scenario, name) {
    const cities = Array.isArray(scenario?.cities) ? scenario.cities : [];
    const key = String(name ?? '');
    for (const city of cities) {
        if (!city || String(city.NAME ?? '') !== key)
            continue;
        const pair = Array.isArray(city.pos_xy) ? city.pos_xy : null;
        if (!pair || pair.length < 2)
            return null;
        const x = Number(pair[0]);
        const y = Number(pair[1]);
        return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null;
    }
    return null;
}
function armyPathOf(scenario, army) {
    const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
    const index = Math.trunc(armyNum(army?.pathIndex, -1));
    const path = index >= 0 ? paths[index] : null;
    return path ?? null;
}
/**
 * 部隊在地圖像素座標（web `armyPos`，campaign.html:1148-1161）：
 * 取 `paths[pathIndex].points`；點不夠時用兩端城的 `pos_xy` 兜底；
 * 方向由 `army.from` 決定（from 是 path.End 時反向）。
 */
export function armyPos(scenario, army) {
    const path = armyPathOf(scenario, army);
    if (!path)
        return [0, 0];
    const pts = [];
    if (Array.isArray(path.points)) {
        for (const raw of path.points) {
            if (!Array.isArray(raw) || raw.length < 2)
                continue;
            const x = Number(raw[0]);
            const y = Number(raw[1]);
            if (Number.isFinite(x) && Number.isFinite(y))
                pts.push([x, y]);
        }
    }
    if (pts.length < 2) {
        const start = armyCityPos(scenario, path.Start);
        const end = armyCityPos(scenario, path.End);
        if (start)
            pts.push(start);
        if (end)
            pts.push(end);
    }
    const reverse = army.from === path.End && army.from !== path.Start;
    return armyLerpPoint(pts, army.progress, reverse);
}
/** 一條路走幾個月：`clamp(ceil(Length/100), 1, 3)`（web `marchMonths`，campaign.html:984） */
export function armyMonthsOfLength(length) {
    const n = armyNum(length, 0);
    return Math.min(3, Math.max(1, Math.ceil(n / 100)));
}
/** 部隊所在路的月數；查不到路 → 1（與 web 的 `|| 0` 同效應） */
export function armyMonths(scenario, pathIndex) {
    const paths = Array.isArray(scenario?.paths) ? scenario.paths : [];
    const index = Math.trunc(armyNum(pathIndex, -1));
    const path = index >= 0 ? paths[index] : null;
    return armyMonthsOfLength(path ? path.Length : 0);
}
/**
 * 一個月推進的比例。web `marchStep(pi) = MARCH_PER_MONTH * (3 / marchMonths(pi))`
 * （campaign.html:990）＝ `1 / months`：近路一個月到、遠路三個月到。
 */
export function armyStep(scenario, pathIndex) {
    return 1 / armyMonths(scenario, pathIndex);
}
/** 剩餘路程（web `marchRemain`，campaign.html:1125）：月取一位小數，天按 30 天/月 */
export function armyRemain(progress, step, daysPerMonth = ARMY_DAYS_PER_MONTH) {
    const p = armyClamp01(progress);
    const s = armyNum(step, 0);
    const left = 1 - p;
    const raw = s > 0 ? left / s : 0;
    return {
        progress: p,
        pct: Math.round(p * 100),
        months: Math.round(raw * 10) / 10,
        days: Math.round(raw * daysPerMonth),
    };
}
/** 部隊是否正站在城上：p≤0 → 出發城、p≥1 → 目的城、路上 → `''`（web `marchAtCity`，:1135） */
export function armyAtCity(army) {
    if (!army)
        return '';
    const p = armyClamp01(army.progress);
    if (p <= 0)
        return String(army.from ?? '');
    if (p >= 1)
        return String(army.to ?? '');
    return '';
}
/**
 * 重疊錯開（web `marchStackPlace`，campaign.html:1054）：九宮格按 `minDist` 一格一格試，
 * 與已放好的每一個都拉開 `minDist - 0.001` 以上；九格都撞就疊著不動。
 * 順序＝正右/正左/正下/正上/四個斜角（與 web 完全一致，換順序會讓同一份存檔畫出不同位置）。
 */
export function armyStackPlace(base, minDist = MARCH_STACK_GAP) {
    const gap = armyNum(minDist, MARCH_STACK_GAP) || MARCH_STACK_GAP;
    const offsets = [
        [0, 0],
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
        [1, 1],
        [-1, 1],
        [1, -1],
        [-1, -1],
    ];
    const out = [];
    for (const point of Array.isArray(base) ? base : []) {
        const bx = armyNum(point?.[0], 0);
        const by = armyNum(point?.[1], 0);
        let put = [bx, by];
        for (const off of offsets) {
            const x = bx + off[0] * gap;
            const y = by + off[1] * gap;
            let ok = true;
            for (const prev of out) {
                const dx = prev[0] - x;
                const dy = prev[1] - y;
                if (Math.hypot(dx, dy) < gap - 0.001) {
                    ok = false;
                    break;
                }
            }
            if (ok) {
                put = [x, y];
                break;
            }
        }
        out.push(put);
    }
    return out;
}
/**
 * 圓形最近命中（web `marchHitArmy`，campaign.html:1076）：
 * `d <= r*r && d < best` 才算，同一點上兩支取**列表靠前**那支；沒有 → -1。
 */
export function armyHitIndex(placed, px, py, radius = MARCH_HIT_R) {
    const r = armyNum(radius, MARCH_HIT_R);
    let best = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    const rows = Array.isArray(placed) ? placed : [];
    for (let i = 0; i < rows.length; i += 1) {
        const dx = armyNum(rows[i]?.[0], 0) - armyNum(px, 0);
        const dy = armyNum(rows[i]?.[1], 0) - armyNum(py, 0);
        const distance = dx * dx + dy * dy;
        if (distance <= r * r && distance < bestDistance) {
            bestDistance = distance;
            best = i;
        }
    }
    return best;
}
/**
 * 螢幕列表（web `armyScreenList`，campaign.html:2878）：
 * 過濾無 id 的髒資料 → 逐支算地圖座標 → 交給 `armyStackPlace` 錯開。
 * **繪製與命中都吃這一支函式的回傳值**。
 */
export function armyScreenList(scenario, armies, project) {
    const rows = [];
    for (const army of Array.isArray(armies) ? armies : []) {
        if (army && army.id)
            rows.push(army);
    }
    const base = rows.map((army) => {
        const point = armyPos(scenario, army);
        const screen = project(point[0], point[1]);
        return [armyNum(screen?.x, 0), armyNum(screen?.y, 0)];
    });
    const placed = armyStackPlace(base);
    return rows.map((army, i) => ({ a: army, x: placed[i][0], y: placed[i][1] }));
}
/**
 * 地圖點擊優先級（web campaign.html:3627-3642）：
 *   `if (pickArmyId)` → **只認城**（`hitCity`），部隊與空白都不吃；
 *   否則是 `hitArmy` → `hitCity`。
 * 這支是 onTouch 的唯一判準，純函式所以能直接斷言「選點態 > 部隊 > 城」。
 */
export function resolveMapHit(pickMode, armyIndex, cityIndex) {
    const a = Number.isInteger(armyIndex) ? armyIndex : -1;
    const c = Number.isInteger(cityIndex) ? cityIndex : -1;
    if (pickMode) {
        return c >= 0 ? { kind: 'pick', armyIndex: -1, cityIndex: c } : { kind: 'none', armyIndex: -1, cityIndex: -1 };
    }
    if (a >= 0)
        return { kind: 'army', armyIndex: a, cityIndex: c };
    if (c >= 0)
        return { kind: 'city', armyIndex: -1, cityIndex: c };
    return { kind: 'none', armyIndex: -1, cityIndex: -1 };
}
/* ---------------------------------------------------------------- 駐紮 / 軍師 */
/** 隨軍武將清單：主將第一、去重（web `armyOfficerList`，campaign.html:1224） */
export function armyOfficerList(army) {
    const out = [];
    const push = (value) => {
        const name = typeof value === 'string' ? value.trim() : '';
        if (name && out.indexOf(name) < 0)
            out.push(name);
    };
    if (army && army.general)
        push(army.general);
    const officers = army && Array.isArray(army.officers) ? army.officers : [];
    for (const name of officers)
        push(name);
    return out;
}
/** 軍師可點性：**只看兵團裡有幾個人**，≥2 才可任命（web `armyCanAppointAdvisor`，:1281） */
export function armyCanAppointAdvisor(army) {
    return armyOfficerList(army).length >= 2;
}
/** 現任軍師；不在名單裡（舊檔/被移走）→ `''`（web `armyAdvisorOf`，:1286） */
export function armyAdvisorOf(army) {
    const advisor = army && typeof army.advisor === 'string' ? army.advisor.trim() : '';
    if (!advisor)
        return '';
    return armyOfficerList(army).indexOf(advisor) >= 0 ? advisor : '';
}
/** 任命/免職（web `armySetAdvisor`，:1292）：`''`＝免職返 true，非成員返 false 且不改值 */
export function armySetAdvisor(army, name) {
    if (!army)
        return false;
    const want = typeof name === 'string' ? name.trim() : '';
    if (!want) {
        army.advisor = '';
        return true;
    }
    if (armyOfficerList(army).indexOf(want) < 0)
        return false;
    army.advisor = want;
    return true;
}
/** 駐紮中（web `armyIsStationed`，:1302）：只有嚴格 `true` 才算 */
export function armyIsStationed(army) {
    return Boolean(army) && army.stationed === true;
}
/**
 * 舊檔補欄位（web `normalizeArmyExtras`，campaign.html:1205，冪等）：
 * `officers` 陣列化並把主將 unshift 到最前；`advisor` 不在名單就清 `''`；
 * `stationed = (=== true)`。Cocos 這支在 `GameState.normalizeArmies()` 裡呼叫。
 */
export function normalizeArmyExtras(army) {
    if (!army || typeof army !== 'object')
        return null;
    const general = typeof army.general === 'string' ? army.general.trim() : '';
    const names = [];
    const raw = Array.isArray(army.officers) ? army.officers : [];
    for (const value of raw) {
        const name = typeof value === 'string' ? value.trim() : '';
        if (name && names.indexOf(name) < 0)
            names.push(name);
    }
    if (general) {
        const at = names.indexOf(general);
        if (at >= 0)
            names.splice(at, 1);
        names.unshift(general);
    }
    army.officers = names.slice(0, ARMY_MAX_OFFICERS);
    const advisor = typeof army.advisor === 'string' ? army.advisor.trim() : '';
    army.advisor = advisor && army.officers.indexOf(advisor) >= 0 ? advisor : '';
    army.stationed = army.stationed === true;
    army.reported = army.reported === true;
    return army;
}
/**
 * 隨軍名單（web `armyRosterPick`，campaign.html:1259）：
 * 主將第一 → 出陣順序裡屬於本城名冊的人 → 名冊補齊 → 上限。
 */
export function armyRosterPick(queueNames, rosterNames, general, max = ARMY_MAX_OFFICERS) {
    const cap = Math.max(1, Math.trunc(armyNum(max, ARMY_MAX_OFFICERS)));
    const out = [];
    const add = (value) => {
        const name = typeof value === 'string' ? value.trim() : '';
        if (!name || out.length >= cap || out.indexOf(name) >= 0)
            return;
        out.push(name);
    };
    add(general);
    const roster = [];
    for (const value of Array.isArray(rosterNames) ? rosterNames : []) {
        const name = typeof value === 'string' ? value.trim() : '';
        if (name)
            roster.push(name);
    }
    const inRoster = (value) => roster.indexOf(String(value ?? '').trim()) >= 0;
    for (const value of Array.isArray(queueNames) ? queueNames : []) {
        if (inRoster(value))
            add(value);
    }
    for (const name of roster)
        add(name);
    return out;
}
/** 同一路段（web `marchSameLeg`，:1307）：from/to 相同或互換，否則比 pathIndex */
export function armySameLeg(a, b) {
    if (!a || !b)
        return false;
    if (a.from === b.from && a.to === b.to)
        return true;
    if (a.from === b.to && a.to === b.from)
        return true;
    return Math.trunc(armyNum(a.pathIndex, -1)) === Math.trunc(armyNum(b.pathIndex, -2));
}
/**
 * 推進上限（web `stationProgressLimit`，campaign.html:1326）：
 * 同陣營 / 對方沒駐紮 / 不同段 / 對方不在路上 → 1（不受限）；
 * 相向 → `clamp01(1 - pb - STATION_EPS)`（**接觸點**）；同向且我還沒超過他 → `clamp01(pb - STATION_EPS)`。
 */
export function stationProgressLimit(mover, blocker) {
    if (!mover || !blocker || mover === blocker)
        return 1;
    if (mover.side === blocker.side)
        return 1;
    if (!armyIsStationed(blocker))
        return 1;
    if (!armySameLeg(mover, blocker))
        return 1;
    const pm = armyClamp01(mover.progress);
    const pb = armyClamp01(blocker.progress);
    if (!(pb > 0 && pb < 1))
        return 1;
    const opposite = mover.from === blocker.to && mover.to === blocker.from;
    if (opposite)
        return armyClamp01(1 - pb - STATION_EPS);
    if (pm < pb)
        return armyClamp01(pb - STATION_EPS);
    return 1;
}
/**
 * 一個月的推進計畫（web `planArmyMoves`，campaign.html:1346）：
 *   · 駐紮 / 已到城下 → 凍結（`frozen = stationed`）；
 *   · 否則取所有 blocker 裡最小的 limit，`next = want > limit ? max(p, limit) : want`
 *     ——**不後退、不超車**（campaign.html:1367）；
 *   · `blockedBy` 只在「真的被夾住」時才寫。
 */
export function planArmyMoves(list, stepOf) {
    const rows = [];
    for (const army of Array.isArray(list) ? list : []) {
        if (army && army.id)
            rows.push(army);
    }
    const moves = [];
    for (const army of rows) {
        const p = armyClamp01(army.progress);
        const frozen = armyIsStationed(army);
        if (frozen || p >= 1) {
            moves.push({ a: army, from: p, want: p, next: p, frozen, blockedBy: null });
            continue;
        }
        const step = Math.max(0, armyNum(stepOf(army), 0));
        const want = armyClamp01(p + step);
        let limit = 1;
        let blocker = null;
        for (const other of rows) {
            if (other === army)
                continue;
            const candidate = stationProgressLimit(army, other);
            if (candidate < limit) {
                limit = candidate;
                blocker = other;
            }
        }
        const next = want > limit ? Math.max(p, limit) : want;
        moves.push({
            a: army,
            from: p,
            want,
            next,
            frozen: false,
            blockedBy: blocker && next < want ? blocker.id : null,
        });
    }
    return moves;
}
/** 對峙配對鍵（web `stationPairKey`，:1377） */
export function stationPairKey(blocker, mover) {
    return `${blocker?.id ?? ''}>${mover?.id ?? ''}`;
}
/**
 * 駐紮對峙（web `stationStandoff`，campaign.html:1388）：
 * 駐紮方 0<ps<1、敵對、同段、推進方沒駐紮且 0<pm<1；
 * 相向判 `|pm - (1-ps)| <= EPS + SLACK`，同向判 `0 <= ps - pm <= EPS + SLACK`。
 */
export function stationStandoff(list) {
    const rows = [];
    for (const army of Array.isArray(list) ? list : []) {
        if (army && army.id)
            rows.push(army);
    }
    for (const blocker of rows) {
        if (!armyIsStationed(blocker))
            continue;
        const ps = armyClamp01(blocker.progress);
        if (!(ps > 0 && ps < 1))
            continue;
        for (const mover of rows) {
            if (mover === blocker || mover.side === blocker.side)
                continue;
            if (armyIsStationed(mover))
                continue;
            if (!armySameLeg(mover, blocker))
                continue;
            const pm = armyClamp01(mover.progress);
            if (!(pm > 0 && pm < 1))
                continue;
            const opposite = mover.from === blocker.to && mover.to === blocker.from;
            const ok = opposite
                ? Math.abs(pm - (1 - ps)) <= STATION_EPS + STATION_SLACK
                : ps - pm >= 0 && ps - pm <= STATION_EPS + STATION_SLACK;
            if (ok)
                return { blocker, mover };
        }
    }
    return null;
}
/**
 * 改道校驗（web `marchRetargetCheck`，campaign.html:1100）—— 六條拒絕文案逐字照它：
 * 「沒有選中兵團。」/「敵軍兵團不能變更目的。」/「沒有選中城市。」/
 * 「兵團的目的地已經是 X。」/「目的城不能是出發城 X：部隊要回城請用『進入城內』。」/
 * 「X 到 Y 沒有可行道路：兵團只能改為與出發城相鄰的城。」/「Y 是我方城池：本作兵團只能開往敵城或空城。」
 */
export function armyRetargetCheck(army, to, pathOf, isMine) {
    if (!army)
        return { ok: false, why: '沒有選中兵團。' };
    if (army.side !== 'A')
        return { ok: false, why: '敵軍兵團不能變更目的。' };
    const dest = typeof to === 'string' ? to.trim() : '';
    if (!dest)
        return { ok: false, why: '沒有選中城市。' };
    if (dest === army.to)
        return { ok: false, why: `兵團的目的地已經是 ${dest}。` };
    if (dest === army.from) {
        return { ok: false, why: `目的城不能是出發城 ${army.from}：部隊要回城請用「進入城內」。` };
    }
    const pathIndex = pathOf(army.from, dest);
    if (pathIndex === null || pathIndex === undefined || !Number.isFinite(Number(pathIndex))) {
        return { ok: false, why: `${army.from} 到 ${dest} 沒有可行道路：兵團只能改為與出發城相鄰的城。` };
    }
    if (isMine(dest))
        return { ok: false, why: `${dest} 是我方城池：本作兵團只能開往敵城或空城。` };
    return { ok: true, pathIndex: Number(pathIndex) };
}
/** 進入城內可點性（web `canEnterCity`，campaign.html:2974） */
export function armyCanEnterCity(army, isMine) {
    if (!army)
        return { ok: false, why: '沒有選中兵團。' };
    const at = armyAtCity(army);
    if (!at)
        return { ok: false, why: '部隊在路途中，不在城上' };
    if (!isMine(at))
        return { ok: false, why: `${at} 不是我方城池，不能進城` };
    return { ok: true, city: at };
}
/**
 * 5 項兵團指令（web `renderArmySheet()` 的 `cmd(...)` 五條，campaign.html:3020-3035）。
 * 可點性與灰字**逐字**照 web：這是「逐項可用性」唯一的真值來源，面板與斷言都吃它。
 */
export function armyCmdRows(army, isMine) {
    const own = army?.side === 'A';
    const stationed = armyIsStationed(army);
    const p = armyClamp01(army?.progress);
    const onRoad = p > 0 && p < 1;
    const advisorName = armyAdvisorOf(army);
    const officers = armyOfficerList(army);
    const enter = armyCanEnterCity(army, isMine);
    return [
        {
            act: 'general',
            label: '武將資料',
            hint: army?.general ? `${army.general} 的數值` : '沒有主將',
            enabled: Boolean(army?.general),
            primary: false,
        },
        {
            act: 'retarget',
            label: '變更目的',
            hint: own ? '點相鄰敵城改道' : '敵軍兵團不可用',
            enabled: own,
            primary: own,
        },
        {
            act: 'station',
            label: '部隊駐紮',
            hint: own
                ? stationed
                    ? '駐紮中：再點一次解除'
                    : '駐紮：停在路上、阻擋敵軍'
                : '敵軍兵團不可用',
            enabled: own && (stationed || onRoad),
            primary: false,
        },
        {
            act: 'advisor',
            label: '任命軍師',
            hint: own
                ? officers.length < 2
                    ? '軍團僅主將一人，無可任命'
                    : advisorName
                        ? `現任 ${advisorName} · 點此更換`
                        : `從 ${officers.length} 名隨軍武將裡選`
                : '敵軍兵團不可用',
            enabled: own && armyCanAppointAdvisor(army),
            primary: false,
        },
        {
            act: 'enter',
            label: '進入城內',
            hint: enter.ok ? `併入 ${enter.city} 守軍` : (enter.why ?? ''),
            enabled: enter.ok,
            primary: false,
        },
    ];
}
/**
 * 7 行軍情（web `armyInfoRows`，campaign.html:2949-2972）—— 順序與文字逐字照原作：
 * 主將 / 軍師 / 目的地 / 武將數 / 兵數 / 金錢 / 目前所在地形。
 */
export function armyInfoRows(army, ctx) {
    const leader = army?.general || '—';
    const level = army?.general && ctx.levelOf ? ctx.levelOf(army.general) : 0;
    const at = armyAtCity(army);
    const place = at ? `城（${at}）` : '平原（路上）';
    const advisorName = armyAdvisorOf(army);
    const advisorSeq = advisorName && ctx.wiseSeqOf ? ctx.wiseSeqOf(advisorName) : 0;
    const advisorHint = advisorSeq && ctx.wiseHintOf ? ctx.wiseHintOf(advisorSeq) || '軍師技' : '未學軍師技';
    const officers = armyOfficerList(army);
    const gold = Math.round(armyNum(ctx.gold, 0));
    return [
        ['主將', army?.general ? `${leader} Lv${level}` : '—（無主將）'],
        ['軍師', advisorName ? `${advisorName} · ${advisorHint}` : `${leader}（主將兼） · 未任命`],
        ['目的地', `${army?.to ?? ''} · ${armyNum(ctx.months, 1)} 個月`],
        ['武將數', `${officers.length}${officers.length > 1 ? ` · ${officers.join('、')}` : ''}`],
        ['兵數', `${Math.round(armyNum(army?.troops, 0))}`],
        ['金錢', `${gold.toLocaleString('en-US')} · 勢力共用`],
        [
            '目前所在地形',
            armyIsStationed(army) ? `${place} · 駐紮中（進度凍結）` : place,
        ],
    ];
}
