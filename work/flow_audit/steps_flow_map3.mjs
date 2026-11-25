// work/flow_audit/steps_flow_map3.mjs —— 乾淨開局（清 origin storage）→ 選劇本 → 選君主 → 地圖 → 點城 → 內政
export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => {
    try { const v = await evaluate(x); if (v && v.__throw) return { __throw: v.__throw }; return v; } catch (e) { return { __throw: String((e && e.message) || e) }; }
  };
  const J = async (x) => {
    const v = await ev(x);
    if (v && v.__throw) return { __throw: v.__throw };
    try { return JSON.parse(v); } catch { return v; }
  };
  const waitFor = async (expr, tries = 100) => {
    for (let i = 0; i < tries; i += 1) { if (await ev(expr) === true) return true; await sleep(200); }
    return false;
  };
  const go = async (url) => {
    await s('Page.navigate', { url });
    await sleep(800);
    for (let i = 0; i < 150; i += 1) { if (await ev('document.readyState') === 'complete') break; await sleep(200); }
    await sleep(1000);
  };
  const BASE = 'http://127.0.0.1:5299/web/';

  await go(BASE + 'campaign.html');
  await s('Storage.clearDataForOrigin', { origin: 'http://127.0.0.1:5299', storageTypes: 'local_storage' });
  await go(BASE + 'campaign.html');
  await sleep(1000);

  // 開局面板現況
  const pick0 = await J(`(() => {
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    const sheet = document.getElementById('pickSheet');
    return JSON.stringify({ sheetVisible: vis(sheet), ttl: (document.getElementById('pickTtl') || {}).textContent,
      sub: (document.getElementById('pickSub') || {}).textContent,
      startTxt: (document.getElementById('btnPickStart') || {}).textContent,
      warn: (document.getElementById('pickWarn') || {}).textContent,
      store: Object.keys(JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}')),
      ym: (document.getElementById('ym') || {}).textContent });
  })()`);
  log('pick0: ' + JSON.stringify(pick0));
  await shot('b1_picker_scenario');

  // 點「討伐董卓」劇本卡，再看君主列表
  const pick1 = await J(`(async () => {
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    const sc = [...document.querySelectorAll('[data-sc]')].filter(vis);
    const names = sc.map((e) => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 18));
    if (sc[1]) sc[1].click();
    await new Promise((r) => setTimeout(r, 400));
    return JSON.stringify({ scCards: sc.length, names,
      ttl: (document.getElementById('pickTtl') || {}).textContent,
      kings: [...document.querySelectorAll('#pickCards [data-king]')].map((c) => c.dataset.king),
      startTxt: (document.getElementById('btnPickStart') || {}).textContent });
  })()`);
  log('pick1: ' + JSON.stringify(pick1));
  await sleep(500);
  await shot('b2_picker_kings');

  // 選曹操 → 開始
  const pick2 = await J(`(async () => {
    const k = [...document.querySelectorAll('#pickCards [data-king]')].find((c) => c.dataset.king === '曹操')
      || document.querySelector('#pickCards [data-king]');
    if (!k) return JSON.stringify({ err: 'no king card' });
    k.click();
    await new Promise((r) => setTimeout(r, 400));
    const st = document.getElementById('btnPickStart');
    const before = { txt: st && st.textContent, dis: st && st.disabled, warn: (document.getElementById('pickWarn') || {}).textContent };
    if (st && !st.disabled) st.click();
    await new Promise((r) => setTimeout(r, 1500));
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    return JSON.stringify({ king: k.dataset.king, before, stillSheet: vis(document.getElementById('pickSheet')),
      snap: slot && { king: slot.snapshot.king, month: slot.snapshot.month, gold: slot.snapshot.gold, owned: slot.snapshot.owned } });
  })()`);
  log('pick2: ' + JSON.stringify(pick2));
  await sleep(1500);
  await shot('b3_map_after_start');

  const st1 = await J(`(() => {
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act + (b.disabled ? '{dis}' : ''));
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent,
      gold: (document.getElementById('gold') || {}).textContent,
      head: document.body.innerText.split('\\n').slice(0, 8),
      acts, mine: [...document.querySelectorAll('#list .city.mine')].map((r) => r.dataset.name),
      cv: (() => { const c = document.getElementById('map'); return c ? c.width + 'x' + c.height : null; })() });
  })()`);
  log('map state: ' + JSON.stringify(st1));

  // 地圖上真點城：復刻 plotRect 算我方首城座標並點 canvas
  const clickCity = await J(`(async () => {
    const cv = document.getElementById('map');
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    const owned = (slot && slot.snapshot.owned) || [];
    let scen = null;
    try { scen = await (await fetch('../data/scenarios.json')).json(); } catch (e) { return JSON.stringify({ err: 'scen fetch: ' + e }); }
    const roots = [scen.scenarios, scen.list, scen.SCENARIOS, Array.isArray(scen) ? scen : null].filter(Boolean);
    let cities = [];
    for (const r of roots) {
      const first = Array.isArray(r) ? r[0] : null;
      const cand = first && (first.cities || first.CITIES || first.City);
      if (cand) { cities = Array.isArray(cand) ? cand : Object.values(cand); break; }
    }
    if (!cities.length && Array.isArray(scen.cities)) cities = scen.cities;
    const target = cities.find((c) => c && c.NAME === owned[0]);
    if (!target) return JSON.stringify({ err: 'no city', roots: roots.length, n: cities.length, keys: Object.keys(scen).slice(0, 8), sample: cities[0] && Object.keys(cities[0]) });
    const box = { x0: 88, y0: 84, x1: 1138, y1: 860 };
    const PAD = 26, dpr = window.devicePixelRatio || 1;
    const vw = cv.width / dpr, vh = cv.height / dpr;
    const sc = Math.min((vw - PAD * 2) / (box.x1 - box.x0), (vh - PAD * 2) / (box.y1 - box.y0));
    const ox = vw / 2 - ((box.x0 + box.x1) / 2) * sc, oy = vh / 2 - ((box.y0 + box.y1) / 2) * sc;
    const pos = target.pos_xy || target.POS_XY || target.pos;
    const [px, py] = pos;
    const sx = ox + px * sc, sy = oy + py * sc;
    const r = cv.getBoundingClientRect();
    const cx = r.x + sx, cy = r.y + sy;
    cv.dispatchEvent(new MouseEvent('click', { clientX: cx, clientY: cy, bubbles: true }));
    await new Promise((res) => setTimeout(res, 700));
    return JSON.stringify({ city: target.NAME, pos, sx: Math.round(sx), sy: Math.round(sy),
      cx: Math.round(cx), cy: Math.round(cy), vw, vh, sc,
      acts: [...document.querySelectorAll('#actions .btn')].map((b) => b.dataset.act),
      hint: (document.getElementById('hint') || {}).textContent });
  })()`);
  log('click city: ' + JSON.stringify(clickCity));
  await sleep(600);
  await shot('b4_map_city_clicked');

  return { done: true, pick0, pick1, pick2, st1, clickCity };
}
