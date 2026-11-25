// 步骤：证明 3804 来自探针自身（cc.UITransform 是否为 undefined），并用安全方式 dump Campaign 状态
// 注意：引擎对象里有循环引用，一律在页面内 JSON.stringify 成字符串再取回，避免 "Object reference chain is too long"
export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  out.types = await ev(`JSON.stringify({
    UITransform: typeof cc.UITransform,
    UITransform2D: typeof cc.UITransform2D,
    Label: typeof cc.Label,
    Sprite: typeof cc.Sprite,
    Component: typeof cc.Component,
    Node: typeof cc.Node,
    ccKeys: Object.keys(cc).length,
    hasUITransformKey: Object.prototype.hasOwnProperty.call(cc, 'UITransform'),
  })`);

  out.trigger = await ev(`(() => {
    window.__hits = [];
    let returnedNull = null, err = null;
    try { returnedNull = cc.director.getScene().getComponent(cc.UITransform) === null; } catch (e) { err = String(e); }
    return JSON.stringify({ returnedNull: returnedNull, threw: err, hits: (window.__hits || []).length });
  })()`);
  await sleep(400);
  out.hits = await ev('JSON.stringify((window.__hits || []).slice(0, 3))');

  out.state = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({err:'campaign comp not found'});
    const vp = cc.view.getViewportRect();
    const r2 = (r) => (r && typeof r.width === 'number' ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : String(r));
    const cs = comp.cityScreen;
    let csKind = Object.prototype.toString.call(cs);
    let csSample = null;
    try {
      if (Array.isArray(cs)) csSample = cs.slice(0, 3).map((v) => (v && typeof v === 'object' ? { x: v.x, y: v.y } : v));
      else if (cs && typeof cs === 'object') csSample = Object.keys(cs).slice(0, 3).map((k) => { const v = cs[k]; return [k, v && typeof v === 'object' ? { x: v.x, y: v.y } : v]; });
    } catch (e) { csSample = 'err:' + e; }
    const c0 = (comp.cities || [])[0] || null;
    return JSON.stringify({
      viewport: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      scale: cc.view.getScaleX(),
      design: (() => { const d = cc.view.getDesignResolutionSize(); return [d.width, d.height]; })(),
      hintText: comp.hintText,
      actionLabels: (comp.actionLabels || []).map((l) => (typeof l === 'string' ? l : (l && typeof l.string === 'string' ? l.string : typeof l))),
      actionRects: (comp.actionRects || []).map(r2),
      selected: typeof comp.selected === 'object' ? JSON.stringify(Object.keys(comp.selected || {})) : String(comp.selected),
      cityCount: (comp.cities || []).length,
      city0: c0 ? { id: String(c0.id), name: String(c0.name), x: c0.x, y: c0.y, owner: String(c0.owner), troops: c0.troops } : null,
      cityScreenKind: csKind,
      cityScreenSample: csSample,
      pathsCount: (comp.paths || []).length,
      generalsCount: (comp.generals || []).length,
      dataKeys: comp.data ? Object.keys(comp.data) : null,
      save: comp.save ? { year: comp.save.year, month: comp.save.month, gold: comp.save.gold, cityIds: Object.keys(comp.save.cities || {}) } : null,
      labelTitle: comp.labelTitle ? comp.labelTitle.string : null,
      labelMonth: comp.labelMonth ? comp.labelMonth.string : null,
      labelStats: comp.labelStats ? comp.labelStats.string : null,
      nodePath: (() => { let p = [], n = comp.node; while (n && n.name) { p.unshift(n.name); n = n.parent; } return p.join('/'); })(),
    });
  })()`);
  log('types', JSON.stringify(out.types));
  log('trigger', JSON.stringify(out.trigger));
  return out;
}
