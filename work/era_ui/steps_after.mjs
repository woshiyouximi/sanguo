// work/era_ui/steps_after.mjs —— 紀元/存檔/內政欄位 驗收截圖（改後 + 原作風存檔行預覽）
//
// 為什麼要「注入」存檔行：`campaign.html` 由別的 agent 持有（本任務禁改），
// 它的 `renderSlotRows()` 還是「槽 N + 3 行 9 段 + 存/讀/刪」的老樣子。
// 這裡用 `Saves.slotTitle()` / `Saves.slotLineParts()` 直接把 `#slotRows` 重畫一遍，
// 讓截圖能看到「原作 4 段」真正長什麼樣 —— 也就是 campaign.html 接上這兩個函式後的效果。
//
// 產出：after_city_fields.png / before_save.png / after_save.png（都在 OUTDIR=work/era_ui）

const BASE = 'http://127.0.0.1:5173/web/';

const PATCH = `(async () => {
  const S = await import('/web/saves.js');
  const st = S.loadStore();
  const base = (st.slots.find(Boolean) || {}).snapshot;
  if (!base) return { error: 'store 裡沒有任何一局，先開個局再跑' };
  // 10 個槽都塞「同一局」的不同時間點 —— 正好證明原作那種「同一局可占多槽」
  // 年份照 A_save_t0035.png 的行序擺，但把**第 1 個槽換成 209 年 3 月**：
  // 內政頁會落在這個槽上，這樣「時間 209年」才對得上 A_city_t0030.png 的原作面板。
  const plan = [
    [209, '金旋', 2], [286, '金旋', 2], [190, '劉備', 1], [229, '劉備', 2], [245, '劉備', 2],
    [247, '劉備', 2], [211, '金旋', 2], [210, '金旋', 1], [237, '孔岫', 2], [265, '孔岫', 2],
  ];
  plan.forEach(([ad, king, gens], i) => {
    const snap = JSON.parse(JSON.stringify(base));
    const month = (ad - 184) * 12 + 3;   // 3 月（原作年月匾是「西元 209年 3月」）
    snap.month = month;
    snap.year = S.yearOf(month);
    snap.monarch = king;
    snap.king = king;
    snap.generalLevel = {};
    snap.generalExp = {};
    for (let k = 0; k < gens; k += 1) snap.generalLevel['測試將' + k] = 1;
    S.writeSlot(st, i, S.prepareSnapshot(snap, [], {}), { scenarioName: '原作對照', ts: 1700000000000 + i });
  });
  st.last = 1;
  S.saveStore(st);
  const snap = st.slots[1].snapshot;
  return {
    ownedCount: snap.owned.length,
    city: snap.owned[0],
    slots: st.slots.map((x) => (x ? x.snapshot.month : null)),
  };
})()`;

const READ_CITY = `(() => {
  const g = (id) => { const e = document.getElementById(id); return e ? e.textContent : null; };
  const c = window.__city || {};
  return {
    search: location.search,
    headSub: g('headSub'),
    hud: { pop: g('vPop'), gold: g('vGold'), troops: g('vTroops') },
    civic: { time: g('fvTime'), king: g('fvKing'), city: g('fvCity'), gate: g('fvGate'), gens: g('fvGens'), troop: g('fvTroops'), gold: g('fvGold'), pop: g('fvPop') },
    civicRaw: c.civic ? { year: c.civic.year, adYear: c.civic.adYear, timeText: c.civic.timeText, monarch: c.civic.monarch, cityCount: c.civic.cityCount, gateCount: c.civic.gateCount, generalCount: c.civic.generalCount, troopCount: c.civic.troopCount, gold: c.civic.gold, pop: c.civic.pop } : null,
    logTimes: [...document.querySelectorAll('#log .row .t')].map((e) => e.textContent),
    civicHudPresent: !!document.getElementById('civicHud'),
    fmtProbe: c.Saves ? c.Saves.num(126500).toLocaleString('en-US') : null,
  };
})()`;

const INJECT_ROWS = `(async () => {
  const S = await import('/web/saves.js');
  const st = S.loadStore();
  const rows = st.slots.map((e, i) => {
    const parts = S.slotLineParts(e, i);
    const on = i === 0 ? ' on' : '';
    const btns = e ? '<button type="button">存</button><button type="button">讀</button>' : '<button type="button">存</button>';
    return '<div class="slot' + on + '" data-slot="' + i + '"><div class="sl">'
      + '<div class="l1"><b>' + S.slotTitle(i) + '</b>　' + parts.join('　') + '</div>'
      + '</div><div class="sbtns">' + btns + '</div></div>';
  }).join('');
  document.getElementById('slotRows').innerHTML = rows;
  const l1 = [...document.querySelectorAll('#slotRows .l1')].map((x) => x.textContent.replace(/\\s+/g, ' ').trim());
  return { rows: l1.length, lines: l1 };
})()`;

const READ_ROWS = `([...document.querySelectorAll('#slotRows .slot')].map((r) => r.textContent.replace(/\\s+/g, ' ').trim()))`;

async function waitUntil(evaluate, expr, sleep, ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = await evaluate(expr);
    if (v === true) return true;
    await sleep(250);
  }
  return false;
}

export default async ({ send, shot, evaluate, sleep, log }) => {
  const out = {};
  await send('Page.enable');
  await send('Runtime.enable');
  try {
    await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1500, deviceScaleFactor: 1, mobile: false });
  } catch (e) { log('metrics override failed: ' + e.message); }

  // 1) 大地圖：用 profile 裡現成的那一局當底本，把它複製成 10 個槽（見 PATCH 註解）
  await send('Page.navigate', { url: BASE + 'campaign.html?demo=1' });
  await waitUntil(evaluate, `document.readyState === 'complete' && (localStorage.getItem('sanguo_saves_v1') || '').includes('"slots"')`, sleep);
  await sleep(1200);
  out.patch = await evaluate(PATCH);
  log('patch = ' + JSON.stringify(out.patch));
  const city = (out.patch && out.patch.city) || '';

  // 2) 內政頁（改後）
  await send('Page.navigate', { url: BASE + 'city.html?city=' + encodeURIComponent(city) });
  await waitUntil(evaluate, `document.readyState === 'complete' && !!document.getElementById('vPop') && document.getElementById('vPop').textContent !== '—'`, sleep);
  await sleep(900);
  out.city = await evaluate(READ_CITY);
  log('city = ' + JSON.stringify(out.city));
  out.cityShot = await shot(process.env.SHOT_CITY || 'after_city_fields.png');

  // 3) 存檔面板：改前（campaign.html 現況，槽 N + 9 段 + 存/讀/刪）
  await send('Page.navigate', { url: BASE + 'campaign.html?demo=1' });
  await waitUntil(evaluate, `document.readyState === 'complete' && !!document.getElementById('btnSave')`, sleep);
  await sleep(900);
  out.open = await evaluate(`(() => { const b = document.getElementById('btnSave'); if (!b) return 'no btnSave'; b.click(); return 'clicked'; })()`);
  await waitUntil(evaluate, `document.querySelectorAll('#slotRows .slot').length === 10`, sleep);
  await sleep(800);
  out.saveBefore = await evaluate(READ_ROWS);
  log('before rows = ' + JSON.stringify(out.saveBefore.slice(0, 2)));
  out.saveBeforeShot = await shot(process.env.SHOT_SAVE_BEFORE || 'before_save.png');

  // 4) 存檔面板：接上 Saves.slotTitle / slotLineParts 之後的原作 4 段
  out.inject = await evaluate(INJECT_ROWS);
  log('inject = ' + JSON.stringify(out.inject));
  await sleep(500);
  out.saveAfterShot = await shot(process.env.SHOT_SAVE_AFTER || 'after_save.png');
  return out;
};
