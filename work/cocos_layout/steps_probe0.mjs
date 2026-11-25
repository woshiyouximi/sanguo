// r88-cocos-layout：量当前产物（旧版式）的真实几何 —— canvas / 可视区 / 关键节点世界矩形。
export default async function ({ evaluate, shot, log, sleep }) {
  // 等 Campaign 场景 + 数据就绪
  for (let i = 0; i < 40; i += 1) {
    const ready = await evaluate(`(() => {
      const sc = cc.director.getScene();
      if (!sc || sc.name !== 'Campaign') return 'scene:' + (sc && sc.name);
      const c = sc.getChildByName('Canvas');
      if (!c) return 'nocanvas';
      const comp = c.components.find((x) => x && x.save && x.cities);
      if (!comp || !comp.save) return 'nodata';
      return 'ok';
    })()`);
    if (ready === 'ok') break;
    await sleep(700);
  }
  const dump = await evaluate(`(() => {
    const V = cc.view;
    const vis = V.getVisibleSize();
    const design = V.getDesignResolutionSize();
    const canvasNode = cc.director.getScene().getChildByName('Canvas');
    const cu = canvasNode.getComponent(cc.UITransform);
    const out = {
      innerW: window.innerWidth, innerH: window.innerHeight, dpr: window.devicePixelRatio,
      visible: { w: vis.width, h: vis.height },
      design: { w: design.width, h: design.height },
      scale: { x: V.getScaleX(), y: V.getScaleY() },
      canvas: { wp: canvasNode.worldPosition, size: { w: cu.width, h: cu.height }, anchor: cu.anchorPoint },
      frames: cc.director.getTotalFrames(),
    };
    try { out.viewport = V.getViewportRect(); } catch (e) { out.viewport = 'ERR ' + e.message; }
    const H = vis.height;
    const box = (n) => {
      const u = n.getComponent(cc.UITransform);
      if (!u) return null;
      const b = u.getBoundingBoxToWorld();
      return { x: +b.x.toFixed(2), y: +(H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
    };
    const all = [];
    const walk = (n) => { all.push(n); n.children.forEach(walk); };
    walk(cc.director.getScene().getChildByName('Canvas'));
    const byName = new Map();
    all.forEach((n) => { if (!byName.has(n.name)) byName.set(n.name, n); });
    const find = (name) => byName.get(name) || null;
    const pick = (name) => { const n = find(name); return n ? (box(n) || 'NOUITRANSFORM') : 'MISSING'; };
    out.nodes = {};
    for (const name of ['CampaignBands','CampaignMapImage','CampaignVeil','CampaignVeilScreen','CampaignCityIcons','CampaignBase','CampaignMap','CampaignUi']) out.nodes[name] = pick(name);
    out.names = all.map((n) => n.name);
    const comp = canvasNode.components.find((x) => x && x.save && x.cities);
    out.cityCount = (comp.cities || []).length;
    out.selected = comp.selected;
    out.logCollapsed = comp.logCollapsed;
    const icons = [];
    (comp.cities || []).forEach((c) => { const n = find('CityIcon_' + c.NAME); if (n) icons.push({ name: c.NAME, ...box(n) }); });
    out.cityIcons = icons;
    const labels = [];
    (comp.cities || []).forEach((c) => { const n = find('Label_' + c.NAME); if (n) labels.push({ name: c.NAME, ...box(n) }); });
    out.cityLabels = labels;
    return JSON.stringify(out);
  })()`);
  if (typeof dump === 'string') log(dump);
  else log('EVAL FAIL: ' + JSON.stringify(dump));
  const s = await shot('probe0_campaign.png');
  log('shot', JSON.stringify(s));
  return 'ok';
}
