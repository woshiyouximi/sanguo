// web 時鐘 CDP 驗收（第三輪）：
//   A. 清存檔 → 新局走 UI → 大地圖量 16 秒（月 +3）→ 開存檔浮層確認停錶（至少 3 次嘗試；
//      敵軍若在這 16 秒內抵達城下會正常跳守城頁，屬兵團逐幀推進的正常行為，記一筆後重試）
//   B. 把存檔月序改成 12（年內 12 月 → T 重算成 300）→ reload 讀檔 → 等 T=0 自動內政
//      → 截內政浮層（year+1、月 13）→ 點「內政終了」→ 驗 T=3600 / 時間恢復流動
// 用法：node work\cocos_verify\cdpweb.mjs run work\webclock\steps.mjs
// env：PORT=9352 MATCH=127.0.0.1:9351 OUTDIR=F:\sanguo\work\webclock
const PAGE = 'http://127.0.0.1:9351/web/campaign.html?dev=1&auto=1';
// 為什麼帶 ?dev=1&auto=1：AI 的 planMonth 用「月份」當種子，新局第 2 月必定攻玩家（三次純 URL
// 嘗試都在第 2 月被敵襲跳去守城頁）；auto=1 是 repo 保留的「原地結算」調試口子，不影響逐幀時鐘。

const READ_EXPR = `(() => {
  const c = window.__clock;
  const txt = (id) => { const el = document.getElementById(id); return el ? el.textContent : ''; };
  const vis = (id) => { const el = document.getElementById(id); return !!(el && !el.hidden); };
  return JSON.stringify({
    clock: c ? c.state() : null,
    ym: txt('ym'),
    clockNow: txt('clockNow'),
    pickOpen: vis('pickSheet'),
    saveOpen: vis('saveSheet'),
    interiorOpen: vis('interiorSheet'),
    intBody: txt('intBody').replace(/\\s+/g, ' ').trim(),
    path: location.pathname,
    docHidden: document.hidden,
  });
})()`;

export default async function steps({ s, evaluate, shot, sleep, log }) {
  let stage = 'init';
  // 有頭 Edge 若被其他窗口遮住/最小化，Chromium 會把頁面當 hidden → 時鐘按設計停錶；
  // 驗收前先把頁面推到前景（對齊「玩家正在看地圖」的前提）。
  try { await s('Page.bringToFront'); } catch { /* 老 CDP 沒這命令就略過 */ }
  await sleep(400);
  const parse = (v) => { try { return typeof v === 'string' ? JSON.parse(v) : null; } catch { return null; } };
  const read = async () => {
    for (let i = 0; i < 10; i += 1) {
      const got = parse(await evaluate(READ_EXPR));
      if (got) return got;
      await sleep(300);
    }
    return null;
  };
  const waitTrue = async (expr, ms = 25000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if ((await evaluate(expr)) === true) return true;
      await sleep(250);
    }
    return false;
  };
  const clickSel = (sel) => evaluate(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; el.click(); return true; })()`);
  const onMap = async () => {
    const got = await read();
    return Boolean(got && got.clock && got.path === '/web/campaign.html');
  };

  // 回到乾淨的大地圖起點
  const boot = async () => {
    stage = 'boot';
    await evaluate(`localStorage.clear(); location.href = ${JSON.stringify(PAGE)}; true`);
    await sleep(1600);
    try { await s('Page.bringToFront'); } catch { /* ignore */ }
    await waitTrue(`typeof window.__clock === 'object'`);
    return read();
  };
  // 走 UI 開新局：劇本卡 → 君主卡 → 開始
  const startNewGame = async () => {
    stage = 'start';
    for (let i = 0; i < 24; i += 1) {
      const pickOpen = await evaluate(`!document.getElementById('pickSheet').hidden`);
      if (!pickOpen) break;
      await evaluate(`(() => {
        const start = document.getElementById('btnPickStart');
        if (start && !start.disabled) { start.click(); return 'start'; }
        const pick = document.querySelector('#pickCards [data-pick]');
        if (pick) { pick.click(); return 'pick'; }
        const king = document.querySelector('#pickCards [data-king]');
        if (king) { king.click(); return 'king'; }
        return '';
      })()`);
      await sleep(300);
    }
    await waitTrue(`!!(window.__clock && Number(window.__clock.state().month) > 0)`, 25000);
    await sleep(900);
    return read();
  };

  const fresh = await boot();

  // A：16 秒大地圖（最多 3 次；被敵襲跳走就重試）
  let measured = null;
  const attempts = [];
  for (let attempt = 1; attempt <= 3 && !measured; attempt += 1) {
    if (attempt > 1) {
      await boot();
    }
    const started = await startNewGame();
    const before = await read();
    await shot('map_before');
    const t0 = Date.now();
    await sleep(8000);
    const mid = await read();
    await shot('map_mid_8s');
    await sleep(8000);
    const after = await read();
    await shot('map_after_16s');
    const elapsedSec = Number(((Date.now() - t0) / 1000).toFixed(2));
    const alive = Boolean(after && after.clock && after.path === '/web/campaign.html' && !after.docHidden);
    const rec = {
      attempt,
      started: started && started.clock ? { t: started.clock.t, month: started.clock.month, ym: started.ym } : null,
      before: before && before.clock ? { t: before.clock.t, month: before.clock.month, ym: before.ym } : null,
      mid8s: mid && mid.clock ? { t: mid.clock.t, month: mid.clock.month, ym: mid.ym } : null,
      after16s: after && after.clock ? { t: after.clock.t, month: after.clock.month, ym: after.ym } : null,
      elapsedSec,
      interruptedByBattle: !alive,
      path: after ? after.path : null,
    };
    if (alive && rec.before && rec.after16s) {
      rec.monthsAdvanced = rec.after16s.month - rec.before.month;
      rec.ticksElapsed = rec.before.t - rec.after16s.t;
      measured = rec;
    }
    attempts.push(rec);
    log('measure attempt', attempt, JSON.stringify({ alive, monthBefore: rec.before && rec.before.month, monthAfter: rec.after16s && rec.after16s.month }));
    if (!alive) {
      // 敵軍抵達 → 正常跳守城頁：這不算時鐘壞，重試一次乾淨的 16 秒
      continue;
    }
    // A② 開存檔浮層：任一模态/抽屉打開 → 停錶（原作 0x41BEC1）
    stage = 'pause';
    await clickSel('#btnSave');
    await sleep(1200);
    const pause1 = await read();
    await sleep(4000);
    const pause2 = await read();
    await shot('panel_paused');
    await clickSel('#saveSheet [data-close]');
    await sleep(600);
    const resumed = await read();
    measured.panelPaused = pause1 && pause2 && pause1.clock && pause2.clock
      ? {
        open: pause1.saveOpen,
        monthFrozen: pause1.clock.month === pause2.clock.month,
        tFrozen: pause1.clock.t === pause2.clock.t,
        t: pause1.clock.t,
        month: pause1.clock.month,
        runningWhileOpen: pause2.clock.running,
        tAfter: pause2.clock.t,
      }
      : null;
    measured.resumedRunning = resumed && resumed.clock ? resumed.clock.running : null;
  }
  if (!measured) return { ok: false, attempts };

  // B：先回到乾淨新局（玩家有城，內政浮層的「進城內政」才有目標），再把存檔月序改成 12 月
  //    → reload 讀檔，T 應重算成 300（＝3600 − 11×300），約 5 秒後 T=0 自動進內政
  stage = 'patchBoot';
  await boot();
  await startNewGame();
  await read();
  stage = 'patch';
  const patch = await evaluate(`(() => {
    const patchKey = (key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return 0;
      let obj;
      try { obj = JSON.parse(raw); } catch { return -1; }
      let n = 0;
      const hit = (snap) => {
        if (snap && typeof snap === 'object' && Number.isFinite(Number(snap.month))) { snap.month = 12; n += 1; }
      };
      if (Array.isArray(obj.slots)) obj.slots.forEach((e) => hit(e && e.snapshot));
      else hit(obj);
      localStorage.setItem(key, JSON.stringify(obj));
      return n;
    };
    return JSON.stringify({ store: patchKey('sanguo_saves_v1'), legacy: patchKey('sanguo_campaign_v1') });
  })()`);
  await evaluate(`location.reload(); true`);
  await sleep(1600);
  try { await s('Page.bringToFront'); } catch { /* ignore */ }
  stage = 'load12';
  const loaded12 = await waitTrue(`!!(window.__clock && Number(window.__clock.state().month) === 12)`, 25000);
  const nearEnd = await read();
  stage = 'interior';
  const gotInterior = await waitTrue(`!!(document.getElementById('interiorSheet') && !document.getElementById('interiorSheet').hidden)`, 15000);
  await sleep(500);
  const interior = await read();
  await shot('interior_gate');

  // 內政終了：只把 T 重設 3600、回大地圖（原作 0x41BBF5；不跑月份模擬）
  stage = 'endInterior';
  await clickSel('#btnInteriorEnd');
  await sleep(900);
  const ended = await read();
  await shot('interior_ended');

  const result = {
    ok: true,
    url: PAGE,
    fresh,
    attempts,
    measured,
    patch: parse(patch),
    loaded12,
    loadedNearYearEnd: nearEnd && nearEnd.clock
      ? { t: nearEnd.clock.t, month: nearEnd.clock.month, year: nearEnd.clock.year, ym: nearEnd.ym }
      : null,
    gotInterior,
    interior: interior && interior.clock
      ? {
        open: interior.interiorOpen,
        t: interior.clock.t,
        month: interior.clock.month,
        year: interior.clock.year,
        ym: interior.ym,
        frozen: interior.clockNow,
        paused: interior.clock.paused,
        body: interior.intBody.slice(0, 160),
      }
      : null,
    interiorEnded: ended && ended.clock
      ? {
        t: ended.clock.t,
        month: ended.clock.month,
        year: ended.clock.year,
        ym: ended.ym,
        running: ended.clock.running,
        interiorOpen: ended.interiorOpen,
      }
      : null,
  };
  log('WEB CLOCK RESULT:', JSON.stringify({
    measured: {
      months: result.measured.monthsAdvanced,
      ticks: result.measured.ticksElapsed,
      sec: result.measured.elapsedSec,
      paused: result.measured.panelPaused,
    },
    loadedT: result.loadedNearYearEnd && result.loadedNearYearEnd.t,
    interior: result.interior,
    ended: result.interiorEnded,
  }));
  return result;
}
