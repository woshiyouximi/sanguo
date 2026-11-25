
import * as Saves from './saves.js';
import * as M from './city_model.js';

// [audio] 统一入口：audio.js 没加载/被拦也不影响内政流程
const audio = () => window.SG?.audio;
const sfx = (name, opts) => audio()?.sfx(name, opts);

const $ = (id) => document.getElementById(id);
const qs = new URLSearchParams(location.search);
// R8 调试开关：?unlimited=1 关掉「一月一令」，只给截图/自测/批量数据用，默认关闭。
const UNLIMITED = qs.get('unlimited') === '1';
const storage = window.localStorage;

/* ---------------- 佈局：750×1334 等比縮放（與 deploy.html 同款） ---------------- */
function fit() {
  const stage = $('stage');
  const s = Math.min(window.innerWidth / 750, window.innerHeight / 1334);
  const w = Math.round(750 * s);
  const h = Math.round(1334 * s);
  stage.style.transformOrigin = 'top left';
  stage.style.transform = `scale(${s})`;
  stage.style.left = `${Math.max(0, Math.round((window.innerWidth - w) / 2))}px`;
  stage.style.top = `${Math.max(0, Math.round((window.innerHeight - h) / 2))}px`;
  document.body.style.width = `${w}px`;
  document.body.style.height = `${h}px`;
}
window.addEventListener('resize', fit);

/* ---------------- 資料 ---------------- */
const [scenRaw, genRaw, itemRaw, sysRaw, wisesRaw] = await Promise.all([
  fetch('../data/scenarios.json').then((r) => r.json()).catch(() => []),
  fetch('../data/generals.json').then((r) => r.json()).catch(() => []),
  fetch('../data/items.json').then((r) => r.json()).catch(() => []),
  fetch('../data/sango_system.json').then((r) => r.json()).catch(() => ({})),
  fetch('../data/wises.json').then((r) => r.json()).catch(() => []),
]);
const SCEN = Array.isArray(scenRaw) ? scenRaw : [];
const GENS = Array.isArray(genRaw) ? genRaw : [];
const ITEMS = Array.isArray(itemRaw) ? itemRaw : [];
const WISES = Array.isArray(wisesRaw) ? wisesRaw : [];
function systemName(sys, i) {
  const row = sys && sys['Times0' + (i + 1)];
  const s = typeof row === 'string' ? row : '';
  const cut = s.indexOf(',');
  return (cut >= 0 ? s.slice(cut + 1) : s).trim();
}

/* ---------------- 存檔：照 campaign.html 的啟動協議（只調 saves.js，不改它） ---------------- */
const store = Saves.loadStore(storage);
const legacy = Saves.readLegacy(storage);
const legacyOk = !!(legacy && (Array.isArray(legacy.owned) || legacy.seeded === true));

let save = null;
let activeSlot = 1;
let scenario = SCEN[0] || null;
let scenIdx = 0;

function snapOf(i) {
  const s = Saves.getSnapshot(store, i);
  return s && typeof s === 'object' && !Array.isArray(s) ? s : null;
}
let bootSlot = Saves.lastUsed(store) + 1;
if (!snapOf(bootSlot - 1) && Saves.hasAny(store)) bootSlot = Saves.newestSlot(store) + 1;
const bootSnap = snapOf(bootSlot - 1);
if (bootSnap) {
  const legacyNewer = legacyOk && Saves.num(legacy.scenario) === Saves.num(bootSnap.scenario)
    && Saves.num(legacy.ts) > Saves.num(bootSnap.ts);
  save = Saves.deepClone(legacyNewer ? legacy : bootSnap);
  activeSlot = bootSlot;
} else if (legacyOk) {
  const slot = bootSlot;
  save = Saves.migrateLegacy({ storage, now: Date.now(), scenarioNameOf: (id) => systemName(sysRaw, Saves.num(id) - 1) });
  activeSlot = slot;
} else {
  save = Saves.newCampaign(SCEN[0] || {});
  activeSlot = Math.min(Saves.SLOT_COUNT, Math.max(1, Saves.lastUsed(store) + 1));
}

function scenarioIndexOf(id) {
  const n = Saves.num(id);
  for (let i = 0; i < SCEN.length; i += 1) if (Saves.num(SCEN[i]?.id) === n) return i;
  return Math.max(0, Math.min(SCEN.length - 1, n - 1));
}
scenIdx = scenarioIndexOf(save?.scenario);
scenario = SCEN[scenIdx] || null;

save = Saves.deepClone(save || Saves.newCampaign(scenario || {}));
M.ensureExtras(save);
if (scenario) for (const c of scenario.cities || []) M.ensureCityState(save, c);
if (!Array.isArray(save.owned) || !save.owned.length) {
  save.owned = (scenario?.cities || []).slice(0, 3).map((c) => c.NAME);
}
const ctx = { generals: GENS, scenario, scenIdx, items: ITEMS, wises: WISES };
const myCities = () => (scenario?.cities || []).filter((c) => save.owned.includes(c.NAME));

/* 進來的城：?city= 指定，但只認我方城 */
let cityDef = null;
function pickCity(name) {
  const list = myCities();
  return list.find((c) => c.NAME === name) || list[0] || null;
}
cityDef = pickCity(qs.get('city'));

/* 除錯口子：?gold=3000 直接改金（只為驗收/自測，UI 上沒有這個入口） */
if (qs.has('gold')) {
  const g = Number(qs.get('gold'));
  if (Number.isFinite(g) && g >= 0) save.gold = Math.trunc(g);
}

/* ---------------- 持久化 ---------------- */
function persist() {
  save.ts = Date.now();
  const name = systemName(sysRaw, scenIdx) || scenario?.system?.TIME || `劇本${scenIdx + 1}`;
  try {
    Saves.writeSlot(store, activeSlot - 1, save, { scenarioName: name, ts: save.ts });
    Saves.saveStore(store, storage);
    Saves.writeLegacy(save, storage);
  } catch (err) {
    console.warn('存檔失敗', err);
  }
}

/* ---------------- 物品背包（items.html 自己的鍵） ---------------- */
function bagAdd(seq) {
  try {
    const raw = storage.getItem(M.BAG_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    storage.setItem(M.BAG_KEY, JSON.stringify(M.withBagItem(parsed, seq)));
    return true;
  } catch (err) {
    console.warn('背包寫入失敗', err);
    return false;
  }
}

/* ---------------- 頂部 HUD ---------------- */
const fmt = (n) => Saves.num(n).toLocaleString('en-US');
// 疲勞容錯：老檔沒有 save.tire、或值是字串/越界，都按 0..100 整數讀；只影響顯示。
function tireOfName(name) {
  const raw = save && save.tire && typeof save.tire === 'object' ? save.tire[name] : 0;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.trunc(v))) : 0;
}
// 士氣容錯（原作 general+0x38，武將級）：沒存過按缺省 60 讀；只影響顯示。
function moraleOfName(name) {
  const raw = save && save.morale && typeof save.morale === 'object' ? save.morale[name] : 60;
  const v = Number(raw);
  return Number.isFinite(v) ? Math.min(100, Math.max(0, Math.trunc(v))) : 60;
}
function renderHud() {
  const st = cityDef ? M.ensureCityState(save, cityDef) : null;
  $('cityName').textContent = cityDef ? cityDef.NAME : '（無城）';
  $('headSub').textContent = `${systemName(sysRaw, scenIdx) || scenario?.system?.TIME || '劇本'} · ${Saves.monthLabel(save.month)}`;
  $('vPop').textContent = st ? fmt(st.pop) : '—';
  $('vGold').textContent = fmt(save.gold);
  $('vTroops').textContent = st ? `${fmt(st.troops)}/${fmt(M.RECRUIT.CAP)}` : '—';
  $('vDef').textContent = st ? fmt(st.def) : '—';
  $('vMajor').textContent = cityDef ? (M.majorOf(save, cityDef) || '—') : '—';
  $('vWise').textContent = cityDef ? (M.wiseOf(save, cityDef) || '—') : '—';
  $('vEff').textContent = cityDef ? `×${M.efficiencyOf(save, cityDef, ctx).toFixed(2)}` : '—';
  $('vGens').textContent = cityDef ? String(M.rosterOf(save, cityDef.NAME, ctx).length) : '—';
  // 主將疲勞（原作 general+0x3A）：只在這一頁顯示一次；≥60 轉橙，和 monthly 的士氣懲罰同門檻。
  const major = cityDef ? M.majorOf(save, cityDef) : '';
  const majorTire = major ? tireOfName(major) : null;
  $('vTire').textContent = majorTire === null ? '—' : `${majorTire}/100`;
  $('vTire').classList.toggle('hot', majorTire !== null && majorTire >= 60);
  // 主將士氣（原作 general+0x38，武將級）：<30 標紅（低迷），與 deploy.html 同一口徑。
  const majorMorale = major ? moraleOfName(major) : null;
  $('vMorale').textContent = majorMorale === null ? '—' : `${majorMorale}/100`;
  $('vMorale').classList.toggle('cold', majorMorale !== null && majorMorale < 30);
  // R8 月令：本月下过令就显示"已用"（推进一月才复位）
  const locked = M.monthLocked(save, UNLIMITED);
  $('vLock').textContent = UNLIMITED ? '不限' : (locked ? '已用' : '可下');
  $('vLock').classList.toggle('hot', !UNLIMITED && locked);
  $('cmdHint').textContent = UNLIMITED
    ? M.UNLIMITED_HINT
    : (locked ? `${M.LOCK_HINT} · 回大地圖推進一月` : '每月一條 · 推進一月再下達');
}

/* ---------------- 8 條命令宮格 ---------------- */
const CMD_SUB = {
  開發: (st) => `金 ${M.DEV.COST} · 民防共增`,
  徵兵: (st) => `金 ${M.RECRUIT.COST} · 兵 +${M.RECRUIT.TROOPS}`,
  搜索: (st) => `金 ${M.SEARCH.COST} · 人才/寶物`,
  移動: () => '調將 · 調兵',
  任命: () => '太守 · 軍師',
  物品: () => '裝備 · 背包',
  情報: () => '本城 · 鄰城',
  出征: () => '打相鄰敵城',
};
function renderGrid() {
  const grid = $('grid');
  // R8 一月一令：本月已下过令 → 八条全置灰（原作 0x4A64BC，推进一月才复位）
  const locked = M.monthLocked(save, UNLIMITED);
  grid.innerHTML = '';
  for (const cmd of M.CMD_ORDER) {
    const b = document.createElement('button');
    b.className = 'cmd' + (cmd === '開發' || cmd === '徵兵' ? ' hot' : '');
    b.dataset.cmd = cmd;
    b.disabled = locked;
    const cost = M.CMD_META?.[cmd]?.cost;
    b.innerHTML = `<b>${cmd}</b><small>${CMD_SUB[cmd]?.({}) || ''}</small>`
      + (locked ? `<span class="note">${M.LOCK_HINT}</span>` : '');
    void cost;
    grid.appendChild(b);
  }
}

/* ---------------- 結果日誌（最近 6 條） ---------------- */
function renderLog() {
  const box = $('log');
  const rows = M.recentLog(save, 6);
  if (!rows.length) {
    box.innerHTML = '<div class="empty">尚無紀錄。點上面任一命令。</div>';
    return;
  }
  box.innerHTML = rows.map((e) => {
    const k = e.kind && e.kind !== 'info' ? `k-${e.kind}` : '';
    return `<div class="row ${k}"><span class="t">${e.t || Saves.monthLabel(e.m)}</span>`
      + `<span class="c">${e.cmd || ''}</span><span class="x">${escapeHtml(e.text)}</span></div>`;
  }).join('');
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function say(cmd, kind, text) {
  M.logAdd(save, { city: cityDef?.NAME || '', cmd, kind, text, m: save.month });
}

/* ---------------- 八條命令的執行 ---------------- */
/**
 * 每条命令收尾。acted=false 用在"没真的执行成功"的分支上（例如没有相邻城可调兵）：
 * 失败不该吃掉这个月。成功一条即置「本月已行動」，八条按钮随即置灰。
 */
function afterCommand(acted = true) {
  if (acted) M.markMonthActed(save, UNLIMITED);
  persist();
  renderHud();
  renderGrid();
  renderLog();
}

function doDevelop() {
  const r = M.develop(save, cityDef, ctx);
  if (!r.ok) {
    say('開發', 'warn', r.reason === 'gold' ? `金不足（需 ${r.cost}）。` : '人口飽和、防禦力最高了。');
  } else {
    say('開發', 'info', `人口增加 ${r.pop} 人，防禦力增加 ${r.def}。（金 -${r.cost}）`);
  }
  afterCommand(r.ok);
}

function doRecruit() {
  const r = M.recruit(save, cityDef, ctx);
  if (!r.ok) {
    say('徵兵', 'warn', r.reason === 'gold' ? `金不足（需 ${r.cost}）。`
      : `兵已達上限 ${fmt(r.cap)}。`);
  } else {
    say('徵兵', 'info', `徵得士兵 ${r.troops}（${fmt(M.cityStateOf(save, cityDef.NAME).troops)}/${fmt(r.cap)}），金 -${r.cost}。`);
  }
  afterCommand(r.ok);
}

function doSearch() {
  const before = M.searchCount(save, cityDef.NAME);
  const r = M.search(save, cityDef, ctx);
  if (!r.ok) {
    say('搜索', 'warn', r.reason === 'gold' ? `金不足（需 ${r.cost}）。` : '這裡不能搜索。');
    sfx('failure2');   // [audio] 搜索失败 = 原作 FAILURE2（37c §4）
    afterCommand(false);
    return;
  }
  // search() 自己寫日誌（種子需要 count 遞增），這裡只補背包
  if ((r.kind === 'treasure' || r.kind === 'talisman') && r.seq) bagAdd(r.seq);
  // [audio] 搜索成功 = 原作 SUCCESS；「一無所獲」按失败处理（原作没有"空手"专用音）
  sfx(r.kind === 'none' ? 'failure2' : 'success');
  void before;
  afterCommand(true);
}

/* 移動抽屜 */
function openMove() {
  const dests = M.neighboursOf(cityDef.NAME, scenario)
    .filter((n) => save.owned.includes(n));
  const st = M.ensureCityState(save, cityDef);
  const gens = M.rosterOf(save, cityDef.NAME, ctx);
  if (!dests.length) {
    say('移動', 'warn', '沒有相鄰的我方城池可調動。');
    afterCommand(false);
    return;
  }
  let to = dests[0];
  let troops = 0;
  let general = '';
  openSheet('移動', (body) => {
    body.innerHTML = `
      <div class="field"><span style="width:74px">目標城</span><select id="mvTo" class="pick" style="flex:1;height:56px;font-size:20px">
        ${dests.map((d) => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
      </select></div>
      <div class="field"><span style="width:74px">兵力</span>
        <input type="range" id="mvTroops" min="0" max="${st.troops}" value="0">
        <input type="number" id="mvTroopsN" min="0" max="${st.troops}" value="0" style="width:110px"></div>
      <div class="stxt" style="font-size:15px;color:var(--ink-3)">本城可用兵力 ${fmt(st.troops)}；目標城上限 ${M.RECRUIT.CAP}（依据：docs/04c §2.2）。</div>
      <div class="field"><span style="width:74px">武將</span><select id="mvGen" class="pick" style="flex:1;height:56px;font-size:20px">
        <option value="">（不調將）</option>
        ${gens.map((g) => `<option value="${escapeHtml(g.NAME)}">${escapeHtml(g.NAME)} 武${g.STR} 智${g.INT}</option>`).join('')}
      </select></div>
      <div style="font-size:15px;color:var(--ink-3)">本城武將 ${gens.length} 人。調走太守/軍師會自動卸任。</div>`;
    const toSel = body.querySelector('#mvTo');
    const rng = body.querySelector('#mvTroops');
    const numIn = body.querySelector('#mvTroopsN');
    const genSel = body.querySelector('#mvGen');
    const sync = (v) => { troops = Math.max(0, Math.min(st.troops, Math.trunc(Number(v) || 0))); rng.value = troops; numIn.value = troops; };
    toSel.onchange = () => { to = toSel.value; };
    rng.oninput = () => sync(rng.value);
    numIn.oninput = () => sync(numIn.value);
    genSel.onchange = () => { general = genSel.value; };
    body.__ok = () => {
      const r = M.move(save, cityDef, { to, troops, general }, ctx);
      if (!r.ok) {
        say('移動', 'warn', r.reason === 'empty' ? '沒有選擇兵力或武將。'
          : r.reason === 'target' ? '目標城不合法。'
            : r.reason === 'not-owned' ? '目標不是我方城池。'
              : r.reason === 'not-adjacent' ? '目標不相鄰（只能調往相鄰我方城）。' : '移動失敗。');
      } else {
        const bits = [];
        if (r.troops) bits.push(`兵 ${r.troops}`);
        if (r.general) bits.push(`將 ${r.general.NAME}`);
        say('移動', 'info', `→ ${to}：${bits.join('、') || '無'}。`);
      }
      closeSheet();
      afterCommand(r.ok);
    };
  });
}

/* 任命抽屜 */
function openAppoint() {
  const gens = M.rosterOf(save, cityDef.NAME, ctx);
  if (!gens.length) {
    say('任命', 'warn', '本城沒有武將可任命。');
    afterCommand(false);
    return;
  }
  let major = M.majorOf(save, cityDef);
  let wise = M.wiseOf(save, cityDef);
  openSheet('任命 · 太守 / 軍師', (body) => {
    const mk = (role, cur) => `
      <div class="sec" style="padding:10px 12px">
        <h2 style="font-size:17px">${role === 'major' ? '太守（影響內政效率）' : '軍師（決定軍師技可用）'}</h2>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px">
          ${gens.map((g) => `<button class="pick ${cur === g.NAME ? 'on' : ''}" data-role="${role}" data-name="${escapeHtml(g.NAME)}">
            <div><div class="nm">${escapeHtml(g.NAME)}</div><div class="st">武 ${g.STR} · 智 ${g.INT} · 忠 ${g.Loyal}</div></div>
            <div class="rt">${(M.wiseSkillsOf(g, WISES).slice(0, 2).map((w) => w.name).join(' / ')) || '—'}</div>
          </button>`).join('')}
        </div>
      </div>`;
    body.innerHTML = mk('major', major) + mk('wise', wise);
    body.querySelectorAll('.pick').forEach((el) => {
      el.onclick = () => {
        const role = el.dataset.role;
        if (role === 'major') { major = el.dataset.name; } else { wise = el.dataset.name; }
        body.querySelectorAll('.pick').forEach((x) => { if (x.dataset.role === role) x.classList.toggle('on', x === el); });
      };
    });
    body.__ok = () => {
      const rm = M.appoint(save, cityDef, 'major', major, ctx);
      const rw = M.appoint(save, cityDef, 'wise', wise, ctx);
      say('任命', 'info', `太守 ${rm.ok ? major : (major || '—')}、軍師 ${rw.ok ? wise : (wise || '—')}。`);
      closeSheet();
      afterCommand(true);
    };
  });
}

/* 情報抽屜（只讀） */
function openIntel() {
  const info = M.intel(save, cityDef, ctx);
  openSheet('情報 · 本城與鄰城', (body) => {
    const row = (r) => `<tr class="${r.mine ? 'mine' : ''}">
      <td>${escapeHtml(r.name)}${r.gate ? ' <span class="tag">關</span>' : ''}</td>
      <td>${escapeHtml(r.owner)}</td><td>${fmt(r.troops)}</td><td>${fmt(r.def)}</td><td>${r.generals}</td>
      <td>${escapeHtml(r.major || '—')}</td></tr>`;
    body.innerHTML = `<table class="info">
      <thead><tr><th>城</th><th>勢力</th><th>兵</th><th>防</th><th>將</th><th>太守</th></tr></thead>
      <tbody>${[info.self, ...info.rows].filter(Boolean).map(row).join('')}</tbody></table>
      <div style="font-size:14px;color:var(--ink-3);margin-top:6px">只讀面板：相鄰城含關卡（RATE=0）。</div>`;
    body.__noOk = true;
  });
  // 情報在原作也是一条内政命令：看一眼就算这个月的令用掉了（?unlimited=1 除外）
  afterCommand(true);
}

/* 出征抽屜 */
function openDeploy() {
  const targets = M.deployTargets(save, cityDef, ctx);
  if (!targets.length) {
    say('出征', 'warn', '相鄰沒有可出征的敵城（或只有關卡）。');
    afterCommand(false);
    return;
  }
  let pick = targets[0].name;
  openSheet('出征 · 選目標', (body) => {
    body.innerHTML = targets.map((t) => `<button class="pick ${t.name === pick ? 'on' : ''}" data-name="${escapeHtml(t.name)}">
      <div><div class="nm">${escapeHtml(t.name)}</div>
        <div class="st">${t.owner ? '勢力 ' + escapeHtml(t.owner) : '無主空城'}</div></div>
      <div class="rt">兵 ${fmt(t.troops)}<br>防 ${fmt(t.def)}<br>將 ${t.generals}</div></button>`).join('')
      + `<div style="font-size:14px;color:var(--ink-3)">出征會交給 deploy.html 編隊；本頁只負責帶目標城過去。</div>`;
    body.querySelectorAll('.pick').forEach((el) => {
      el.onclick = () => { pick = el.dataset.name; body.querySelectorAll('.pick').forEach((x) => x.classList.toggle('on', x === el)); };
    });
    body.__ok = () => {
      // 出征也吃月令：先记位再跳转（deploy.html 本身不改）
      if (M.markMonthActed(save, UNLIMITED)) persist();
      location.href = M.deployUrl(pick) + (UNLIMITED ? '&unlimited=1' : '');
    };
  });
}

/* ---------------- 抽屜基礎 ---------------- */
/**
 * 開底部抽屜。build(body) 負責畫內容；要處理「確定」時在 build 裡設 body.__ok = fn，
 * 追劇本時設 body.__noOk = true 隱藏確定鍵。
 */
function openSheet(title, build) {
  $('sheetTitle').textContent = title;
  const body = $('sheetBody');
  body.innerHTML = '';
  body.__ok = null;
  body.__noOk = false;
  build(body);
  const ok = $('sheetOk');
  ok.style.display = body.__noOk ? 'none' : '';
  ok.onclick = () => { if (typeof body.__ok === 'function') body.__ok(); };
  $('mask').classList.add('on');
  $('sheet').classList.add('on');
}
function closeSheet() {
  $('mask').classList.remove('on');
  $('sheet').classList.remove('on');
  $('sheetBody').innerHTML = '';
}

/* ---------------- 綁定 ---------------- */
$('mask').onclick = closeSheet;
$('sheetCancel').onclick = closeSheet;
$('btnBack').onclick = () => { location.href = './campaign.html'; };
$('btnRefresh').onclick = () => location.reload();

function onCmd(cmd, bypassLock = false) {
  if (!cityDef) { say(cmd, 'warn', '沒有我方城池。'); renderLog(); return; }
  // R8 一月一令：本月已经下过令 → 直接拒绝（按钮本来就是 disabled，这里兜住键盘/调试路径）
  if (!bypassLock && M.monthLocked(save, UNLIMITED)) {
    say(cmd, 'warn', `${M.LOCK_HINT}：一個月只能下一條命令，回大地圖「推進一月」再下達。`);
    renderHud();
    renderGrid();
    renderLog();
    return;
  }
  if (cmd === '開發') doDevelop();
  else if (cmd === '徵兵') doRecruit();
  else if (cmd === '搜索') doSearch();
  else if (cmd === '移動') openMove();
  else if (cmd === '任命') openAppoint();
  else if (cmd === '物品') {
    if (M.markMonthActed(save, UNLIMITED)) persist();
    location.href = M.itemsUrl(cityDef.NAME) + (UNLIMITED ? '&unlimited=1' : '');
  } else if (cmd === '情報') openIntel();
  else if (cmd === '出征') openDeploy();
}
$('grid').onclick = (e) => {
  const b = e.target.closest('.cmd');
  if (b) onCmd(b.dataset.cmd);
};

/* ---------------- 啟動 ---------------- */
fit();
renderGrid();
renderHud();
renderLog();
// [audio] 内政 BGM（10–14 五档）：按我方城数取档，阈值 9/18/26/37 见 project/41 与 37c
audio()?.bgm(`domestic:${(save.owned || []).length}`);

/* 除錯口子：?do=develop,search,search；?dump=1 把存檔前後差異塞進 <pre id="dump">
 * 這是除錯入口（UI 上沒有），所以它繞過「一月一令」——正式按鈕仍受 lastActionMonth 限制。 */
const plan = String(qs.get('do') || '').split(',').map((s) => s.trim()).filter(Boolean);
const MAP = { develop: '開發', recruit: '徵兵', search: '搜索', move: '移動', appoint: '任命', item: '物品', intel: '情報', deploy: '出征' };
const snapshot = plan.length ? JSON.stringify({ gold: save.gold, cities: save.cities[cityDef?.NAME], roster: save.roster, appointed: save.appointed }) : '';
for (const step of plan) {
  const cmd = MAP[step] || step;
  if (cmd === '出征' || cmd === '移動' || cmd === '任命' || cmd === '情報' || cmd === '物品') continue;
  onCmd(cmd, true);
}
if (qs.has('dump') && qs.get('dump') !== '0') {
  // 不顯示：只把 JSON 塞進 <pre id="dump">，用 Edge --dump-dom 取。要肉眼看時加 ?dump=show。
  const d = $('dump');
  d.style.display = qs.get('dump') === 'show' ? 'block' : 'none';
  d.textContent = '<<<DUMP\n' + JSON.stringify({
    city: cityDef?.NAME,
    slot: activeSlot,
    before: snapshot ? JSON.parse(snapshot) : null,
    after: { gold: save.gold, cities: save.cities[cityDef?.NAME], roster: save.roster, appointed: save.appointed, searchLog: (save.searchLog || []).slice(-6) },
  }, null, 1) + '\nDUMP>>>';
}
window.__city = { save, cityDef, ctx, M, Saves, unlimited: UNLIMITED, locked: M.monthLocked(save, UNLIMITED) };
