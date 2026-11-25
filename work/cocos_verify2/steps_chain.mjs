// 五张图全链路：Campaign → 己方城(内政) → 物品页 → 敌城出征(Deploy) → Battle
// 用法：cdp.mjs run steps_chain.mjs   （OUTDIR / PAGE_URL 由环境变量决定）
export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;
  const J = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = {};

  // 确保在 Campaign
  const sc0 = J(await ev(`JSON.stringify({ scene: cc.director.getScene().name })`));
  if (sc0.scene !== 'Campaign') {
    await ev(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  const info = J(await ev(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    if (!comp) return JSON.stringify({ err: 'no campaign comp', canvas: !!canvas, comps: canvas.components.map(c => c && c.constructor && c.constructor.name) });
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
      adj.push({ target, from: aOwn ? a : b, design: [Math.round(sp.x), Math.round(sp.y)], page: P(sp.x, sp.y) });
    }
    const homeSp = comp.cityScreen.get(own[0]);
    return JSON.stringify({
      scene: scene.name, scale, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      own, adjacent: adj.slice(0, 8), home: own[0],
      homePage: homeSp ? P(homeSp.x, homeSp.y) : null,
      itemsPage: P(560 + 88, 64 + 26),
      comps: canvas.components.map(c => c && c.constructor && c.constructor.name),
      hasCityPanel: !!(comp.cityPanel), hasItemsPanel: !!(comp.itemsPanel),
      actions: (comp.actionRects || []).map(r => ({ kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h })),
      hint: comp.hintText, month: comp.labelMonth ? comp.labelMonth.string : null,
    });
  })()`));
  out.info = info;
  log('INFO =', JSON.stringify(info).slice(0, 900));
  if (info.err) return out;

  // 0) 大地图
  await sleep(500);
  out.shots = {};
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
      actionLabels: comp ? (comp.actionLabels || []).map(l => l.string) : null,
      hint: comp ? comp.hintText : null,
      cityPanel: comp && comp.cityPanel ? !!comp.cityPanel.isOpen() : null,
      itemsPanel: comp && comp.itemsPanel ? !!comp.itemsPanel.isOpen : null,
      cityTab: comp && comp.cityPanel && comp.cityPanel.tab ? comp.cityPanel.tab : null,
    });
  })()`));

  // 1) 点己方城 → 内政
  if (info.homePage) {
    await click(info.homePage[0], info.homePage[1]);
    await sleep(1600);
    out.cityState = await state();
    out.shots.city = await shot('02_city_panel');
    log('city state =', JSON.stringify(out.cityState), 'shot', JSON.stringify(out.shots.city));
    await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); if (comp.cityPanel && comp.cityPanel.close) comp.cityPanel.close(); comp.refresh && comp.refresh(); return 'ok'; })()`);
    await sleep(800);
  }

  // 2) 点物品 → 物品页
  await click(info.itemsPage[0], info.itemsPage[1]);
  await sleep(1400);
  out.itemsState = await state();
  out.shots.items = await shot('03_items_panel');
  log('items state =', JSON.stringify(out.itemsState), 'shot', JSON.stringify(out.shots.items));
  await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); const ip = comp.itemsPanel; if (ip && ip.close) ip.close(); else if (ip) ip.isOpen = false; comp.refresh && comp.refresh(); return 'ok'; })()`);
  await sleep(800);

  // 3) 点敌城 → 出征 → Deploy
  const enemy = (info.adjacent || [])[0];
  if (enemy) {
    await click(enemy.page[0], enemy.page[1]);
    await sleep(1400);
    out.enemyState = await state();
    log('enemy state =', JSON.stringify(out.enemyState));
    const st2 = J(await ev(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const comp = c.components.find(x => x && x.save && x.cities && x.actionRects);
      if (!comp || !comp.actionRects || !comp.actionRects.length) return JSON.stringify({ err: 'no actionRects' });
      const r = comp.actionRects[0];
      const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
      return JSON.stringify({ kind: r.kind, page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
    })()`));
    out.marchButton = st2;
    log('action[0] =', JSON.stringify(st2));
    if (st2.page) {
      await click(st2.page[0], st2.page[1]);
      await sleep(3500);
      out.afterMarch = J(await ev(`JSON.stringify({ scene: cc.director.getScene().name })`));
      out.shots.deploy = await shot('04_deploy');
      log('after march scene =', JSON.stringify(out.afterMarch), 'shot', JSON.stringify(out.shots.deploy));

      // 4) Deploy → Battle
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
      if (go) {
        // Deploy 的按钮 rect 同样是左上原点设计坐标（实测 y 不翻转）
        const v = J(await ev(`(() => { const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
          return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), dw: d.width, dh: d.height }); })()`));
        const gp = [Math.round(v.vx + (go.x + go.w / 2) * v.s), Math.round(v.vy + (go.y + go.h / 2) * v.s)];
        out.clickGo = { design: go, page: gp };
        log('click go page =', JSON.stringify(gp));
        await click(gp[0], gp[1]);
        await sleep(4500);
        // 统计用真实引擎构造函数做 instanceof（3.8.8 web 产物里 constructor.name 被 minify 成 'e'）
        let battle = { err: 'eval failed' };
        try {
          battle = J(await ev(`(async () => {
          const C = await System.import('cc');
          const T = (n) => (typeof C[n] === 'function' ? C[n] : null);
          const UIT = T('UITransform'), L = T('Label'), S = T('Sprite'), G = T('Graphics'), M = T('Mask') || T('MaskComponent');
          const cnt = (list, K) => (K ? list.filter(c => c instanceof K).length : -1);
          const sc = cc.director.getScene();
          let nodes = 0, labels = 0, sprites = 0, graphics = 0, masks = 0, uis = 0;
          const rec = (n) => { nodes++;
            uis += cnt(n.components, UIT); labels += cnt(n.components, L); sprites += cnt(n.components, S);
            graphics += cnt(n.components, G); masks += cnt(n.components, M);
            n.children.forEach(rec); };
          rec(sc);
          return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodes, labels, sprites, graphics, masks, uis,
            names: sc.children.map(n => n.name).slice(0, 16), children: sc.children.length,
            haveCtors: { UITransform: !!UIT, Label: !!L, Sprite: !!S, Graphics: !!G, Mask: !!M } });
        })()`));
        } catch (e) { battle = { err: String(e && e.message || e) }; }
        out.battle = battle;
        log('BATTLE =', JSON.stringify(battle));
        await sleep(1200);
        out.shots.battle = await shot('05_battle');
        log('shot battle =', JSON.stringify(out.shots.battle));

        // 5) 战场 60 帧帧耗时
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
                drawCalls: (cc.director.root && cc.director.root.device) ? undefined : undefined }));
            }
          };
          requestAnimationFrame(tick);
        })`));
        log('FPS =', JSON.stringify(out.fps));
      }
    }
  }
  return out;
}
