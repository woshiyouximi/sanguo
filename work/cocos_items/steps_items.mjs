// 运行时取证：真实构建产物（5173 上的 web-mobile）里直接调 CampaignRoot.openItems()，
// 再把 ItemsPanel 的 debug() 与所有 Label 字串抓出来 —— 不依赖点击坐标。
export default async function (ctx) {
  const { evaluate, sleep, shot, log } = ctx;
  const J = (s) => JSON.parse(s);

  const boot = J(await evaluate(`JSON.stringify({ scene: (window.cc && cc.director.getScene()) ? cc.director.getScene().name : null })`));
  log('scene at boot =', JSON.stringify(boot));
  if (boot.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  const install = J(await evaluate(`JSON.stringify({ scene: cc.director.getScene().name, comp: (() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c && c.components.find(x => x && x.save && x.cities); return comp ? 'found' : 'missing'; })() })`));
  log('campaign comp =', JSON.stringify(install));

  // 组件上的 data（loadGameData 的結果）本身就是第一个证据。
  const dataShape = J(await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find(x => x && x.save && x.cities);
    const d = comp.data || {};
    const items = d.items;
    return JSON.stringify({
      keys: Object.keys(d),
      itemsType: Array.isArray(items) ? 'array' : typeof items,
      itemsLen: Array.isArray(items) ? items.length : null,
      first: Array.isArray(items) && items[0] ? { Sequence: items[0].Sequence, Name: items[0].Name, TYPE: items[0].TYPE } : null,
      generalsLen: Array.isArray(d.generals) ? d.generals.length : (d.generals ? 'object' : null),
    });
  })()`));
  log('comp.data =', JSON.stringify(dataShape));

  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find(x => x && x.save && x.cities); comp.openItems(); return 'ok'; })()`);
  await sleep(1800);

  const panel = J(await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find(x => x && x.save && x.cities);
    const p = comp.itemsPanel;
    if (!p) return JSON.stringify({ exists: false });
    const labels = [];
    const walk = (n) => {
      const l = n.getComponent && n.getComponent(cc.Label);
      if (l && l.string) labels.push(l.string);
      for (const ch of n.children) walk(ch);
    };
    walk(p.node);
    return JSON.stringify({ exists: true, active: p.node.active, dbg: p.debug ? p.debug() : null, labels });
  })()`));
  log('panel =', JSON.stringify(panel).slice(0, 4000));

  const shot1 = await shot('items_panel_runtime.png');
  log('shot =', JSON.stringify(shot1));
  return { boot, dataShape, panel: panel.exists ? { dbg: panel.dbg, labels: panel.labels } : panel, shot: shot1 };
}
