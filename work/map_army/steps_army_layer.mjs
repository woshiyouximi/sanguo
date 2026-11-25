// 大地圖部隊層驗收（project/182）：三張截圖 + 真實點擊鏈路。
//   node cdpweb.mjs run F:\sanguo\work\map_army\steps_army_layer.mjs
// 前置：MATCH=campaign、PAGE_URL=…/web/campaign.html?demo=1&armyui=1、OUTDIR=F:\sanguo\work\map_army
// 刻意走「真的滑鼠點擊」而不是直接調頁面函數：旗子只有 9px，命中半徑是這層最容易寫錯的地方。
const PAGE = process.env.PAGE_URL || 'http://127.0.0.1:5173/web/campaign.html?demo=1&armyui=1';

export default async function ({ evaluate, sleep, log, shot, click, s }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const J = async (expr) => {
    const v = await ev(expr);
    if (typeof v !== 'string') return v;
    try { return JSON.parse(v); } catch { return v; }
  };
  const state = () => J('JSON.stringify(window.__armyUi ? window.__armyUi.state() : { noProbe: true })');
  const bring = async () => { await s('Page.bringToFront'); await sleep(250); };

  // 1) 進頁面（?demo=1 只鋪示範槽，不一定有存檔 → 沒開局就點頁面自己的入口開一局）
  await bring();
  await ev(`location.href=${JSON.stringify(PAGE)}; 'nav'`);
  await sleep(3200);
  await bring();
  let st = await state();
  log('boot ' + JSON.stringify(st).slice(0, 240));
  if (!st.started) {
    // 頁面自己的入口：選劇本卡 → #btnPickStart（選君主）→ 君主卡 → #btnPickStart（開始）
    const cards = () => J('JSON.stringify({ sc: document.querySelectorAll("#pickCards [data-pick]").length, king: document.querySelectorAll("#pickCards [data-king]").length, open: !document.getElementById("pickSheet").hidden })');
    let c = await cards();
    log('picker ' + JSON.stringify(c));
    if (c.sc) {
      await ev('document.querySelector("#pickCards [data-pick]").click(); "sc"');
      await sleep(350);
      await ev('document.getElementById("btnPickStart").click(); "to-king"');
      await sleep(700);
    }
    c = await cards();
    log('king cards ' + c.king);
    if (c.king) {
      const king = await J('JSON.stringify((() => { const k = [...document.querySelectorAll("#pickCards [data-king]")].find((e) => e.dataset.off !== "1"); if (!k) return null; k.click(); return k.dataset.king; })())');
      log('king ' + JSON.stringify(king));
      await sleep(350);
      await ev('document.getElementById("btnPickStart").click(); "start"');
      await sleep(2000);
    }
    st = await state();
    log('after start ' + JSON.stringify({ started: st.started, month: st.month, armies: (st.armies || []).length }));
  }

  // 2) 鋪在途部隊：用頁面自己的 seedMarchDemo（mid＝我方代縣→晉陽、敵方易京→北平）
  st = await J('JSON.stringify(window.__armyUi.seed("mid"))');
  if (!(st.armies || []).length) {
    st = await J('JSON.stringify(window.__armyUi.seed("three"))');
  }
  log('armies ' + JSON.stringify(st.armies));
  await sleep(350);
  await bring();
  const shot1 = await shot('01_armies');
  log('shot1 ' + JSON.stringify(shot1));

  // 3) 真的點一支部隊（座標由頁面按 toScreen + 錯開後回傳）
  const target = (st.armies || []).find((a) => a && a.side === 'A') || (st.armies || [])[0];
  if (!target) throw new Error('地圖上沒有在途部隊，無法驗收');
  await click(target.x, target.y);
  await sleep(650);
  const st2 = await state();
  log('after click ' + JSON.stringify({ sheet: st2.armySheetOpen, sel: st2.armySel, hit: target.hit, at: [target.x, target.y] }));
  const cmds = await J('JSON.stringify([...document.querySelectorAll("#armyCmds .acmd")].map((b) => ({ act: b.dataset.armyAct, disabled: !!b.disabled, text: b.textContent.replace(/\\s+/g, " ").trim() })))');
  log('commands ' + JSON.stringify(cmds));
  const rows = await J('JSON.stringify([...document.querySelectorAll("#armyInfo .k")].map((k) => k.textContent))');
  log('info rows ' + JSON.stringify(rows));
  await bring();
  const shot2 = await shot('02_army_menu');
  log('shot2 ' + JSON.stringify(shot2));

  // 4) 兵團指令 → 變更目的（真點按鈕，進全屏選點態）
  const btn = await J('JSON.stringify((() => { const el = document.querySelector(\'[data-army-act="retarget"]\'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), disabled: !!el.disabled }; })())');
  log('retarget btn ' + JSON.stringify(btn));
  if (btn && !btn.disabled) { await click(btn.x, btn.y); await sleep(900); }
  const st3 = await state();
  log('pick mode ' + JSON.stringify({ picking: st3.picking, pickMode: st3.pickMode, view: st3.view }));
  await bring();
  const shot3 = await shot('03_retarget');
  log('shot3 ' + JSON.stringify(shot3));

  // 5) 選點態點相鄰城 → 目的真的改了（校驗走 marchRetargetCheck，不繞過）
  const dests = await J(`JSON.stringify(window.__armyUi.cities().map((n) => ({ n, r: window.__armyUi.check(${JSON.stringify(target.id)}, n) })).filter((x) => x.r && x.r.ok))`);
  log('valid dests ' + JSON.stringify(dests.slice(0, 6)));
  let retargeted = null;
  if (dests.length) {
    const d = dests[0].n;
    const pos = await J(`JSON.stringify(window.__armyUi.cityAt(${JSON.stringify(d)}))`);
    await click(pos.x, pos.y);
    await sleep(800);
    const st4 = await state();
    const now = (st4.armies || []).find((a) => a && a.id === target.id);
    retargeted = { dest: d, to: now && now.to, progress: now && now.progress, picking: st4.picking };
    log('retargeted ' + JSON.stringify(retargeted));
  } else {
    // 沒有可改的城也要證明「拒絕」是有理由的：挑一座不相鄰的城點下去，看提示
    const anyCity = await J('JSON.stringify(window.__armyUi.cities().slice(0, 1))');
    log('no valid dest, sample ' + JSON.stringify(anyCity));
  }

  // 6) 取消路徑：Esc 與右鍵都要能退回（原作沒有取消按鈕，只能退）
  await ev('(() => { const a = window.__armyUi.armies().find((x) => x && x.side === "A"); window.__armyUi.pick(a.id); return a.id; })(); "p"');
  await sleep(300);
  let pk = await state();
  log('re-pick ' + JSON.stringify({ picking: pk.picking }));
  await s('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await s('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(400);
  pk = await state();
  log('after Esc ' + JSON.stringify({ picking: pk.picking, pickMode: pk.pickMode }));

  await ev('window.__armyUi.pick(window.__armyUi.armies()[0].id); "p"');
  await sleep(300);
  await s('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 900, button: 'right', clickCount: 1, buttons: 2, pointerType: 'mouse' });
  await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 900, button: 'right', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(400);
  pk = await state();
  log('after right-click ' + JSON.stringify({ picking: pk.picking, pickMode: pk.pickMode }));

  // 7) 「進入城內」：progress=0 的部隊站在自己城上 → 這項要真的可用、真的併回守軍
  let enterCase = null;
  const home = await J('JSON.stringify(window.__armyUi.park(80))');
  log('parked ' + JSON.stringify(home));
  if (home) {
    const troopsBefore = await J(`JSON.stringify(window.__armyUi.cityTroops(${JSON.stringify(home.from)}))`);
    const armiesBefore = (await state()).armies.length;
    await ev(`window.__armyUi.open(${JSON.stringify(home.id)}); "o"`);
    await sleep(350);
    const enterBtn = await J('JSON.stringify((() => { const el = document.querySelector(\'[data-army-act="enter"]\'); if (!el) return null; const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), disabled: !!el.disabled, text: el.textContent.replace(/\\s+/g, " ").trim() }; })())');
    log('enter btn ' + JSON.stringify(enterBtn) + ` cityTroops=${troopsBefore} armies=${armiesBefore}`);
    if (enterBtn && !enterBtn.disabled) {
      await click(enterBtn.x, enterBtn.y);
      await sleep(700);
      const after = { cityTroops: await J(`JSON.stringify(window.__armyUi.cityTroops(${JSON.stringify(home.from)}))`), armies: (await state()).armies.length };
      enterCase = { city: home.from, btn: enterBtn, before: { cityTroops: troopsBefore, armies: armiesBefore }, after };
      log('after enter ' + JSON.stringify(enterCase));
    } else {
      enterCase = { city: home.from, btn: enterBtn, before: { cityTroops: troopsBefore, armies: armiesBefore } };
      log('enter disabled ' + JSON.stringify(enterCase));
    }
  }

  return { shot1, shot2, shot3, target, retargeted, commands: cmds, infoRows: rows, enterCase };
}
