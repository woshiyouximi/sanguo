// work/flow_audit/steps_flow_map2.mjs —— 真正開局後的取證（劇本→君主→開始→地圖→城→內政）
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

  // 清 localStorage 保證乾淨開局
  await go(BASE + 'campaign.html');
  await ev(`localStorage.removeItem('sanguo_saves_v1'); 'cleared'`);
  await go(BASE + 'campaign.html');
  await sleep(800);

  // 開局：選劇本（黃巾之亂）→ 選君主 → 開始
  const open1 = await J(`(async () => {
    const vis = (el) => !!(el && !el.hidden && el.offsetParent !== null);
    const sheet = document.getElementById('pickSheet');
    const steps = [];
    if (vis(sheet)) {
      const sc = [...document.querySelectorAll('#pickCards .it, #scpick .it, .it')].length;
      // 劇本卡片（?pick=king&sc=0 步行）；先點第一張劇本卡
      const cand = [...document.querySelectorAll('[data-sc]')].filter(vis);
      steps.push({ step: 'cards', dataSc: cand.length });
      if (cand[0]) { cand[0].click(); await new Promise((r) => setTimeout(r, 400)); }
      steps.push({ ttl: (document.getElementById('pickTtl') || {}).textContent,
        kings: [...document.querySelectorAll('#pickCards [data-king]')].map((c) => c.dataset.king).slice(0, 20),
        startTxt: (document.getElementById('btnPickStart') || {}).textContent });
      const k = [...document.querySelectorAll('#pickCards [data-king]')][0];
      if (k) { k.click(); await new Promise((r) => setTimeout(r, 400)); }
      steps.push({ picked: k && k.dataset.king, warn: (document.getElementById('pickWarn') || {}).textContent });
      const st = document.getElementById('btnPickStart');
      if (st && !st.disabled) { st.click(); await new Promise((r) => setTimeout(r, 1200)); }
      steps.push({ stillSheet: vis(document.getElementById('pickSheet')) });
    }
    return JSON.stringify(steps);
  })()`);
  log('open flow: ' + JSON.stringify(open1));
  await sleep(1200);
  await shot('b1_map_after_start');
  const st1 = await J(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    return JSON.stringify({ ym: (document.getElementById('ym') || {}).textContent,
      gold: (document.getElementById('gold') || {}).textContent,
      king: (document.getElementById('kingName') || {}).textContent + '/' + (document.getElementById('kingdomName') || {}).textContent,
      month: slot && slot.snapshot && slot.snapshot.month,
      kingSnap: slot && slot.snapshot && slot.snapshot.king,
      owned: slot && slot.snapshot && slot.snapshot.owned,
      mine: [...document.querySelectorAll('#list .city.mine')].map((r) => r.dataset.name) });
  })()`);
  log('state: ' + JSON.stringify(st1));

  // 地圖上點城：用 canvas 命中測試（先算出城點螢幕座標）
  const hit = await J(`(async () => {
    const cv = document.getElementById('map');
    const r = cv.getBoundingClientRect();
    // 復刻 plotRect：CITY_BOX 88,84..1138,860；IMG 1280x960
    const box = { x0: 88, y0: 84, x1: 1138, y1: 860 };
    const IMG = { w: 1280, h: 960 };
    const PAD = 26;
    const vw = cv.width / (window.devicePixelRatio || 1), vh = cv.height / (window.devicePixelRatio || 1);
    const sc = Math.min((vw - PAD * 2) / (box.x1 - box.x0), (vh - PAD * 2) / (box.y1 - box.y0));
    const ox = vw / 2 - ((box.x0 + box.x1) / 2) * sc, oy = vh / 2 - ((box.y0 + box.y1) / 2) * sc;
    // 取第一座我方城的 pos_xy
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((x) => x && x.snapshot);
    const mineName = (slot && slot.snapshot.owned || [])[0];
    return JSON.stringify({ vw, vh, sc, ox, oy, rect: { x: r.x, y: r.y, w: r.width, h: r.height }, mineName, dpr: window.devicePixelRatio || 1 });
  })()`);
  log('hit math: ' + JSON.stringify(hit));
  return { done: true, hit, st1, open1 };
}
