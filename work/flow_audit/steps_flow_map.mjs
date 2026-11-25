// work/flow_audit/steps_flow_map.mjs —— flow 子智能體的取證腳本（只讀，不改 game/**）
// 用法：
//   PROFILE=F:\sanguo\work\.edgeprof_flowaudit PORT=9343 OUTDIR=F:\sanguo\work\flow_audit \
//   MATCH=5299 PAGE_URL=http://127.0.0.1:5299/web/campaign.html WIN=--window-size=750,1400 \
//   node work\cocos_verify\cdpweb.mjs launch
//   ... node work\cocos_verify\cdpweb.mjs run work\flow_audit\steps_flow_map.mjs
export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => {
    try {
      const v = await evaluate(x);
      if (v && v.__throw) return { __throw: v.__throw };
      return v;
    } catch (e) { return { __throw: String(e && e.message || e) }; }
  };
  const J = async (x) => {
    const v = await ev(x);
    if (v && v.__throw) return { __throw: v.__throw };
    try { return JSON.parse(v); } catch { return v; }
  };
  const waitFor = async (expr, tries = 100) => {
    for (let i = 0; i < tries; i += 1) {
      const v = await ev(expr);
      if (v === true) return true;
      await sleep(200);
    }
    return false;
  };
  const go = async (url) => {
    await s('Page.navigate', { url });
    await sleep(800);
    for (let i = 0; i < 150; i += 1) {
      const v = await ev('document.readyState');
      if (v === 'complete') break;
      await sleep(200);
    }
    await sleep(1000);
  };
  const BASE = 'http://127.0.0.1:5299/web/';

  // ── 0) 開局現況（profile 全新；頁面若停在開局遮罩就先看遮罩長什麼樣）
  await go(BASE + 'campaign.html');
  await shot('a0_boot');
  const boot = await J(`(() => {
    const ov = document.getElementById('startOv');
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    return JSON.stringify({
      ym: (document.getElementById('ym') || {}).textContent,
      gold: (document.getElementById('gold') || {}).textContent,
      ct: (document.getElementById('ct') || {}).textContent,
      ovVisible: vis(ov), ovId: vis(ov) ? ov.id : null,
      sheets: [...document.querySelectorAll('.sheet')].filter(vis).map((e) => e.id),
      btns: [...document.querySelectorAll('.btn')].filter(vis).slice(0, 24).map((b) => (b.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24)),
      store: Object.keys(JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}')),
    });
  })()`);
  log('0 boot: ' + JSON.stringify(boot));

  // 若有開局遮罩 → 走 選劇本 → 選君主 → 開始
  const overlay = boot && boot.ovVisible;
  if (overlay) {
    const flow = await J(`(async () => {
      const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
      const card = [...document.querySelectorAll('#scstrip .sc')][0];
      if (card) card.click();
      await new Promise((r) => setTimeout(r, 300));
      const k = [...document.querySelectorAll('#pickCards [data-king]')][0];
      if (k) { k.click(); await new Promise((r) => setTimeout(r, 300)); }
      const st = document.getElementById('btnPickStart');
      if (st && vis(st) && !st.disabled) st.click();
      await new Promise((r) => setTimeout(r, 800));
      return JSON.stringify({ king: k && k.dataset.king, stillOv: vis(document.getElementById('startOv')),
        ttl: (document.getElementById('pickTtl') || {}).textContent });
    })()`);
    log('0 start flow: ' + JSON.stringify(flow));
    await sleep(1000);
    await shot('a0b_started');
  }

  // ── 1) 大地圖初始
  const mapInfo = await J(`(() => {
    const cv = document.getElementById('map');
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act + (b.disabled ? '{dis}' : '') + ':' + (b.querySelector('small') || {}).textContent);
    const rows = [...document.querySelectorAll('#list .city')].slice(0, 5).map((r) => r.textContent.replace(/\\s+/g, ' ').trim());
    const mine = [...document.querySelectorAll('#list .city.mine')].map((r) => r.dataset.name);
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent,
      gold: (document.getElementById('gold') || {}).textContent, ct: (document.getElementById('ct') || {}).textContent,
      canvas: cv ? cv.width + 'x' + cv.height : null, acts, rows, mineCount: mine.length, mine: mine.slice(0, 8),
      hint: (document.getElementById('hint') || {}).textContent });
  })()`);
  log('1 map: ' + JSON.stringify(mapInfo));
  await shot('a1_map_initial');

  // ── 2) 點自己的城 → 城內指令面板
  const sel = await J(`(() => {
    const row = document.querySelector('#list .city.mine') || document.querySelector('#list .city');
    if (!row) return JSON.stringify({ err: 'no city row' });
    row.click();
    return JSON.stringify({ clicked: row.dataset.name });
  })()`);
  log('2 select: ' + JSON.stringify(sel));
  await sleep(800);
  await shot('a2_map_city_selected');
  const cityPanel = await J(`(() => {
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act + (b.disabled ? '{dis}' : '')
      + ' [' + ((b.querySelector('span') || {}).textContent || '') + ' / ' + ((b.querySelector('small') || {}).textContent || '') + ']');
    return JSON.stringify({ acts, hint: (document.getElementById('hint') || {}).textContent,
      ym: (document.getElementById('ym') || {}).textContent });
  })()`);
  log('2 city panel: ' + JSON.stringify(cityPanel));

  // ── 3) 點「內政」→ city.html（跨頁導航，用 Page.navigate 等）
  const cityUrl = BASE + 'city.html?city=' + encodeURIComponent(sel.clicked || '') + '&unlimited=1';
  await go(cityUrl);
  const cityOk = await waitFor(`!!window.__city`, 60);
  await sleep(900);
  await shot('a3_city_commands');
  const cityState = await J(`(() => {
    const c = window.__city;
    const chips = [...document.querySelectorAll('.chip')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim());
    const cmds = [...document.querySelectorAll('#grid .cmd')].map((b) => b.dataset.cmd + (b.disabled ? '{dis}' : '')
      + '/' + ((b.querySelector('small') || {}).textContent || '').replace(/\\s+/g, ' ').trim());
    return JSON.stringify({ ok: ${cityOk}, city: c && c.cityDef && c.cityDef.NAME, month: c && c.save && c.save.month,
      locked: c && c.locked, lastActionMonth: c && c.save && c.save.lastActionMonth,
      chips, cmds, text: document.body.innerText.replace(/\\n{2,}/g, '\\n').slice(0, 1400) });
  })()`);
  log('3 city.html: ' + JSON.stringify(cityState));

  // ── 4) 點「搜索」：不选执行武将，直接用太守；看扣多少钱、是不是一次就锁月
  const searchRun = await J(`(async () => {
    const c = window.__city;
    const before = { gold: c.save.gold, log: (c.save.log || []).length, city: c.cityDef.NAME };
    const b = [...document.querySelectorAll('#grid .cmd')].find((x) => x.dataset.cmd === '搜索');
    if (!b) return JSON.stringify({ err: 'no search btn' });
    if (b.disabled) return JSON.stringify({ blocked: true, why: 'disabled', before });
    b.click();
    await new Promise((r) => setTimeout(r, 500));
    const sheet = [...document.querySelectorAll('.sheet')].find((e) => !e.hidden && e.offsetParent);
    const confirmBtns = sheet ? [...sheet.querySelectorAll('.btn,button')].filter((x) => x.offsetParent && !x.disabled)
      .map((x) => x.textContent.replace(/\\s+/g, ' ').trim().slice(0, 30)) : [];
    return JSON.stringify({ before, sheet: sheet && sheet.id, confirmBtns,
      after: { gold: c.save.gold, log: (c.save.log || []).length, lastActionMonth: c.save.lastActionMonth,
        locked: c.M.monthLocked(c.save, false), logTail: (c.save.log || []).slice(-2) } });
  })()`);
  log('4 search open: ' + JSON.stringify(searchRun));
  await sleep(400);
  await shot('a4_city_search_open');

  // ── 5) 回大地圖 → 推進一月；看「內政」在非正月是否仍掛著
  await go(BASE + 'campaign.html');
  const beforeAdvance = await J(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent, month: slot && slot.snapshot && slot.snapshot.month });
  })()`);
  log('5 before advance: ' + JSON.stringify(beforeAdvance));
  await ev(`(() => { const b = document.querySelector('#actions [data-act="advance"]'); if (b) b.click(); return 'adv'; })()`);
  await sleep(1200);
  await shot('a5_month_advanced');
  const afterAdvance = await J(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    const row = document.querySelector('#list .city.mine') || document.querySelector('#list .city');
    if (row) row.click();
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent, month: slot && slot.snapshot && slot.snapshot.month });
  })()`);
  log('5 after advance: ' + JSON.stringify(afterAdvance));
  await sleep(700);
  const advPanel = await J(`(() => {
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act + (b.disabled ? '{dis}' : '')
      + ' [' + ((b.querySelector('small') || {}).textContent || '') + ']');
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent, acts,
      hint: (document.getElementById('hint') || {}).textContent });
  })()`);
  log('5 panel after advance: ' + JSON.stringify(advPanel));
  await shot('a5b_panel_after_advance');

  // ── 6) 非正月（7 月）：把存檔 month 改成 7 → 重新載入 → 「內政」還在不在
  const forced = await J(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const i = (raw.slots || []).findIndex((x) => x && x.snapshot);
    if (i < 0) return JSON.stringify({ err: 'no slot' });
    const snap = raw.slots[i].snapshot;
    const old = snap.month;
    snap.month = 7;
    localStorage.setItem('sanguo_saves_v1', JSON.stringify(raw));
    return JSON.stringify({ slot: i, oldMonth: old, newMonth: snap.month });
  })()`);
  log('6 force month: ' + JSON.stringify(forced));
  await go(BASE + 'campaign.html');
  await ev(`(() => { const row = document.querySelector('#list .city.mine') || document.querySelector('#list .city'); if (row) row.click(); return '1'; })()`);
  await sleep(700);
  await shot('a6_july_city_panel');
  const july = await J(`(() => {
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act + (b.disabled ? '{dis}' : '')
      + ' [' + ((b.querySelector('small') || {}).textContent || '') + ']');
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent, acts });
  })()`);
  log('6 july panel: ' + JSON.stringify(july));

  const julyUrl = BASE + 'city.html?city=' + encodeURIComponent((await ev(`(document.querySelector('#list .city.mine')||{}).dataset && document.querySelector('#list .city.mine').dataset.name`) || '') + '&unlimited=1');
  await go(julyUrl);
  const julyOk = await waitFor(`!!window.__city`, 60);
  await sleep(800);
  await shot('a7_july_city_inside');
  const julyCityState = await J(`(() => {
    const c = window.__city;
    return JSON.stringify({ ok: ${julyOk}, city: c && c.cityDef && c.cityDef.NAME, month: c && c.save && c.save.month,
      locked: c && c.locked,
      cmds: [...document.querySelectorAll('#grid .cmd')].map((b) => b.dataset.cmd + (b.disabled ? '{dis}' : '')) });
  })()`);
  log('7 july inside city: ' + JSON.stringify(julyCityState));

  return { done: true, cityUrl, julyUrl };
}
