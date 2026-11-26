// F26 武將站位（前 / 中 / 後列）實機驗收腳本（v3）。
//
// v1/v2 的坑：Edge 視窗最小化 ⇒ document.visibilityState=hidden，CDP Input 全被丟掉；
// 另外 reload 後 Chrome 會恢復捲動位置，scrollIntoView 後立刻取 rect 會取到捲動中的座標，
// 點擊落到隔壁的兵種 <select>（把大刃改成了鏈錘）。v3 修法：
//   ① 先把視窗 setWindowBounds(normal) + bringToFront；
//   ② localStorage.clear() 從乾淨隊列開始；
//   ③ 每次點擊 → 等捲動 settle → 取 rect → elementFromPoint 必須就是那顆鈕 → 點 → 驗按鈕態，
//      沒生效就重試（最多 4 次），並把每次的 rect/命中元素記進結果。
const BASE = 'http://127.0.0.1:5174';

export default async function ({ evaluate, sleep, click, shot, log, send, page }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const nav = async (url, waitExpr, tries = 80) => {
    await send('Page.navigate', { url });
    for (let i = 0; i < tries; i += 1) {
      await sleep(250);
      if (await ev(waitExpr)) return true;
    }
    return false;
  };
  const settle = async () => {
    let prev = NaN;
    for (let i = 0; i < 12; i += 1) {
      const s = await ev(`[Math.round(scrollY), Math.round((document.scrollingElement || {}).scrollTop || 0)]`);
      if (s[0] === prev) return s;
      prev = s[0];
      await sleep(90);
    }
    return null;
  };
  const rectOf = async (sel) => {
    await ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (el) el.scrollIntoView({ block: 'center', behavior: 'instant' }); })()`);
    await settle();
    return ev(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
      const b = el.getBoundingClientRect(); const x = b.x + b.width / 2, y = b.y + b.height / 2;
      const hit = document.elementFromPoint(x, y);
      return { x, y, w: b.width, h: b.height, scrollY: Math.round(scrollY),
        hit: hit ? hit.tagName + '|' + ((hit.dataset || {}).qcol || '') : null }; })()`);
  };
  const activeCols = () => ev(`(() => [...document.querySelectorAll('#qlist .qrow')].map((row) =>
      [...row.querySelectorAll('[data-qcol]')].filter((b) => b.classList.contains('on')).map((b) => String(b.dataset.qcol).split(':')[1])))()`);
  const clickCol = async (sel, rowIdx, want) => {
    const log = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await rectOf(sel);
      log.push(r);
      if (!r || !String(r.hit || '').endsWith('|' + want)) { await sleep(150); continue; }
      await click(r.x, r.y);
      await sleep(350);
      const st = await activeCols();
      if (st[rowIdx] && st[rowIdx].join() === want) return { ok: true, via: 'real-mouse', tries: i + 1, log, state: st };
    }
    // 這台機器的 CDP Input 偶發送不進頁面（視窗被最小化/遮擋時整批丟掉）：
    // 退化用 DOM click（同一個 document 委派監聽，走的還是同一條 handler），並在結果裡標明。
    const r = await rectOf(sel);
    const st0 = await ev(`(() => { const b = document.querySelector(${JSON.stringify(sel)}); if (!b) return null; b.click();
      return [...document.querySelectorAll('#qlist .qrow')].map((row) => [...row.querySelectorAll('[data-qcol]')].filter((x) => x.classList.contains('on')).map((x) => String(x.dataset.qcol).split(':')[1])); })()`);
    return { ok: !!(st0 && st0[rowIdx] && st0[rowIdx].join() === want), via: 'dom-click-fallback', log, state: st0 };
  };
  const wake = async () => {
    await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal' } });
    await sleep(250);
    await send('Page.bringToFront');
    await sleep(300);
  };

  // ⓪ 恢復被最小化的 Edge 視窗
  const win = await send('Browser.getWindowForTarget', { targetId: page.id });
  await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal' } });
  await sleep(300);
  await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 40, top: 20, width: 900, height: 1500 } });
  await send('Page.bringToFront');
  await sleep(500);

  const out = { windowId: win.windowId, visibility: await ev(`document.visibilityState`) };

  // ───────────────────────────── ① 編成頁（乾淨隊列）
  const deployUrl = BASE + '/web/deploy.html?' + new URLSearchParams({
    city: '南皮', from: '南皮', a: '關羽', troops: '200', bsoldiers: '125',
  }).toString();
  out.deployUrl = deployUrl;
  out.deployLoaded = await nav(deployUrl, `document.querySelectorAll('#qlist .qrow').length > 0`);
  await ev(`localStorage.clear()`);
  out.reloaded = await nav(deployUrl, `document.querySelectorAll('#qlist .qrow').length > 0`);
  await sleep(400);
  await wake();
  out.pageState = await ev(`({ vis: document.visibilityState, focus: document.hasFocus(), scrollY: Math.round(scrollY) })`);
  out.names = await ev(`(() => [...document.querySelectorAll('#qlist .qrow')].map((row) => (row.querySelector('.qn') || {}).textContent))()`);
  out.troops0 = await ev(`(() => [...document.querySelectorAll('#qlist .qrow')].map((row) => (row.querySelector('.qnum') || {}).textContent))()`);
  out.colsBefore = await activeCols();

  out.clickFront = await clickCol('[data-qcol="0:front"]', 0, 'front');
  out.clickBack = await clickCol('[data-qcol="1:back"]', 1, 'back');
  out.colsStored = await ev(`localStorage.getItem('sanguo_deploy_cols_v1')`);
  out.shotDeploy = await shot('f26_deploy_cols.png');
  if (!out.clickFront.ok || !out.clickBack.ok) throw new Error('三檔按鈕沒點中：' + JSON.stringify({ front: out.clickFront, back: out.clickBack }));

  // ───────────────────────────── ② 出陣 → 真實 URL
  const go = await rectOf('#go');
  await click(go.x, go.y);
  let battleUrl = '';
  for (let i = 0; i < 60; i += 1) {
    await sleep(250);
    const href = await ev(`location.href`);
    if (href && href.includes('/web/index.html')) { battleUrl = href; break; }
  }
  if (!battleUrl) throw new Error('點出陣後沒有跳到 index.html');
  out.clickGo = go;
  out.battleUrl = battleUrl;
  out.urlCols = new URL(battleUrl).searchParams.get('cols');
  out.urlSoldiers = new URL(battleUrl).searchParams.get('soldiers');
  out.urlTroop = new URL(battleUrl).searchParams.get('troop');

  // ───────────────────────────── ③ 戰鬥頁量測
  const measure = async (label, patch, doShot = true) => {
    const p = new URL(battleUrl);
    for (const [k, v] of Object.entries(patch || {})) p.searchParams.set(k, v);
    const ok = await nav(p.toString(), `!!(window.__sanguo && window.__sanguo.booted && window.__sanguo.state && window.__sanguo.state.world)`);
    if (!ok) throw new Error('戰鬥頁沒有 boot：' + label);
    const m0 = await ev(`(() => {
      const S = window.__sanguo, w = S.state.world;
      const g = (side) => w.units.find((x) => x.side === side && x.isGeneral) || null;
      const a = g('A'), b = g('B');
      const sA = w.units.filter((x) => x.side === 'A' && !x.isGeneral && x.alive);
      return {
        mode: S.state.mode, tick: w.tick, camX: S.state.camX,
        aName: w.sides.A.general.name, aSideCol: w.sides.A.col || null,
        aGx: a ? a.x : null, aCol: a ? a.col : null, aLane: a ? a.y : null,
        bGx: b ? b.x : null, bCol: b ? b.col : null,
        aSoldiers: sA.length, aFrontMostSoldierGx: sA.length ? Math.min(...sA.map((x) => x.x)) : null,
        aBackMostSoldierGx: sA.length ? Math.max(...sA.map((x) => x.x)) : null,
      };
    })()`);
    const shotInfo = doShot ? await shot(label) : null;
    await ev(`window.__sanguo.skipTaunt()`);
    await sleep(450);
    const camAfter = await ev(`window.__sanguo.state.camX`);
    return { label, ...m0, camAfterSkip: camAfter, shot: shotInfo };
  };

  out.runs = [];
  out.runs.push(await measure('f26_battle_front.png', null, true));                                  // 出征頁真帶來的（關羽:front, soldiers=10）
  out.runs.push(await measure('f26_battle_back.png', { a: '張飛', gen: '張飛', cols: '張飛:back' }, true)); // 同一份出征令換成被設「後」的張飛
  out.runs.push(await measure('f26_battle_mid.png', { a: '關羽', gen: '關羽', cols: '' }, false));     // 對照：中列
  out.runs.push(await measure('f26_battle_front100.png', { cols: '關羽:front', soldiers: '100' }, true)); // 滿編：確認換位不被前排小兵吃掉
  out.runs.push(await measure('f26_battle_back100.png', { cols: '關羽:back', soldiers: '100' }, true));
  out.runs.push(await measure('f26_battle_mid100.png', { cols: '', soldiers: '100' }, true));

  const by = (n) => out.runs.find((r) => r.label === n) || {};
  out.table = out.runs.map((r) => ({ label: r.label, aGx: r.aGx, aCol: r.aCol, camX: r.camX, camAfter: r.camAfterSkip, soldiers: r.aSoldiers, frontSoldierGx: r.aFrontMostSoldierGx }));
  out.delta = {
    'front-mid@10': (by('f26_battle_front.png').aGx ?? NaN) - (by('f26_battle_mid.png').aGx ?? NaN),
    'back-mid@10': (by('f26_battle_back.png').aGx ?? NaN) - (by('f26_battle_mid.png').aGx ?? NaN),
    'front-mid@100': (by('f26_battle_front100.png').aGx ?? NaN) - (by('f26_battle_mid100.png').aGx ?? NaN),
    'back-mid@100': (by('f26_battle_back100.png').aGx ?? NaN) - (by('f26_battle_mid100.png').aGx ?? NaN),
    'front-back@100': (by('f26_battle_front100.png').aGx ?? NaN) - (by('f26_battle_back100.png').aGx ?? NaN),
  };
  out.delta.frontBackScreenPx = Number((out.delta['front-back@100'] * 71.43).toFixed(1));
  log('F26 量測：', JSON.stringify(out.delta));
  return out;
}
