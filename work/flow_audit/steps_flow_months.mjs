// work/flow_audit/steps_flow_months.mjs —— 開局 → 連推 12 個月，觀察歲入/守軍自漲/預備兵/年進位/內政窗口
export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => {
    try { const v = await evaluate(x); if (v && v.__throw) return { __throw: v.__throw }; return v; } catch (e) { return { __throw: String((e && e.message) || e) }; }
  };
  const J = async (x) => {
    const v = await ev(x);
    if (v && v.__throw) return { __throw: v.__throw };
    try { return JSON.parse(v); } catch { return v; }
  };
  const go = async (url) => {
    await s('Page.navigate', { url });
    await sleep(800);
    for (let i = 0; i < 150; i += 1) { if (await ev('document.readyState') === 'complete') break; await sleep(200); }
    await sleep(1200);
  };
  const BASE = 'http://127.0.0.1:5299/web/';
  try { await s('Network.enable'); await s('Network.setCacheDisabled', { cacheDisabled: true }); } catch (e) { log('cache off fail ' + e); }

  await go(BASE + 'campaign.html');
  const pages = await J(`(() => JSON.stringify({ pick: (() => { const e = document.getElementById('pickSheet'); return !!(e && !e.hidden && e.offsetParent !== null); })() }))()`);
  log('pick visible: ' + JSON.stringify(pages));
  if (pages && pages.pick === true) {
    const started = await J(`(async () => {
      const sc = [...document.querySelectorAll('[data-sc]')].filter((e) => e.offsetParent !== null);
      if (sc[1]) sc[1].click();
      await new Promise((r) => setTimeout(r, 400));
      const k = [...document.querySelectorAll('#pickCards [data-king]')].find((c) => c.dataset.king === '曹操');
      if (k) k.click();
      await new Promise((r) => setTimeout(r, 400));
      const st = document.getElementById('btnPickStart');
      if (st && !st.disabled) st.click();
      await new Promise((r) => setTimeout(r, 1500));
      return JSON.stringify({ ok: true, king: k && k.dataset.king });
    })()`);
    log('start: ' + JSON.stringify(started));
    await sleep(1200);
  }

  const snap = `(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const i = (raw.slots || []).findIndex((x) => x && x.snapshot);
    if (i < 0) return JSON.stringify({ err: 'no slot', keys: Object.keys(raw) });
    const s = raw.slots[i].snapshot;
    const city = (s.owned || [])[0];
    const st = (s.cities || {})[city] || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, city,
      troops: st.troops, pop: st.pop, money: st.money, prep: st.prep, def: st.def,
      lastActionMonth: s.lastActionMonth,
      logTail: (s.log || []).slice(-3).map((x) => (x.t || '') + ' ' + (x.s || x.text || '')) });
  })()`;

  const before = await J(snap);
  log('T0: ' + JSON.stringify(before));
  const timeline = [];
  for (let k = 0; k < 12; k += 1) {
    await ev(`(() => { const b = document.querySelector('#actions [data-act="advance"]'); if (b) b.click(); return 1; })()`);
    await sleep(650);
    const st = await J(snap);
    timeline.push(st);
    log(`T${k + 1}: ` + JSON.stringify({ m: st.month, y: st.year, gold: st.gold, troops: st.troops, prep: st.prep, def: st.def, last: (st.logTail || []).slice(-1)[0] }));
  }
  await shot('c1_after_12_months');
  return { before, timeline };
}
