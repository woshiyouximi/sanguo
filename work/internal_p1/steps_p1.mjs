// P1 實機驗收：F5 起始年 / F16 錢口徑 / F19 武將上限 / F28 城旗（campaign）+ F7/F16/F19（city.html）
export default async function ({ evaluate, sleep, log, shot, click }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  const BASE = 'http://127.0.0.1:5173/web/';

  // ---------------- A. campaign：新局（劇本2 討伐董卓 189，君主 董卓）
  await ev(`location.href = '${BASE}campaign.html?panel=new&bg=0&v1check=1&armyui=1&probe=r7&p1=' + Date.now(); 'go'`);
  await sleep(3200);
  log('pickCards=' + await ev(`document.querySelectorAll('#pickCards .scard').length`));
  log('clickScen=' + await ev(`(() => { const el = document.querySelector('.scard[data-pick="1"]'); if (!el) return 'no-card'; el.click(); return el.textContent.trim().slice(0, 30); })()`));
  await sleep(400);
  log('clickKingStep=' + await ev(`(() => { const b = document.getElementById('btnPickStart'); if (!b) return 'no-btn'; b.click(); return b.textContent; })()`));
  await sleep(500);
  log('clickKing=' + await ev(`(() => { const el = document.querySelector('.scard[data-king="董卓"]'); if (!el) return 'no-king-card'; el.click(); return el.textContent.trim().slice(0, 24); })()`));
  await sleep(400);
  log('start=' + await ev(`(() => { const b = document.getElementById('btnPickStart'); if (!b) return 'no-btn'; b.click(); return b.textContent; })()`));
  await sleep(2600);

  const top = await ev(`(() => ({
    scName: document.getElementById('scName')?.textContent,
    ym: document.getElementById('ym')?.textContent,
    gold: document.getElementById('gold')?.textContent,
    goldLabel: document.getElementById('gold')?.parentElement?.previousElementSibling?.textContent ?? null,
    cityCard: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ').slice(0, 300) ?? null,
    rows: [...document.querySelectorAll('#cityList .row, #cityList li, #list .row')].slice(0, 3).map(e => e.innerText.replace(/\\s+/g, ' ')),
    state: window.__r7 ? window.__r7.state() : null,
  }))()`);
  log('TOP ' + JSON.stringify(top, null, 1).slice(0, 2600));

  // F28：城旗像素取樣（旗在城左側 sx-25, sy-13 一帶；alpha .96 → 容忍 ±14）
  const flagProbe = await ev(`(() => {
    const cv = document.querySelector('#map');
    if (!cv || !window.__v1) return { err: 'no canvas / __v1' };
    const g = cv.getContext('2d');
    const PAL = (window.Saves && window.Saves.FORCE_PALETTE) ? window.Saves.FORCE_PALETTE.map(e => e.color) : [];
    const rgb = (h) => [1,3,5].map(i => parseInt(h.slice(i, i+2), 16));
    const pal = PAL.map(h => ({ h, v: rgb(h) }));
    const near = (d) => {
      const best = pal.map(p => ({ h: p.h, d: Math.abs(d[0]-p.v[0]) + Math.abs(d[1]-p.v[1]) + Math.abs(d[2]-p.v[2]) })).sort((a,b) => a.d-b.d)[0];
      return best && best.d <= 42 ? best : null;
    };
    const cities = window.__v1.cities();
    const out = [];
    for (const c of cities.slice(0, 60)) {
      const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
      const sx = Math.round(xy[0]); const sy = Math.round(xy[1]);
      if (sx < 40 || sy < 40 || sx > cv.width - 10 || sy > cv.height - 10) continue;
      // 城左側 18~27px、上方 6~15px：只有小旗會落在這裡（環在半徑 18 附近，已在更外圈）
      let hits = 0; let color = null;
      for (const dx of [-27, -25, -23, -21]) for (const dy of [-15, -12, -9]) {
        try {
          const d = g.getImageData(sx + dx, sy + dy, 1, 1).data;
          if (d[3] < 200) continue;
          const m = near([d[0], d[1], d[2]]);
          if (m) { hits += 1; color = color || m.h; }
        } catch { /* ignore */ }
      }
      if (hits) out.push({ city: c.NAME, hits, color });
    }
    return { palette: PAL.length, flagged: out.length, sample: out.slice(0, 8) };
  })()`);
  log('FLAGS ' + JSON.stringify(flagProbe, null, 1).slice(0, 1600));
  const s1 = await shot('p1_map_189_year1'); log('shot ' + JSON.stringify(s1));

  // F4：內政終了 → 跑完一年
  log('endMonthClick=' + await ev(`(() => { const b = document.getElementById('btnEndMonth'); if (!b || b.hidden) return 'hidden'; b.click(); return 'clicked'; })()`));
  await sleep(4200);
  const after = await ev(`(() => ({
    ym: document.getElementById('ym')?.textContent,
    gold: document.getElementById('gold')?.textContent,
    month: window.__r7 ? window.__r7.state().month : null,
    logTail: [...document.querySelectorAll('#log .li, #log div')].slice(-6).map(e => e.innerText.replace(/\\s+/g, ' ')),
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ').slice(0, 240) ?? null,
    officerCell: [...document.querySelectorAll('#cityCard *')].map(e => e.innerText).filter(t => t && t.includes('/') && t.length < 24).slice(0, 6),
  }))()`);
  log('AFTER_ENDMONTH ' + JSON.stringify(after, null, 1).slice(0, 2600));
  const s2 = await shot('p1_map_after_endmonth'); log('shot ' + JSON.stringify(s2));

  // ---------------- B. city.html（本年 1 月，仍可內政）
  const owned = await ev(`window.__r7 ? window.__r7.state().owned[0] : null`);
  log('owned[0]=' + owned);
  await ev(`location.href = '${BASE}city.html?city=' + encodeURIComponent(${JSON.stringify(owned)}) + '&p1=' + Date.now(); 'go'`);
  await sleep(2600);
  const city = await ev(`(() => ({
    headSub: document.getElementById('headSub')?.textContent,
    cmdHint: document.getElementById('cmdHint')?.textContent,
    chips: [...document.querySelectorAll('.chip')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    grid: [...document.querySelectorAll('#grid .cmd')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    subgrid: [...document.querySelectorAll('#subgrid .cmd')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    civic: [...document.querySelectorAll('.civic .cell, .civic > *')].map(e => e.innerText.replace(/\\s+/g, ' ')).slice(0, 10),
    lock: document.getElementById('vLock')?.textContent,
    gens: document.getElementById('vGens')?.textContent,
    gold: { label: document.getElementById('vGold')?.previousElementSibling?.textContent, value: document.getElementById('vGold')?.textContent },
    fvGold: (() => { const e = document.getElementById('fvGold'); return { label: e?.previousElementSibling?.textContent, value: e?.textContent }; })(),
    api: window.__city ? { national: window.__city.national, cityGold: window.__city.cityGold, gensCap: window.__city.gensCap, cmdOrder: window.__city.cmdOrder, cmdSecondary: window.__city.cmdSecondary } : null,
  }))()`);
  log('CITY ' + JSON.stringify(city, null, 1).slice(0, 3200));
  const s3 = await shot('p1_city_main'); log('shot ' + JSON.stringify(s3));

  // 武將資料（含使用物品）
  log('openGeneral=' + await ev(`(() => { const b = [...document.querySelectorAll('#grid .cmd')].find(e => e.innerText.includes('武將資料')); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`));
  await sleep(700);
  const genSheet = await ev(`(() => ({ title: document.getElementById('sheetTitle')?.textContent, body: document.getElementById('sheetBody')?.innerText.replace(/\\s+/g, ' ').slice(0, 400), hasItems: !!document.getElementById('goItems') || document.getElementById('sheetBody')?.innerText.includes('使用物品') }))()`);
  log('GEN_SHEET ' + JSON.stringify(genSheet));
  const s4 = await shot('p1_city_generaldata'); log('shot ' + JSON.stringify(s4));
  await ev(`(() => { const b = document.getElementById('sheetCancel'); if (b) b.click(); return 'closed'; })()`);
  await sleep(300);

  // 情報（副令、只讀）
  log('openIntel=' + await ev(`(() => { const b = [...document.querySelectorAll('#subgrid .cmd')].find(e => e.innerText.includes('情報')); if (!b) return 'no-btn'; b.click(); return 'ok'; })()`));
  await sleep(700);
  const intel = await ev(`(() => ({ title: document.getElementById('sheetTitle')?.textContent, body: document.getElementById('sheetBody')?.innerText.replace(/\\s+/g, ' ').slice(0, 300), hasOk: !!document.getElementById('sheetOk') && !document.getElementById('sheetOk').hidden, lock: document.getElementById('vLock')?.textContent }))()`);
  log('INTEL ' + JSON.stringify(intel));
  const s5 = await shot('p1_city_intel'); log('shot ' + JSON.stringify(s5));

  return { ok: true, top, after, city, flags: flagProbe, shots: [s1, s2, s3, s4, s5] };
}
