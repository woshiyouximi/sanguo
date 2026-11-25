// 出征目標列表（關卡）：点自己的城 → 内政面板 → 点「出 征」→ 拍目标列表
export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;
  const J = (s) => JSON.parse(s);

  const sc0 = J(await evaluate(`JSON.stringify({ scene: cc.director.getScene() ? cc.director.getScene().name : null })`));
  if (sc0.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  const base = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    const own = comp.save.owned.slice();
    const sp = comp.cityScreen.get(own[0]);
    return JSON.stringify({ scene: scene.name, own, home: own[0], homePage: sp ? P(sp.x, sp.y) : null,
      cities: Object.keys(comp.cities || {}).length });
  })()`));
  log('base =', JSON.stringify(base));
  const out = { base };

  // 1) 点自己的城 → 内政面板
  await click(base.homePage[0], base.homePage[1]);
  await sleep(1500);

  const panel = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const cp = comp.cityPanel;
    if (!cp) return JSON.stringify({ cp: false });
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    return JSON.stringify({
      cp: true,
      open: typeof cp.isOpen === 'function' ? !!cp.isOpen() : !!cp.isOpen,
      title: cp.titleLabel ? cp.titleLabel.string : (cp.lblTitle ? cp.lblTitle.string : null),
      cmdTags: (cp.cmdTags || []).map(l => l.string),
      cmdSubs: (cp.cmdSubs || []).map(l => l.string),
      cmdRects: (cp.cmdRects || []).map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, page: P(r.x + r.w / 2, r.y + r.h / 2) })),
    });
  })()`));
  log('panel =', JSON.stringify(panel));
  out.panel = panel;
  out.panelShot = await shot('cocos_city_panel.png');

  // 2) 点「出 征」
  const tags = (panel.cmdTags || []).map(s => String(s).replace(/\s/g, ''));
  const idx = tags.findIndex(t => t.indexOf('出征') >= 0);
  out.deployIdx = idx;
  if (idx >= 0 && panel.cmdRects && panel.cmdRects[idx]) {
    const r = panel.cmdRects[idx];
    await click(r.page[0], r.page[1]);
    await sleep(1200);
  } else {
    log('!! 没找到出征命令', JSON.stringify(tags));
  }

  const sheet = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    const cp = comp.cityPanel;
    if (!cp) return JSON.stringify({ cp: false });
    const grab = (k) => (cp[k] && cp[k].map ? cp[k].map(l => (l && l.string !== undefined ? l.string : l)) : (cp[k] === undefined ? null : cp[k]));
    return JSON.stringify({
      open: typeof cp.isOpen === 'function' ? !!cp.isOpen() : !!cp.isOpen,
      sheetOpen: cp.sheetOpen === undefined ? null : (cp.sheetOpen && cp.sheetOpen.map ? cp.sheetOpen.map(s => !!s) : !!cp.sheetOpen),
      sheetKeys: Object.keys(cp).filter(k => /sheet/i.test(k)),
      labels: grab('sheetLabels'),
      note: comp.hintText || null,
    });
  })()`));
  log('sheet =', JSON.stringify(sheet, null, 1));
  out.sheet = sheet;
  out.sheetShot = await shot('cocos_deploy_targets.png');
  return out;
}
