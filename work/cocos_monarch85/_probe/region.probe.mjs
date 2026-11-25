import * as M from './MonarchModel.probe.mjs';
/** 保留最近 N 條：web 是 8 條（campaign.html:2574 `if(len>8) slice(-8)`）。 */
export const BATTLE_LOG_MAX = 8;
/** 戰報落盤鍵（GameState 是白名單存檔，加不了欄位；換場景後戰報要還在） */
export const BATTLE_LOG_KEY = 'sanguo_battlelog_v1';
/** 君主座位（garrison.json 的 major === 君主那座城） */
export const MONARCH_SEAT_KEY = 'sanguo_monarch_seat_v1';
/** 玩家勢力已滅亡（1 = 死了；新開局清掉） */
export const MONARCH_EXTINCT_KEY = 'sanguo_monarch_extinct_v1';
/** 從存檔字串還原時把 `k` 收斂回合法值 */
export function logKindOf(value) {
    if (value === 'atk' || value === 'hold' || value === 'lost' || value === 'win' || value === 'year')
        return value;
    return 'info';
}
/**
 * 戰報面板（設計座標 750×1334，左上原點）：v18-cocos-layout 從「浮在地圖右下角」搬到
 * **地圖下方的獨立區域**（對齊 web 的 `#logbox` 0,961 750×196）：
 *
 *   地圖區底邊 830 → 戰報 842–1140（718×298）→ 月令按鈕 1152–1248
 *
 * 舊值是 `{x:392, y:786, w:336, h:234}`，浮在地圖右下角、壓住桂陽/廬陵/義州三座城。
 * 標題列仍可點折疊（`logHit()` 不變），但折疊只收起行、面板高度不變 → 不會在控制台挖洞。
 */
export const LOG_VIEW = { x: 16, y: 842, w: 718, h: 298 };
/** 折疊後的高度（保留給 `logHit()`；v18 起面板恆為 LOG_VIEW.h，折疊只收行） */
export const LOG_BAR_H = 62;
/** 標題列高度（含金線）。**必須是 28**：`cocos_monarch85/probe.mjs` 用 L.y+28 → header、
 * L.y+29 → body 兩條斷言把這個值釘死了（改它會讓探針紅）。 */
export const LOG_HEAD_H = 28;
/** 行高（8 行 × 30 = 240，加 28 標題列 = 268 < 298 面板高） */
export const LOG_ROW_H = 30;
/** 第一行的中心 y（標題列之下；標題列 28，行高 30 → 中心 48 時行頂 33，留 5px 縫） */
export const LOG_ROW_TOP = 48;
/** 戰報浮層命中：`header`（折疊鈕）/ `body`（吃點擊，避免點到浮層下面的城）/ ''。 */
export function logHit(x, y, collapsed) {
    if (x < LOG_VIEW.x || x > LOG_VIEW.x + LOG_VIEW.w)
        return '';
    const h = collapsed ? LOG_BAR_H : LOG_VIEW.h;
    if (y < LOG_VIEW.y || y > LOG_VIEW.y + h)
        return '';
    return y <= LOG_VIEW.y + LOG_HEAD_H ? 'header' : 'body';
}
/** `stamp(month)`：`${年}年${月}月`，month 從 1 起算（web campaign.html:2569）。 */
export function monthStamp(month) {
    const raw = Math.trunc(Number(month));
    const m = Number.isFinite(raw) && raw > 0 ? raw : 1;
    return `${Math.floor((m - 1) / 12) + 1}年${((m - 1) % 12) + 1}月`;
}
/**
 * 戰報文字顏色（web `.logrow.atk/.hold/.lost/.year`）。
 * `win`/`info` 在 web 沒有專屬色，這裡回 ''，呼叫方用主題的 `COLORS.text`。
 */
export function logColor(kind) {
    if (kind === 'atk')
        return '#E8A08C';
    if (kind === 'hold')
        return '#7FD1A8';
    if (kind === 'lost')
        return '#E08A7A';
    if (kind === 'year')
        return '#F0D48A';
    return '';
}
function logStr(value) {
    if (typeof value === 'string')
        return value.trim();
    if (typeof value === 'number' && Number.isFinite(value))
        return String(value);
    return '';
}
function logNum(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
}
function logCap(max) {
    const n = Math.trunc(Number(max));
    return Number.isFinite(n) && n > 0 ? n : BATTLE_LOG_MAX;
}
/** 環形緩衝：追加一條並裁到最近 `max` 條。回傳新陣列，不改入參。 */
export function battleLogPush(buf, line, max = BATTLE_LOG_MAX) {
    const cap = logCap(max);
    const size = buf.length + 1;
    const from = size > cap ? size - cap : 0;
    const next = [];
    for (let i = from; i < buf.length; i += 1) {
        const item = buf[i];
        if (item)
            next.push(item);
    }
    next.push(line);
    return next;
}
/** 取最近 `max` 條，**最新在前**（web `renderLog()` 是 `slice(-8).reverse()`）。 */
export function battleLogTail(buf, max = BATTLE_LOG_MAX) {
    const cap = logCap(max);
    const from = Math.max(0, buf.length - cap);
    const out = [];
    for (let i = buf.length - 1; i >= from; i -= 1) {
        const item = buf[i];
        if (item)
            out.push(item);
    }
    return out;
}
export function battleLogAppend(buf, lines, max = BATTLE_LOG_MAX) {
    let next = buf.slice();
    for (let i = 0; i < lines.length; i += 1) {
        const line = lines[i];
        if (line)
            next = battleLogPush(next, line, max);
    }
    return next;
}
export function battleLogLine(month, s, k) {
    return { t: monthStamp(month), s: s, k: k };
}
/**
 * `runMapAi()` 的結果 → 戰報行（三類，全部來自 AiRunner 的回報）：
 *   ① 出兵：`out.incoming`（AiRunner.ts:102-112）→「某勢力 出兵 某城」
 *   ② 易手：`out.battles[].captured`（AiRunner.ts:115-127）→「某城 易手」
 *   ③ 陣亡：`out.log` 裡的「陣亡 / 滅亡」行（AiRunner.ts:519-522、:541-545）+ `out.gone`
 * `out.log[0]` 的月報頭已經在頁面提示條，這裡跳過。
 */
export function battleLogFromAi(out, max = BATTLE_LOG_MAX) {
    const lines = [];
    if (!out)
        return lines;
    const t = monthStamp(out.month);
    const incoming = Array.isArray(out.incoming) ? out.incoming : [];
    for (let i = 0; i < incoming.length; i += 1) {
        const row = incoming[i];
        if (!row)
            continue;
        const to = logStr(row.to);
        if (!to)
            continue;
        const force = logStr(row.force) || '敵軍';
        const from = logStr(row.from);
        const troops = Math.max(0, Math.trunc(logNum(row.troops)));
        const tail = from ? `（自 ${from} · ${troops} 兵）` : `（${troops} 兵）`;
        lines.push({ t: t, k: 'atk', s: `${force} 出兵 ${to}${tail}` });
    }
    const battles = Array.isArray(out.battles) ? out.battles : [];
    for (let i = 0; i < battles.length; i += 1) {
        const bt = battles[i];
        if (!bt || bt.skipped)
            continue;
        const to = logStr(bt.to);
        if (!to)
            continue;
        const def = Math.max(0, Math.trunc(logNum(bt.defenders)));
        if (bt.captured) {
            const who = logStr(bt.attacker) || logStr(bt.force) || '敵軍';
            lines.push({ t: t, k: 'win', s: `${to} 易手：${who} 破城（守 ${def} 兵）` });
        }
        else {
            const from = logStr(bt.from);
            lines.push({ t: t, k: 'lost', s: `${from || logStr(bt.force)} 攻 ${to} 敗退（守 ${def} 兵）` });
        }
    }
    const log = Array.isArray(out.log) ? out.log : [];
    for (let i = 0; i < log.length; i += 1) {
        const text = logStr(log[i]);
        if (!text)
            continue;
        if (text.indexOf('月 報') >= 0)
            continue;
        if (text.indexOf('陣亡') >= 0 || text.indexOf('滅亡') >= 0)
            lines.push({ t: t, k: 'lost', s: text });
    }
    const gone = Array.isArray(out.gone) ? out.gone : [];
    for (let i = 0; i < gone.length; i += 1) {
        const id = logStr(gone[i]);
        if (!id)
            continue;
        let dup = false;
        for (let j = 0; j < lines.length; j += 1) {
            const s = lines[j] ? lines[j].s : '';
            if (s.indexOf(id) >= 0 && s.indexOf('滅亡') >= 0) {
                dup = true;
                break;
            }
        }
        if (!dup)
            lines.push({ t: t, k: 'lost', s: `${id} 勢力滅亡：名下已無城池` });
    }
    const cap = logCap(max);
    return lines.length > cap ? lines.slice(lines.length - cap) : lines;
}
/**
 * 戰報緩衝上限（**不是**面板一頁的行數）。[新設計]
 *
 * web 的 `save.log` 只留 8 條（campaign.html:2574 `if(len>8) slice(-8)`），更早的月份
 * 直接丟掉，所以既沒有「本月」分組也翻不了頁。Cocos 這裡把緩衝放寬到 40 條（= 5 頁），
 * 面板仍舊 8 行一頁（`BATTLE_LOG_MAX` 不動：它是面板行數，也是探針斷言），多出來的
 * 部分靠 `battleLogPage()` 翻。落盤鍵與 `battleLogTail()` 預設上限都不受影響。
 */
export const BATTLE_LOG_KEEP = 40;
/** 組頭文字：最新一組標「本月」，更早的只寫年月 */
export function battleLogMonthTitle(stamp, newest) {
    const t = logStr(stamp) || '未記年月';
    return newest ? `▼ 本月 · ${t}` : `▼ ${t}`;
}
/**
 * 把整份緩衝編排成「月份分組 + 分頁」的列。[新設計]（web 只有 `slice(-8).reverse()`）
 *
 *   ① 同一個 `t`（`monthStamp()` 的年月標記）的**連續**幾條歸一組，組頭佔一列；
 *   ② 每頁 `per` 列（預設 `BATTLE_LOG_MAX` = 8），翻頁按列走、不按組走 —— 一組比一頁
 *      還長就從中間斷頁，下一頁續排（組頭只出現在「組的第一列」所在那頁）；
 *   ③ `page` 夾在 `[0, pages-1]`（負數 → 0，超出 → 最後一頁）；
 *   ④ 最新的一組排最前（與 `battleLogTail()` 的「最新在上」一致）。
 *
 * `currentMonth` 是「現在幾月」：最新一組正好是這個月才標「本月」，否則（跨月了但本月
 * 還沒打仗）只寫年月 —— 不然會把上個月的戰事說成本月。
 */
export function battleLogPage(buf, page, per = BATTLE_LOG_MAX, currentMonth = 0) {
    const size = logCap(per);
    const total = buf.length;
    const now = Math.trunc(logNum(currentMonth));
    const curStamp = now > 0 ? monthStamp(now) : '';
    // 先按「連續同 t」切組。倒著走 → 最新的一組在最前，組內 start/end 仍是 buf 的正序
    const groups = [];
    for (let i = total - 1; i >= 0; i -= 1) {
        const line = buf[i];
        if (!line)
            continue;
        const last = groups.length > 0 ? groups[groups.length - 1] : null;
        if (last && last.start === i + 1 && last.t === line.t)
            last.start = i;
        else
            groups.push({ t: line.t, start: i, end: i + 1 });
    }
    const all = [];
    for (let gi = 0; gi < groups.length; gi += 1) {
        const g = groups[gi];
        if (!g)
            continue;
        const newest = gi === 0 && (!curStamp || curStamp === g.t);
        all.push({ t: '', s: battleLogMonthTitle(g.t, newest), k: 'year', month: true });
        for (let i = g.end - 1; i >= g.start; i -= 1) {
            const line = buf[i];
            if (!line)
                continue;
            all.push({ t: line.t, s: line.s, k: line.k, month: false });
        }
    }
    const pages = Math.max(1, Math.ceil(all.length / size));
    const want = Math.trunc(logNum(page));
    const at = want < 0 ? 0 : want >= pages ? pages - 1 : want;
    const from = at * size;
    return { rows: all.slice(from, from + size), page: at, pages: pages, from: from };
}
/**
 * 戰報翻頁鈕（畫在標題列右側；`drawBattleLog()` 的底板與 `logPrev`/`logNext` 兩個 Label
 * 共用同一份矩形）。標題列高 28（`LOG_HEAD_H`），鈕高 22 居中 → y 起點 4；兩顆不重疊，
 * 也不壓到左邊的標題字（標題最長「戰 報 · 共 40 條 · 5/5 頁 ▾」約 430px < 596）。
 */
export const LOG_PAGE_PREV = { x: LOG_VIEW.x + LOG_VIEW.w - 112, y: LOG_VIEW.y + 4, w: 44, h: 22 };
export const LOG_PAGE_NEXT = { x: LOG_VIEW.x + LOG_VIEW.w - 52, y: LOG_VIEW.y + 4, w: 44, h: 22 };
/** 翻頁鈕命中：-1 = 上一頁、1 = 下一頁、0 = 沒中（折疊時沒有行，不給翻） */
export function logPageHit(x, y, collapsed) {
    if (collapsed)
        return 0;
    const inRect = (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    if (inRect(LOG_PAGE_PREV))
        return -1;
    if (inRect(LOG_PAGE_NEXT))
        return 1;
    return 0;
}
/**
 * 君主陣亡要怎麼辦（純判斷，不碰存檔）。[新設計]
 *
 * web 沒有這一步：`kingFell()`（campaign.html:3247-3286）對 AI 與玩家用同一支，直接
 * 自動繼承（`MM.kingDeath`）。Cocos 的玩家側要「先彈窗、玩家點完再落地」，所以把判斷
 * 抽成純函數，`checkMonarchDeath()` 只負責照 `kind` 做副作用 —— 這樣
 * `work/cocos_monarch_ui/succession_assert.mjs` 能直接測，不必起 cc。
 *
 *   pending   → 已經有一個繼承窗在等玩家（`successionState !== null`）→ 不要再彈
 *   extinct   → 玩家勢力上一輪已滅亡 → 永久不再判（否則刷一次頁面就復活一個君主）
 *   no-city   → 0 城：繼承沒有意義（`M.kingDeath` 的 `remaining===0` 也是直接滅亡），
 *               而且 `EndingPanel.showIfEnded()` 會彈滿屏結局，再彈繼承窗是兩個窗疊著
 *   alive     → 君主座位沒丟（`detectMonarchDeath()` 回 ''）→ 什麼都不做
 *   king-dead → 有城、君主死了 → 彈「選繼承人」（有沒有候選由 `successionStart()` 判）
 */
export function planMonarchDeath(dead, remaining, pending, extinct) {
    const name = logStr(dead);
    const left = Math.max(0, Math.trunc(logNum(remaining)));
    if (pending)
        return { kind: 'none', dead: name, remaining: left, reason: 'pending' };
    if (extinct)
        return { kind: 'none', dead: name, remaining: left, reason: 'extinct' };
    if (left === 0)
        return { kind: 'ending', dead: name, remaining: 0, reason: 'no-city' };
    if (!name)
        return { kind: 'none', dead: '', remaining: left, reason: 'alive' };
    return { kind: 'prompt', dead: name, remaining: left, reason: 'king-dead' };
}
/**
 * 與檔案上方的 `lighten()` 同一份算法；放進 region 是為了讓探針能單獨編譯
 * （region 不引用 region 之外的東西）。`lighten()` 已經改成呼叫它，避免兩份實作漂移。
 */
export function tintLighten(hex, k) {
    const n = Number.parseInt(hex.replace('#', ''), 16);
    const to = (c) => Math.round(c + (255 - c) * k);
    const r = to((n >> 16) & 0xff);
    const g = to((n >> 8) & 0xff);
    const b = to(n & 0xff);
    return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
export function cityTintOf(owner, playerForce) {
    const force = logStr(owner);
    const isPlayer = Boolean(force) && force === logStr(playerForce);
    const color = M.forceColorOf(force);
    return {
        color: color,
        glowAlpha: isPlayer ? 120 : 78,
        ringColor: M.FORCE_GOLD,
        ringAlpha: isPlayer ? 235 : 0,
        ringWidth: 2,
        labelColor: isPlayer ? M.FORCE_GOLD : force ? tintLighten(color, 0.42) : '',
        isPlayer: isPlayer,
    };
}
/** 從「城 → 守將」攤平出某勢力的在職武將（含城名）。`force` 傳 '' 表示不過濾。 */
export function successionOfficers(cities, ownerOf, officersByCity, force) {
    const want = logStr(force);
    const out = [];
    for (let i = 0; i < cities.length; i += 1) {
        const city = logStr(cities[i]);
        if (!city)
            continue;
        if (want && logStr(ownerOf(city)) !== want)
            continue;
        const raw = officersByCity(city);
        if (!Array.isArray(raw))
            continue;
        for (let j = 0; j < raw.length; j += 1) {
            const o = M.normOfficer(raw[j]);
            if (!o)
                continue;
            out.push({
                name: o.name,
                city: city,
                str: o.str,
                int: o.int,
                loyal: o.loyal,
                loyalKing: o.loyalKing,
                status: o.status,
                constancy: o.constancy,
            });
        }
    }
    return out;
}
/** 候選＝`M.successionList`（同族 > 忠誠 > 武智）＋所在城。 */
export function successionCandidates(force, officers, dead, king) {
    const list = M.successionList(force, officers, { dead: dead, king: king });
    const cityOf = {};
    for (let i = 0; i < officers.length; i += 1) {
        const o = officers[i];
        if (!o || cityOf[o.name])
            continue;
        cityOf[o.name] = o.city;
    }
    const out = [];
    for (let i = 0; i < list.length; i += 1) {
        const e = list[i];
        if (!e)
            continue;
        out.push({
            name: e.name,
            city: cityOf[e.name] || '',
            str: e.str,
            int: e.int,
            loyal: e.loyal,
            clan: Boolean(e.clan),
            score: e.score,
        });
    }
    return out;
}
/** 開彈窗前的純計算：有候選 → prompt，否則 extinct。不改存檔。 */
export function successionStart(args) {
    const force = logStr(args.force);
    const dead = logStr(args.dead);
    const rawMonth = Math.trunc(logNum(args.month));
    const month = rawMonth > 0 ? rawMonth : 1;
    const remaining = Math.max(0, Math.trunc(logNum(args.remaining)));
    const king = logStr(args.king) || dead;
    const officers = args.officers.slice();
    const candidates = remaining > 0 ? successionCandidates(force, officers, dead, king) : [];
    return {
        phase: candidates.length > 0 ? 'prompt' : 'extinct',
        force: force,
        dead: dead,
        month: month,
        remaining: remaining,
        candidates: candidates,
        officers: officers,
        selected: 0,
    };
}
/** 彈窗要顯示的純文字（MonarchPanel 只負責排版，不重算規則）。 */
export function successionView(state) {
    if (!state) {
        return { title: '君主陣亡', sub: '', rows: [], hint: '', extinct: true };
    }
    const extinct = state.phase === 'extinct';
    const rows = [];
    for (let i = 0; i < state.candidates.length; i += 1) {
        const c = state.candidates[i];
        if (!c)
            continue;
        const clan = c.clan ? ' · 同族' : '';
        const city = c.city ? `　駐 ${c.city}` : '';
        rows.push({ text: `${c.name}${clan}　武 ${c.str} · 智 ${c.int} · 忠 ${c.loyal}${city}`, tone: 'cand', name: c.name });
    }
    if (extinct) {
        const left = state.remaining > 0 ? `還有 ${state.remaining} 城無主` : '名下已無城池';
        rows.push({ text: `殘將散去 · ${left}`, tone: 'note', name: '' });
        rows.push({ text: '確定：勢力滅亡', tone: 'confirm', name: '' });
    }
    return {
        title: extinct ? '君主陣亡 · 勢力滅亡' : '君主陣亡 · 選繼承人',
        sub: `勢力 ${state.force || '—'} · 陣亡 ${state.dead || '—'}（${monthStamp(state.month)}）`,
        rows: rows,
        hint: extinct ? '沒有可繼位的武將，只能就此落幕' : '點一位武將立為新君',
        extinct: extinct,
    };
}
/**
 * 玩家點選後落地：prompt → `M.inheritForce`（換君主、勢力 id 不變）；
 * extinct → `M.extinguish`（alive=false + 殘將歸宿，我方清空 monarch/force）。
 * 這兩支合起來等於 `M.kingDeath` 的兩條分支（差別只在「先彈窗、後落地」）。
 */
export function successionLand(save, state, pick) {
    if (!state) {
        return { ok: false, heir: '', extinct: false, force: '', month: 1, reason: 'no-state', fates: [], line: '', kind: 'info' };
    }
    const t = monthStamp(state.month);
    if (state.phase === 'extinct') {
        const res = M.extinguish(save, state.force, { month: state.month, dead: state.dead, officers: state.officers });
        const fates = [];
        for (let i = 0; i < res.fates.length; i += 1) {
            const f = res.fates[i];
            if (!f)
                continue;
            fates.push(`${f.name} ${M.FATE_TEXT[f.fate]}`);
        }
        return {
            ok: res.ok,
            heir: '',
            extinct: true,
            force: state.force,
            month: state.month,
            reason: res.reason,
            fates: fates,
            line: `${t}　${state.force} 君主陣亡：勢力滅亡`,
            kind: 'lost',
        };
    }
    let heir = logStr(pick);
    if (!heir) {
        const idx = state.selected >= 0 && state.selected < state.candidates.length ? state.selected : 0;
        const c = state.candidates[idx];
        heir = c ? c.name : '';
    }
    const res = M.inheritForce(save, state.force, heir, { month: state.month });
    const who = heir || '（無人）';
    return {
        ok: res.ok,
        heir: heir,
        extinct: false,
        force: state.force,
        month: state.month,
        reason: res.reason,
        fates: [],
        line: `${t}　${state.force} 君主陣亡：${who} 繼位（勢力存續 · 名號不變）`,
        kind: 'lost',
    };
}
