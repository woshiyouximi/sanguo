// 第三轮复验：全新导航（从第一次字节开始抓 console）→ Boot → Campaign → 内政 → 物品 → 敌城 → 出征(Deploy) → Battle
// 重点：Battle 是否完整（背景带 / 主将三层 / 士兵精灵 / HUD / 结算）+ 60 帧耗时 + System.import('cc') 导出
// 用法：OUTDIR=... node cdp.mjs run steps_chain3.mjs
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function (ctx) {
  const { send, s: rawSend, shot, evaluate, click, sleep, log, events, OUTDIR } = ctx;
  const s = rawSend || send;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = { page: PAGE, t0: new Date().toISOString(), shots: {} };

  await s('Page.enable');
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Network.enable');

  const evIdx0 = events.length;
  const wall0 = Date.now();

  // ---- 0) 全新导航，抓第一次字节起的 console ----
  await s('Page.navigate', { url: PAGE });
  await sleep(1200);
  out.shots.boot = await shot('00_boot');
  log('shot boot =', JSON.stringify(out.shots.boot));

  // 等引擎 + 首个场景
  let ready = false;
  const sceneSeq = [];
  for (let i = 0; i < 80; i++) {
    const st = J(await ev(`(() => {
      const has = typeof window.cc === 'object' && !!(cc.director && cc.director.getScene());
      return JSON.stringify({ has, scene: has ? cc.director.getScene().name : null,
        frames: has ? cc.director.getTotalFrames() : 0, t: Math.round(performance.now()) });
    })()`));
    if (st.scene && (!sceneSeq.length || sceneSeq[sceneSeq.length - 1].scene !== st.scene)) sceneSeq.push(st);
    if (st.has && st.scene) { ready = true; break; }
    await sleep(400);
  }
  out.sceneSeq = sceneSeq;
  out.readyMs = Date.now() - wall0 - 1200;
  log('scene sequence =', JSON.stringify(sceneSeq));

  if (!ready) {
    out.fatal = 'engine never ready';
    return out;
  }

  // 等 Campaign 真正画完（满 2.5s 或场景不是 Campaign 都继续）
  await sleep(2600);
  out.shots.campaign = await shot('01_campaign');
  log('shot campaign =', JSON.stringify(out.shots.campaign));

  const state = async () => J(await ev(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas && canvas.components.find(c => c && c.save && c.cities);
    return JSON.stringify({
      scene: scene.name,
      selected: comp ? comp.selected : null,
      actions: comp ? (comp.actionRects || []).map(r => r.kind) : null,
      hint: comp ? comp.hintText : null,
      cityPanel: comp && comp.cityPanel ? !!comp.cityPanel.isOpen() : null,
      itemsPanel: comp && comp.itemsPanel ? !!comp.itemsPanel.isOpen : null,
    });
  })()`));

  const info = J(await ev(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    if (!comp) return JSON.stringify({ err: 'no campaign comp' });
    const own = comp.save.owned.slice();
    const adj = [];
    for (const p of comp.paths || []) {
      const L = Number(p.Length) || 0;
      if (L >= 30000) continue;
      const a = p.Start, b = p.End;
      const aOwn = own.indexOf(a) >= 0, bOwn = own.indexOf(b) >= 0;
      if (aOwn === bOwn) continue;
      const target = aOwn ? b : a;
      const sp = comp.cityScreen.get(target);
      if (!sp) continue;
      adj.push({ target, design: [Math.round(sp.x), Math.round(sp.y)], page: P(sp.x, sp.y) });
    }
    const homeSp = comp.cityScreen.get(own[0]);
    return JSON.stringify({
      scene: scene.name, scale, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      own, adjacent: adj.slice(0, 8), home: own[0],
      homePage: homeSp ? P(homeSp.x, homeSp.y) : null,
      itemsPage: P(560 + 88, 64 + 26),
      month: comp.labelMonth ? comp.labelMonth.string : null,
    });
  })()`));
  out.info = info;
  log('INFO =', JSON.stringify(info).slice(0, 800));
  if (info.err) { out.fatal = info.err; return out; }

  // ---- 1) 己城 → 内政 ----
  if (info.homePage) {
    await click(info.homePage[0], info.homePage[1]);
    await sleep(1600);
    out.cityState = await state();
    out.shots.city = await shot('02_city_panel');
    log('city =', JSON.stringify(out.cityState), JSON.stringify(out.shots.city));
    await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); if (comp.cityPanel && comp.cityPanel.close) comp.cityPanel.close(); comp.refresh && comp.refresh(); return 'ok'; })()`);
    await sleep(900);
  }

  // ---- 2) 物品页 ----
  await click(info.itemsPage[0], info.itemsPage[1]);
  await sleep(1500);
  out.itemsState = await state();
  out.shots.items = await shot('03_items_panel');
  log('items =', JSON.stringify(out.itemsState), JSON.stringify(out.shots.items));
  await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); const ip = comp.itemsPanel; if (ip && ip.close) ip.close(); else if (ip) ip.isOpen = false; comp.refresh && comp.refresh(); return 'ok'; })()`);
  await sleep(900);

  // ---- 3) 敌城 → 出征按钮 → Deploy ----
  const enemy = (info.adjacent || [])[0];
  if (!enemy) { out.fatal = 'no adjacent enemy city'; return out; }
  await click(enemy.page[0], enemy.page[1]);
  await sleep(1500);
  out.enemyState = await state();
  log('enemy =', JSON.stringify(out.enemyState));
  const marchBtn = J(await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find(x => x && x.save && x.cities && x.actionRects);
    if (!comp || !comp.actionRects || !comp.actionRects.length) return JSON.stringify({ err: 'no actionRects' });
    const r = comp.actionRects[0];
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ kind: r.kind, label: r.label,
      page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
  })()`));
  out.marchButton = marchBtn;
  log('march button =', JSON.stringify(marchBtn));
  if (!marchBtn.page) { out.fatal = 'no march button'; return out; }

  await click(marchBtn.page[0], marchBtn.page[1]);
  await sleep(3600);
  out.afterMarch = J(await ev(`JSON.stringify({ scene: cc.director.getScene().name })`));
  out.shots.deploy = await shot('04_deploy');
  log('after march =', JSON.stringify(out.afterMarch), JSON.stringify(out.shots.deploy));

  // ---- 4) Deploy → Battle ----
  const probe = J(await ev(`(() => {
    const scene = cc.director.getScene();
    if (scene.name !== 'Deploy') return JSON.stringify({ scene: scene.name, err: 'not deploy' });
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ scene: scene.name, err: 'no comp with buttons' });
    return JSON.stringify({ scene: scene.name, loaded: comp.loaded, troop: comp.troop, form: comp.form,
      buttons: (comp.buttons || []).map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })) });
  })()`));
  out.deployProbe = probe;
  log('deploy probe =', JSON.stringify(probe).slice(0, 600));
  const go = probe.buttons ? probe.buttons.find((b) => b.kind === 'go') : null;
  if (!go) { out.fatal = 'no go button in deploy'; return out; }

  const vp = J(await ev(`(() => { const v = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: v.x, vy: v.y, s: cc.view.getScaleX(), dw: d.width, dh: d.height }); })()`));
  const gp = [Math.round(vp.vx + (go.x + go.w / 2) * vp.s), Math.round(vp.vy + (go.y + go.h / 2) * vp.s)];
  out.clickGo = { design: go, page: gp };
  log('click go =', JSON.stringify(gp));

  const battleT0 = Date.now();
  await click(gp[0], gp[1]);
  await sleep(4500);

  // ---- 5) Battle 深度探针 ----
  const battleProbe = async (tag) => J(await ev(`(async () => {
    const C = await System.import('cc');
    const T = (n) => (typeof C[n] === 'function' ? C[n] : null);
    const L = T('Label'), S = T('Sprite'), G = T('Graphics'), AS = T('AudioSource'), AC = T('AudioClip');
    const scene = cc.director.getScene();
    let all = [];
    const rec = (n, d) => { all.push({ n, d }); if (d < 4) n.children.forEach((c) => rec(c, d + 1)); };
    rec(scene, 0);
    const byName = (name) => all.filter((x) => x.n.name === name).map((x) => x.n);
    const labels = [];
    let sprites = 0, graphics = 0, audios = [];
    for (const { n } of all) {
      for (const c of n.components) {
        if (L && c instanceof L) labels.push({ node: n.name, text: String(c.string || '').slice(0, 200), active: n.active });
        if (S && c instanceof S) { sprites++; }
        if (G && c instanceof G) graphics++;
        if (AS && c instanceof AS) audios.push(n.name);
      }
    }
    // BattleRoot 组件（按字段指纹找）
    let root = null;
    const findRoot = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.unitPool !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(findRoot); };
    findRoot(scene);
    const ga = root && root.generalArt;
    const layers = ['Horse', 'Body', 'Weapon'];
    const artLayers = {};
    for (const side of ['A', 'B']) {
      artLayers[side] = {};
      for (const l of layers) {
        const want = side + '_' + l;
        const cand = all.filter((x) => x.n.name === want || x.n.name === side + l);
        const node = cand.length ? cand[0].n : null;
        const sp = node ? node.components.find((c) => S && c instanceof S) : null;
        artLayers[side][l] = node ? { found: true, name: node.name, active: node.active,
          hasFrame: !!(sp && sp.spriteFrame), size: node.getComponent(T('UITransform')) ? undefined : undefined } : { found: false };
      }
    }
    const unitRoot = byName('UnitSprites')[0] || null;
    const unitKids = unitRoot ? unitRoot.children.map((c) => c.active) : [];
    const w = root ? root.world : null;
    return JSON.stringify({
      tag: '${tag}', scene: scene.name, frames: cc.director.getTotalFrames(), frameRate: cc.game.frameRate,
      design: cc.view.getDesignResolutionSize(), scale: cc.view.getScaleX(),
      rootFound: !!root,
      bgReady: root && root.bg ? root.bg.ready : null,
      generalHasArt: ga ? ga.hasArt() : null,
      artLayers,
      unitSprites: { total: unitKids.length, active: unitKids.filter(Boolean).length },
      counts: { nodes: all.length, sprites, graphics, labels: labels.length, audioSources: audios.length },
      audioNodes: audios,
      hasAudioSourceCtor: !!AS, hasAudioClipCtor: !!AC,
      audioStats: root && root.audio ? root.audio.stats : null,
      hudBar: byName('BattleHudBar').length,
      weatherNode: byName('BattleWeather').length,
      tintNode: byName('ScreenTint').length,
      labels,
      world: w ? {
        tick: w.tick, over: w.over, weather: w.weather, terrain: w.terrain,
        A: { name: w.sides.A.general.name, alive: w.sides.A.aliveCount, start: w.sides.A.start, hp: Math.round(w.sides.A.general.hp), maxHp: w.sides.A.general.maxHp },
        B: { name: w.sides.B.general.name, alive: w.sides.B.aliveCount, start: w.sides.B.start, hp: Math.round(w.sides.B.general.hp), maxHp: w.sides.B.general.maxHp },
        units: w.units.length, alive: w.units.filter((u) => u.alive).length,
        generals: w.units.filter((u) => u.isGeneral === true).map((u) => ({ side: u.side, x: Math.round(u.x), y: Math.round(u.y), alive: u.alive })),
        log: (w.log || []).slice(-2).map((x) => x.text),
      } : null,
      settlement: root ? (root.settlement ? { winner: root.settlement.winner, kills: root.settlement.kills, dur: root.settlement.durationSec } : null) : null,
      battleSceneNodeNames: scene.children.map((n) => n.name),
    });
  })()`));

  out.battle = await battleProbe('t+4.5s');
  log('BATTLE =', JSON.stringify(out.battle).slice(0, 3000));
  out.shots.battle = await shot('05_battle');
  log('shot battle =', JSON.stringify(out.shots.battle));

  // 第二次探针：证明世界在推进（tick/位置变化）
  await sleep(3000);
  out.battle2 = await battleProbe('t+7.5s');
  log('BATTLE2 brief =', JSON.stringify({
    tick: out.battle2.world && out.battle2.world.tick,
    alive: out.battle2.world && out.battle2.world.alive,
    unitSprites: out.battle2.unitSprites, art: out.battle2.artLayers,
  }));

  // ---- 6) 60 帧帧耗时 ----
  out.fps = J(await ev(`new Promise((resolve) => {
    const t = [];
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      t.push(now - last); last = now;
      if (t.length < 60) requestAnimationFrame(tick);
      else {
        const s = t.slice(1).sort((a, b) => a - b);
        const sum = s.reduce((a, b) => a + b, 0);
        resolve(JSON.stringify({ frames: s.length, avgMs: +(sum / s.length).toFixed(2),
          medianMs: +s[Math.floor(s.length / 2)].toFixed(2), p95Ms: +s[Math.floor(s.length * 0.95)].toFixed(2),
          minMs: +s[0].toFixed(2), maxMs: +s[s.length - 1].toFixed(2),
          fps: +(1000 / (sum / s.length)).toFixed(1), frameRate: cc.game.frameRate,
          calls: cc.director.root && cc.director.root.device ? undefined : undefined }));
      }
    };
    requestAnimationFrame(tick);
  })`));
  log('FPS =', JSON.stringify(out.fps));

  // ---- 7) 等结算（最多 120s），有就截图 ----
  let waited = 0;
  let done = false;
  while (waited < 120000) {
    await sleep(5000);
    waited += 5000;
    const st = J(await ev(`(() => {
      let root = null;
      const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.settlement !== undefined && !root) root = c; }); n.children.forEach(find); };
      find(cc.director.getScene());
      if (!root || !root.world) return JSON.stringify({ scene: cc.director.getScene().name, over: false });
      return JSON.stringify({ scene: cc.director.getScene().name, over: !!root.world.over, tick: root.world.tick,
        settlement: root.settlement ? { winner: root.settlement.winner, kills: root.settlement.kills, spellKills: root.settlement.spellKills, dur: root.settlement.durationSec } : null });
    })()`));
    if (st.over) { out.settleWaitMs = waited; out.settle = st; out.shots.settlement = await shot('06_settlement'); done = true; break; }
    if (waited % 20000 === 0) log('wait settle', waited / 1000 + 's', JSON.stringify(st));
  }
  out.settleWaitTotalMs = waited;
  out.settleShotDone = done;
  if (done) log('shot settlement =', JSON.stringify(out.shots.settlement));

  // ---- 8) console 全文（自导航起）落盘 ----
  const slice = events.slice(evIdx0);
  const cons = slice.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => ({
    type: e.params.type,
    at: Math.round(e.params.timestamp),
    text: (e.params.args || []).map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.type)).join(' '),
  }));
  const exc = slice.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => ({
    at: Math.round(e.params.timestamp),
    text: e.params.exceptionDetails.text,
    desc: (e.params.exceptionDetails.exception || {}).description || '',
    url: e.params.exceptionDetails.url, line: e.params.exceptionDetails.lineNumber, col: e.params.exceptionDetails.columnNumber,
    stack: (e.params.exceptionDetails.stackTrace || {}).callFrames ? e.params.exceptionDetails.stackTrace.callFrames.map((f) => '  at ' + f.functionName + ' (' + f.url + ':' + f.lineNumber + ':' + f.columnNumber + ')') : [],
  }));
  const logEntries = slice.filter((e) => e.method === 'Log.entryAdded').map((e) => ({
    level: e.params.entry.level, source: e.params.entry.source, text: e.params.entry.text,
    url: e.params.entry.url, line: e.params.entry.lineNumber,
  }));
  const netFails = slice.filter((e) => e.method === 'Network.loadingFailed' && e.params.errorText !== 'net::ERR_ABORTED')
    .map((e) => ({ err: e.params.errorText, type: e.params.type }));
  const httpBad = slice.filter((e) => e.method === 'Network.responseReceived' && e.params.response && e.params.response.status >= 400)
    .map((e) => ({ status: e.params.response.status, url: e.params.response.url.slice(0, 200) }));
  out.console = { consoleCalls: cons.length, errors: cons.filter((c) => c.type === 'error').length,
    warnings: cons.filter((c) => c.type === 'warning').length, exceptions: exc.length,
    logEntries: logEntries.length, netFails, httpBad };
  const dump = {
    navigatedAt: out.t0, page: PAGE,
    console: cons, exceptions: exc, logEntries, netFails, httpBad,
    counts: out.console,
  };
  const dumpPath = path.join(OUTDIR, 'console_full3.json');
  fs.writeFileSync(dumpPath, JSON.stringify(dump, null, 1), 'utf8');
  out.consoleDump = dumpPath;
  log('console dump =', dumpPath, JSON.stringify(out.console));

  out.battleMs = Date.now() - battleT0;
  return out;
}
