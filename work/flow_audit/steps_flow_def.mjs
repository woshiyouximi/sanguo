// work/flow_audit/steps_flow_def.mjs —— 驗證：開發後 st.def 變了，但大地圖列表仍顯示劇本靜態 DEFENSE
export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => {
    try { const v = await evaluate(x); if (v && v.__throw) return { __throw: v.__throw }; return v; } catch (e) { return { __throw: String((e && e.message) || e) }; }
  };
  const J = async (x) => { const v = await ev(x); if (v && v.__throw) return { __throw: v.__throw }; try { return JSON.parse(v); } catch { return v; } };
  const go = async (url) => {
    await s('Page.navigate', { url });
    await sleep(700);
    for (let i = 0; i < 150; i += 1) { if (await ev('document.readyState') === 'complete') break; await sleep(200); }
    await sleep(1200);
  };
  const BASE = 'http://127.0.0.1:5299/web/';
  try { await s('Network.enable'); await s('Network.setCacheDisabled', { cacheDisabled: true }); } catch (e) { /* ignore */ }

  const getDef = `(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const i = (raw.slots || []).findIndex((x) => x && x.snapshot);
    const s = raw.slots[i].snapshot;
    const st = s.cities['陳留'] || {};
    return JSON.stringify({ def: st.def, pop: st.pop, gold: s.gold, month: s.month, lastActionMonth: s.lastActionMonth });
  })()`;

  await go(BASE + 'city.html?city=' + encodeURIComponent('陳留') + '&unlimited=1');
  const before = await J(getDef);
  const grid = await J(`(() => JSON.stringify({ cmds: [...document.querySelectorAll('[data-cmd]')].map((b) => b.dataset.cmd),
    chips: [...document.querySelectorAll('.chip')].map((c) => c.textContent.replace(/\\s+/g,' ').trim()).slice(0, 12) }))()`);
  log('before: ' + JSON.stringify(before) + ' grid: ' + JSON.stringify(grid));

  // 點「開發」
  const dev = await J(`(async () => {
    const b = [...document.querySelectorAll('[data-cmd]')].find((x) => x.dataset.cmd === '開發');
    if (!b) return JSON.stringify({ err: 'no dev btn' });
    b.click();
    await new Promise((r) => setTimeout(r, 800));
    const logRows = [...document.querySelectorAll('#logList .row, #log .row, .res .row')].map((r) => r.textContent.replace(/\\s+/g,' ').trim());
    return JSON.stringify({ clicked: true, logRows: logRows.slice(-3), locked: document.body.innerText.includes('本月已行動') });
  })()`);
  log('develop: ' + JSON.stringify(dev));
  await shot('d1_city_after_develop');
  const after = await J(getDef);
  log('after: ' + JSON.stringify(after));

  // 回大地圖看列表「防」
  await go(BASE + 'campaign.html');
  const list = await J(`(() => {
    const r = [...document.querySelectorAll('#list .city')].find((x) => x.dataset.name === '陳留');
    return JSON.stringify({ row: r && r.textContent.replace(/\\s+/g,' ').trim(), act: !!r,
      rows: [...document.querySelectorAll('#list .city')].slice(0, 3).map((x) => x.textContent.replace(/\\s+/g,' ').trim()) });
  })()`);
  log('campaign list: ' + JSON.stringify(list));
  await shot('d2_map_list_def');
  return { before, grid, dev, after, list };
}
