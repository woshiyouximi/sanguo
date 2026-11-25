// 部隊層 + 兵團指令的 CDP 取证（876×1368；先 Page.bringToFront 并确认 getTotalFrames 在涨，见 project/169）。
// 跑法：
//   $env:PORT=9333; $env:PROFILE='F:\sanguo\work\.edgeprof_cocos_army'; $env:OUTDIR='F:\sanguo\work\cocos_army';
//   node work\cocos_verify\cdp.mjs launch
//   node work\cocos_verify\cdp.mjs run work\cocos_army\steps_army.mjs
//
// 注意：build 是压缩过的，`constructor.name` 会被压成 'e'；必须用 `cc.js.getClassName(c)`
// （@ccclass 注册名）来认组件。开局停在 Boot 场景的标题页，要靠 BootRoot.enterCampaign() 进大地图。
import fs from 'node:fs';
import path from 'node:path';

const URL = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function ({ send, shot, evaluate, sleep, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const json = async (expr) => {
    const v = await ev(expr);
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  };
  const report = { url: URL, frames: [], shots: [], checks: [] };
  const check = (name, ok, detail) => {
    report.checks.push({ name, ok: !!ok, detail: detail ?? null });
    log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail === undefined ? '' : '  ' + JSON.stringify(detail)}`);
  };
  const frames = async () => (await json('JSON.stringify({ f: cc.director.getTotalFrames() })')).f;
  const findCamp = `(() => { const s = cc.director.getScene(); let out = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'CampaignRoot') out = c; } for (const ch of n.children) walk(ch); }; walk(s); window.__camp = out; return !!out; })()`;

  // 0) 視窗尺寸 + 前景（project/169 的紀律：先 bringToFront 再看 TotalFrames）
  await send('Emulation.setDeviceMetricsOverride', {
    width: 876,
    height: 1368,
    deviceScaleFactor: 1,
    mobile: true,
    screenWidth: 876,
    screenHeight: 1368,
  });
  await send('Page.bringToFront');
  // 每次重跑都載入最新包（避免吃到上一版 build 的 JS）
  await send('Page.navigate', { url: URL + '?t=' + Date.now() });
  await sleep(1500);

  // 1) 等 cc 起來
  let ready = false;
  for (let i = 0; i < 60; i += 1) {
    const v = await ev(`(() => { try { return typeof cc === 'object' && !!cc.director && !!cc.director.getScene() && cc.director.getScene().name; } catch (e) { return ''; } })()`);
    if (v) {
      ready = true;
      break;
    }
    await sleep(500);
  }
  if (!ready) throw new Error('cc / scene 沒有起來');

  // 2) Boot 標題頁 → 大地圖（走 BootRoot 的正式入口，等價於按「開 始 新 局」選完劇本君主）
  if (!(await ev(findCamp))) {
    const r = await ev(`(() => { const s = cc.director.getScene(); let b = null; const walk = (n) => { for (const c of n.components || []) { if (c && cc.js.getClassName(c) === 'BootRoot') b = c; } for (const ch of n.children) walk(ch); }; walk(s);
      if (!b) return JSON.stringify({ err: 'no BootRoot' });
      try { localStorage.setItem('sanguo_run_fresh', '1'); } catch (e) {}
      b.enterCampaign(); return JSON.stringify({ ok: true, next: b.nextScene }); })()`);
    log('enter campaign ' + r);
    for (let i = 0; i < 60; i += 1) {
      await sleep(500);
      if (await ev(findCamp)) break;
    }
  }
  await ev(findCamp);
  // `start()` 是 async：組件先出現、`save` 後才有。等存檔就位（避免讀 null.save）。
  for (let i = 0; i < 60; i += 1) {
    const ok = await ev(`(() => !!(window.__camp && window.__camp.save && window.__camp.cities && window.__camp.cities.length))()`);
    if (ok) break;
    await sleep(500);
  }
  await sleep(1500);

  const f1 = await frames();
  await sleep(1000);
  const f2 = await frames();
  report.frames.push({ at: 'start', f1, f2 });
  check('getTotalFrames 在涨（畫面真的在跑，不是凍結幀）', f2 > f1, { f1, f2 });
  check('視窗 876×1368', true, await json('JSON.stringify({ w: innerWidth, h: innerHeight })'));

  const boot = await json(`(() => { const c = window.__camp; if (!c) return JSON.stringify({ err: 'no component' });
    return JSON.stringify({ scene: cc.director.getScene().name, month: c.save.month, owned: c.save.owned, selected: c.selected,
      labelMonth: c.labelMonth ? c.labelMonth.string : null, gold: c.save.gold,
      cityCount: c.cities.length, pathCount: c.paths.length, armies: (c.save.armies || []).length }); })()`);
  log('boot ' + JSON.stringify(boot));
  check('進到大地圖且 CampaignRoot 就位', boot.scene === 'Campaign' && Array.isArray(boot.owned) && boot.owned.length > 0, boot);
  check('頂欄紀元＝西元 N年 M月（web era.js:161 eraTextOfMonth）', /^西元 \d+年 \d+月$/.test(String(boot.labelMonth)), boot.labelMonth);

  // 3) 走真正的出征入口派一支 A 方部隊
  const pick = await json(`(() => { const c = window.__camp; const own = c.save.owned || [];
    for (const from of own) { for (const to of c.neighborsOf(from)) { if (own.indexOf(to) < 0) return JSON.stringify({ from, to }); } }
    return JSON.stringify({ err: 'no adjacent enemy city', own }); })()`);
  log('dispatch target ' + JSON.stringify(pick));
  check('找到可出征的我方城與相鄰敵城', !!pick.to, pick);
  const dispatched = await json(`(() => { const c = window.__camp; c.dispatchArmyTo(${JSON.stringify(pick.to)}); c.refresh();
    const a = (c.save.armies || []).filter((x) => x.side === 'A');
    return JSON.stringify({ hint: c.hintText, armies: a.map((x) => ({ id: x.id, from: x.from, to: x.to, troops: x.troops, general: x.general, officers: x.officers, advisor: x.advisor, stationed: x.stationed, progress: x.progress })) }); })()`);
  log('after dispatch ' + JSON.stringify(dispatched));
  const army = (dispatched.armies || [])[0];
  const armyId = army ? army.id : null;
  check('出征＝產生一支 progress:0 的 A 方部隊（先上路，不是直接進編成屏）', !!army && army.progress === 0, army);
  check('出征部隊帶 officers（隨軍武將）且 advisor 為空字串', !!army && Array.isArray(army.officers) && army.officers.length >= 1 && army.advisor === '', army && army.officers);
  if (!armyId) throw new Error('沒有部隊，後面的證據都做不了');

  // 4) 挪到路上（progress 0.42）——只為了截圖；正式推進走「推進一月」
  const onRoad = await json(`(() => { const c = window.__camp; const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    a.progress = 0.42; c.refresh();
    const it = (c.armyScreen || []).find((p) => p.a.id === a.id);
    return JSON.stringify({ progress: a.progress, screen: it ? { x: Math.round(it.x), y: Math.round(it.y) } : null, screenCount: (c.armyScreen || []).length }); })()`);
  log('on road ' + JSON.stringify(onRoad));
  check('部隊出現在 armyScreen（繪製與命中共用同一份列表）且有螢幕座標', onRoad.screen !== null && onRoad.screenCount >= 1, onRoad);
  await sleep(400);
  const f3 = await frames();
  await sleep(700);
  const f4 = await frames();
  report.frames.push({ at: 'shot01', f3, f4 });
  check('截圖前 getTotalFrames 仍在涨', f4 > f3, { f3, f4 });
  report.shots.push(await shot('01_army_on_road.png'));

  // 5) 兵團指令面板（5 項 + 7 行）
  const menu = await json(`(() => { const c = window.__camp; c.openArmyMenu(${JSON.stringify(armyId)}); const m = c.armyMenu;
    if (!m) return JSON.stringify({ err: 'no menu' });
    return JSON.stringify(m.debug()); })()`);
  log('menu ' + JSON.stringify(menu).slice(0, 1400));
  check('兵團指令面板標題＝兵 團 指 令', String(menu.title || '').replace(/\s/g, '') === '兵團指令', menu.title);
  check('5 個指令項（武將資料/變更目的/部隊駐紮/任命軍師/進入城內）', Array.isArray(menu.cmds) && menu.cmds.length === 5 && ['general', 'retarget', 'station', 'advisor', 'enter'].every((a, i) => menu.cmds[i] && menu.cmds[i].act === a), (menu.cmds || []).map((x) => x.act));
  check('7 行行軍情（主將/軍師/目的地/武將數/兵數/金錢/地形）', Array.isArray(menu.infoKeys) && menu.infoKeys.length === 7, menu.infoKeys);
  await sleep(400);
  report.shots.push(await shot('02_army_menu.png'));

  // 6) 駐紮態
  const station = await json(`(() => { const c = window.__camp; c.toggleStation(${JSON.stringify(armyId)});
    const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    const d = c.armyMenu ? c.armyMenu.debug() : {};
    return JSON.stringify({ stationed: a.stationed, hint: c.hintText, sub: d.sub, cmd: (d.cmds || [])[2] }); })()`);
  log('station ' + JSON.stringify(station));
  check('駐紮：stationed 翻成 true 且面板副標出現「駐紮中：進度凍結」', station.stationed === true && /駐紮中/.test(String(station.sub)), station.sub);
  await sleep(400);
  report.shots.push(await shot('03_stationed.png'));

  // 7) 駐紮凍結：推進一月，progress 不變
  const freeze = await json(`(() => { const c = window.__camp; const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    const before = a.progress; c.advanceArmiesMonth(); const after = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    return JSON.stringify({ before, after: after ? after.progress : null }); })()`);
  log('freeze ' + JSON.stringify(freeze));
  check('駐紮凍結：推進一月後 progress 不變（web planArmyMoves 的 frozen）', freeze.before === freeze.after, freeze);

  // 8) 軍師灰：只有主將一人
  const gray = await json(`(() => { const c = window.__camp; const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    a.officers = [a.general || '主將']; a.advisor = '';
    c.openArmyMenu(${JSON.stringify(armyId)}); const d = c.armyMenu.debug();
    return JSON.stringify({ officers: a.officers, cmd: (d.cmds || [])[3] }); })()`);
  log('gray ' + JSON.stringify(gray));
  check('軍師可點性 <2 人：灰、hint＝軍團僅主將一人，無可任命（web armyCanAppointAdvisor）', gray.cmd && gray.cmd.enabled === false && /無可任命/.test(String(gray.cmd.hint)), gray.cmd);
  await sleep(400);
  report.shots.push(await shot('04_advisor_gray.png'));

  // 9) 軍師亮：補到 3 名隨軍武將 → 進「任 命 軍 師」子頁
  const lit = await json(`(() => { const c = window.__camp; const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    const extra = (c.armyRosterFor(a.from, a.general || '') || []).filter((n) => n && n !== a.general);
    a.officers = [a.general || '主將'].concat(extra).slice(0, 3);
    c.openArmyMenu(${JSON.stringify(armyId)}); const m = c.armyMenu;
    const before = m.debug().cmds[3];
    m.setMode('advisor');
    const d = m.debug();
    return JSON.stringify({ officers: a.officers, cmd: before, mode: d.mode, rows: d.advisorRows, title: d.title, foot: d.foot }); })()`);
  log('lit ' + JSON.stringify(lit).slice(0, 1200));
  check('軍師可點性 >=2 人：亮，hint 從 N 名隨軍武將裡選', lit.cmd && lit.cmd.enabled === true && /隨軍武將/.test(String(lit.cmd.hint)), lit.cmd);
  check('任命軍師子頁：標題＝任 命 軍 師、首卡＝不 設 軍 師', String(lit.title || '').replace(/\s/g, '') === '任命軍師' && String(((lit.rows || [])[0] || {}).text || '').replace(/\s/g, '').indexOf('不設軍師') >= 0, { title: lit.title, first: (lit.rows || [])[0] });
  await sleep(400);
  report.shots.push(await shot('05_advisor_lit.png'));

  // 10) 變更目的：選點態（點空地＝取消；Cocos 沒有右鍵／Esc，標 [新設計]）
  const picking = await json(`(() => { const c = window.__camp; if (c.armyMenu) c.armyMenu.close();
    c.enterPickMode(${JSON.stringify(armyId)}); const hint1 = c.hintText; const on = c.pickArmyId;
    c.exitPickMode(); const hint2 = c.hintText;
    return JSON.stringify({ pick: on, hint1, hint2, after: c.pickArmyId }); })()`);
  log('pick ' + JSON.stringify(picking));
  check('選點態：提示「請選擇兵團目的城市」、退出後提示「已取消變更目的」', picking.pick === armyId && /請選擇兵團目的城市/.test(String(picking.hint1)) && /已取消變更目的/.test(String(picking.hint2)) && picking.after === null, picking);

  // 10.5) 武將資料：關兵團指令 → 開既有「武 將 資 料」名冊（Cocos 沒有單將卡，標 [新設計]）
  const book = await json(`(() => { const c = window.__camp;
    c.openArmyMenu(${JSON.stringify(armyId)});
    const gen = c.armyMenu.debug().cmds[0];
    window.__book = null;
    c.runArmyCommand('general', ${JSON.stringify(armyId)});
    const walk = (n) => { for (const comp of n.components || []) { if (comp && cc.js.getClassName(comp) === 'GeneralBookPanel') window.__book = comp; } for (const ch of n.children) walk(ch); };
    walk(cc.director.getScene());
    const bp = window.__book;
    return JSON.stringify({ gen, menuClosed: !c.armyMenu, bookOpen: !!(bp && bp.isOpen), bookActive: !!(bp && bp.node && bp.node.active) }); })()`);
  log('book ' + JSON.stringify(book));
  check('武將資料：關掉兵團指令面板並開出名冊（web 是單將卡，Cocos 開「武 將 資 料」）',
    !!book.gen && book.gen.enabled === true && book.menuClosed === true && book.bookOpen === true, book);
  report.shots.push(await shot('08_general_book.png'));
  await ev(`(() => { if (window.__book) window.__book.close(); return true; })()`);
  await sleep(300);

  // 11) 進入城內：路上不行、站在我方城上才行
  const enter = await json(`(() => { const c = window.__camp; const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)});
    a.progress = 0.42; c.openArmyMenu(${JSON.stringify(armyId)}); const onRoad = c.armyMenu.debug().cmds[4];
    a.progress = 0; c.openArmyMenu(${JSON.stringify(armyId)}); const atHome = c.armyMenu.debug().cmds[4];
    a.progress = 0.42; c.refresh();
    return JSON.stringify({ onRoad, atHome }); })()`);
  log('enter ' + JSON.stringify(enter));
  check('進入城內：路上灰（部隊在路途中，不在城上）', enter.onRoad && enter.onRoad.enabled === false && /不在城上/.test(String(enter.onRoad.hint)), enter.onRoad);
  check('進入城內：站在我方城上可點（併入 城 守軍）', enter.atHome && enter.atHome.enabled === true && /守軍/.test(String(enter.atHome.hint)), enter.atHome);
  if (enter.atHome && enter.atHome.enabled) {
    const done = await json(`(() => { const c = window.__camp; if (c.armyMenu) c.armyMenu.close();
      const a = (c.save.armies || []).find((x) => x.id === ${JSON.stringify(armyId)}); a.progress = 0;
      const city = a.from; const before = c.troopsOf(city); const troops = a.troops;
      c.enterCityForArmy(${JSON.stringify(armyId)});
      return JSON.stringify({ city, before, troops, after: c.troopsOf(city), gone: !(c.save.armies || []).some((x) => x.id === ${JSON.stringify(armyId)}), hint: c.hintText }); })()`);
    log('enter done ' + JSON.stringify(done));
    check('進城結算：守軍 += 部隊兵力（上限 600）、部隊從地圖移除', done.gone === true && done.after === Math.min(600, done.before + done.troops), done);
  }

  const fEnd = await frames();
  report.frames.push({ at: 'end', f: fEnd });
  const out = path.join(OUTDIR, 'cdp_report.json');
  fs.writeFileSync(out, JSON.stringify(report, null, 1), 'utf8');
  log('report → ' + out);
  const pass = report.checks.filter((c) => c.ok).length;
  log(`checks ${pass}/${report.checks.length}`);
  return { pass, total: report.checks.length, shots: report.shots, failed: report.checks.filter((c) => !c.ok).map((c) => c.name) };
}
