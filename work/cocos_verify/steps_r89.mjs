// R89 复验：大地图（君主/势力/tint）+ 内政页（PALAIS 朝堂带 + 接缝）+ 物品页（77 件）+ 君主面板/势力抽屉
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  const sc = await ev(`JSON.stringify({ scene: cc.director.getScene().name })`);
  if (sc.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  // 等底图与城点就绪
  await sleep(1500);
  out.campaign = await ev(`(() => {
    const sc = cc.director.getScene();
    const labels = [];
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && typeof c.string === 'string' && c.string) labels.push(c.string); }); n.children.forEach(walk); };
    walk(sc);
    return JSON.stringify({ scene: sc.name, labels: labels.slice(0, 20) });
  })()`);
  out.shotCampaign = await shot('r89_01_campaign');

  // 势力抽屉
  out.forces = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    const r = { hasComp: !!comp };
    try { comp.openForces ? comp.openForces() : (comp.monarchPanel && comp.monarchPanel.openForces && comp.monarchPanel.openForces()); r.called = 'openForces'; } catch (e) { r.err = String(e && e.message || e); }
    return JSON.stringify(r);
  })()`);
  await sleep(1200);
  out.shotForces = await shot('r89_02_forces');

  // 内政页（襄平）
  out.city = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    const r = { owned: comp.save && comp.save.owned };
    try { comp.cityPanel && comp.cityPanel.close && comp.cityPanel.close(); } catch (e) {}
    try { comp.monarchPanel && comp.monarchPanel.close && comp.monarchPanel.close(); } catch (e) {}
    try { comp.openCityPanel('襄平'); r.called = 'openCityPanel'; } catch (e) { r.err = String(e && e.message || e); }
    r.open = comp.cityPanel ? !!comp.cityPanel.isOpen() : null;
    return JSON.stringify(r);
  })()`);
  await sleep(1600);
  out.shotCity = await shot('r89_03_city');

  // 物品页
  out.items = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    try { comp.cityPanel && comp.cityPanel.close && comp.cityPanel.close(); } catch (e) {}
    try { comp.openItems(); } catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); }
    return JSON.stringify({ open: comp.itemsPanel ? (comp.itemsPanel.isOpen ? !!comp.itemsPanel.isOpen() : !!comp.itemsPanel.node.active) : null });
  })()`);
  await sleep(1600);
  out.shotItems = await shot('r89_04_items');

  out.counts = await ev(`(() => { const sc = cc.director.getScene(); const c = (n) => 1 + n.children.reduce((a, x) => a + c(x), 0); return JSON.stringify({ nodeCount: c(sc) }); })()`);
  log('campaign', JSON.stringify(out.campaign).slice(0, 400));
  log('forces', JSON.stringify(out.forces));
  log('city', JSON.stringify(out.city));
  log('items', JSON.stringify(out.items));
  log('counts', JSON.stringify(out.counts));
  return out;
}
