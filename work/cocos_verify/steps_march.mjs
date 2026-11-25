// 全交互链路：物品面板 → 内政面板 → 敌城选中 → 真点「出 征」进 Deploy
export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;

  const J = (s) => JSON.parse(s);

  // 确保在 Campaign
  const sc0 = J(await evaluate(`JSON.stringify({ scene: cc.director.getScene().name })`, { returnByValue: true }));
  if (sc0.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`, { returnByValue: true });
    await sleep(2500);
  }

  const info = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
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
      scene: scene.name, scale, vp: { x: vp.x, y: vp.y },
      own, adjacent: adj.slice(0, 8),
      home: own[0], homePage: homeSp ? P(homeSp.x, homeSp.y) : null,
      itemsPage: P(560 + 88, 64 + 26),
      actions: (comp.actionRects || []).map(r => ({ kind: r.kind, x: r.x, y: r.y, w: r.w, h: r.h, page: P(r.x + r.w / 2, r.y + r.h / 2) })),
    });
  })()`, { returnByValue: true }));

  log('own =', JSON.stringify(info.own));
  log('adjacent enemies =', JSON.stringify(info.adjacent.map(a => a.target + ' from ' + a.from)));
  log('items page =', JSON.stringify(info.itemsPage), ' home', info.home, JSON.stringify(info.homePage));

  const state = async () => J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return JSON.stringify({ scene: scene.name, canvas: false });
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    return JSON.stringify({
      scene: scene.name,
      selected: comp ? comp.selected : null,
      actions: comp ? (comp.actionRects || []).map(r => r.kind) : null,
      actionLabels: comp ? (comp.actionLabels || []).map(l => l.string) : null,
      hint: comp ? comp.hintText : null,
      cityPanel: comp && comp.cityPanel ? !!comp.cityPanel.isOpen() : false,
      itemsPanel: comp && comp.itemsPanel ? !!comp.itemsPanel.isOpen : false,
    });
  })()`, { returnByValue: true }));

  const out = { info: { own: info.own, adjacent: info.adjacent.map(a => a.target) } };

  // ---- 1) 物品面板（点右上「物 品」热区）----
  await click(info.itemsPage[0], info.itemsPage[1]);
  await sleep(1200);
  const sItems = await state();
  log('after items click =', JSON.stringify(sItems));
  out.items = { state: sItems, shot: await shot('items_panel.png') };
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); if (comp.itemsPanel) { comp.itemsPanel.isOpen && comp.itemsPanel.close(); } return 'ok'; })()`, { returnByValue: true });
  await sleep(600);

  // ---- 2) 内政面板（点自己的城）----
  if (info.homePage) {
    await click(info.homePage[0], info.homePage[1]);
    await sleep(1500);
    const sCity = await state();
    log('after own-city click =', JSON.stringify(sCity));
    out.city = { state: sCity, shot: await shot('city_panel.png') };
    await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); if (comp.cityPanel) comp.cityPanel.close(); comp.refresh && comp.refresh(); return 'ok'; })()`, { returnByValue: true });
    await sleep(800);
  }

  // ---- 3) 选敌城 → 真点「出 征」----
  const enemy = info.adjacent[0];
  if (enemy) {
    await click(enemy.page[0], enemy.page[1]);
    await sleep(1200);
    const sSel = await state();
    log('after enemy click =', JSON.stringify(sSel));
    out.enemySelected = sSel;

    if (sSel.selected === enemy.target) {
      const st2 = J(await evaluate(`(() => {
        const c = cc.director.getScene().getChildByName('Canvas');
        const comp = c.components.find(x => x && x.save && x.cities && x.actionRects);
        const r = comp.actionRects[0];
        const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
        return JSON.stringify({ kind: r.kind, page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
      })()`, { returnByValue: true }));
      log('action[0] =', JSON.stringify(st2));
      await click(st2.page[0], st2.page[1]);
      await sleep(3000);
      const sAfter = await state();
      log('after march click =', JSON.stringify(sAfter));
      out.march = { button: st2, state: sAfter, shot: await shot('campaign_to_deploy.png') };
    }
  }

  return out;
}
