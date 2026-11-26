// P1 最終實機：袁紹多城（國庫≠本城金）、南皮超編 12/10、內政終了→次年 1 月、城旗截圖
export default async function ({ evaluate, sleep, log, shot, click }) {
  const ev = async (x) => {
    const v = await evaluate(x);
    if (v && v.__throw) throw new Error(String(v.__throw).slice(0, 400));
    return v;
  };
  const BASE = 'http://127.0.0.1:5173/web/';

  // 新局：劇本2（189 討伐董卓）+ 袁紹（多城，南皮 12 名武將）
  await ev(`location.href = '${BASE}campaign.html?panel=new&bg=0&dev=1&v1check=1&probe=r7&p4=' + Date.now(); 'go'`);
  await sleep(3000);
  log('scen=' + await ev(`(() => { const el = document.querySelector('.scard[data-pick="1"]'); if (!el) return 'no'; el.click(); return el.querySelector('.scn')?.textContent; })()`));
  await sleep(400);
  log('toKing=' + await ev(`(() => { const b = document.getElementById('btnPickStart'); if (!b) return 'no'; b.click(); return b.textContent; })()`));
  await sleep(500);
  log('king=' + await ev(`(() => { const el = document.querySelector('.scard[data-king="袁紹"]'); if (!el) return 'no'; el.click(); return el.querySelector('.scn')?.textContent; })()`));
  await sleep(400);
  log('start=' + await ev(`(() => { const b = document.getElementById('btnPickStart'); if (!b) return 'no'; b.click(); return b.textContent; })()`));
  await sleep(2600);

  const top = await ev(`(() => {
    const s = window.__r7 ? window.__r7.state() : null;
    return {
      scName: document.getElementById('scName')?.textContent,
      ym: document.getElementById('ym')?.textContent,
      gold: document.getElementById('gold')?.textContent,
      month: s?.month, owned: s?.owned, saveGold: s?.gold,
      rows: [...document.querySelectorAll('#cityList .row')].slice(0, 4).map(e => e.innerText.replace(/\\s+/g, ' ')),
    };
  })()`);
  log('TOP4 ' + JSON.stringify(top, null, 1).slice(0, 2400));

  // 點南皮（袁紹自己的城，12 名武將 > 10）→ 城市卡要看得到 N / 10 與「超編」
  const hit = await ev(`(() => {
    if (!window.__v1) return { err: 'no __v1' };
    const c = window.__v1.cities().find(x => x.name === '南皮');
    if (!c) return { err: 'no city' };
    const xy = window.__v1.toScreen(c.xy[0], c.xy[1]);
    return { sx: Math.round(xy[0]), sy: Math.round(xy[1]), name: window.__v1.hit(Math.round(xy[0]), Math.round(xy[1])) };
  })()`);
  log('HIT ' + JSON.stringify(hit));
  if (hit && hit.sx) { await click(hit.sx, hit.sy); await sleep(900); }
  const card = await ev(`(() => ({
    card: document.getElementById('cityCard')?.innerText?.replace(/\\s+/g, ' ') ?? null,
    hint: document.getElementById('hint')?.textContent ?? null,
    colored: [...document.querySelectorAll('#cityCard span')].filter(e => (e.getAttribute('style') || '').includes('E2554B')).map(e => e.innerText),
  }))()`);
  log('CARD ' + JSON.stringify(card, null, 1).slice(0, 1800));
  const sf = await shot('p1_map_yuanshao_card'); log('shot ' + JSON.stringify(sf));

  // city.html 南皮：本城金 vs 國庫、N/10 標紅
  await ev(`location.href = '${BASE}city.html?city=' + encodeURIComponent('南皮') + '&dev=1&p4=' + Date.now(); 'go'`);
  await sleep(2600);
  const city = await ev(`(() => ({
    headSub: document.getElementById('headSub')?.textContent,
    chips: [...document.querySelectorAll('.chip')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    gens: document.getElementById('vGens')?.textContent,
    gensClass: document.getElementById('vGens')?.className,
    gensTitle: document.getElementById('vGens')?.title,
    goldChip: { label: document.getElementById('vGold')?.previousElementSibling?.textContent, value: document.getElementById('vGold')?.textContent },
    fvGold: { label: document.getElementById('fvGold')?.previousElementSibling?.textContent, value: document.getElementById('fvGold')?.textContent },
    grid: [...document.querySelectorAll('#grid .cmd')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    subgrid: [...document.querySelectorAll('#subgrid .cmd')].map(e => e.innerText.replace(/\\s+/g, ' ')),
    api: window.__city ? { national: window.__city.national, cityGold: window.__city.cityGold, gensCap: window.__city.gensCap } : null,
  }))()`);
  log('CITY4 ' + JSON.stringify(city, null, 1).slice(0, 2600));
  const sc = await shot('p1_city_nanpi_over'); log('shot ' + JSON.stringify(sc));

  // 回大地圖：內政終了 → 次年 1 月（F4），並讀日誌
  await ev(`location.href = '${BASE}campaign.html?bg=0&dev=1&v1check=1&probe=r7&p5=' + Date.now(); 'go'`);
  await sleep(2800);
  const pre = await ev(`(() => ({ ym: document.getElementById('ym')?.textContent, month: window.__r7?.state().month, gold: document.getElementById('gold')?.textContent }))()`);
  log('PRE_END ' + JSON.stringify(pre));
  log('clickEnd=' + await ev(`(() => { const b = document.getElementById('btnEndMonth'); if (!b || b.hidden) return 'hidden'; b.click(); return 'ok'; })()`));
  await sleep(5000);
  const post = await ev(`(() => {
    const s = window.__r7 ? window.__r7.state() : null;
    return {
      ym: document.getElementById('ym')?.textContent,
      month: s?.month, gold: document.getElementById('gold')?.textContent,
      log: (s?.log || []).slice(-12).map(e => (typeof e === 'string' ? e : e && (e.text || e.msg || JSON.stringify(e)))),
    };
  })()`);
  log('POST_END ' + JSON.stringify(post, null, 1).slice(0, 3000));
  const se = await shot('p1_map_endmonth_yuanshao'); log('shot ' + JSON.stringify(se));

  return { top, card, city, pre, post };
}
