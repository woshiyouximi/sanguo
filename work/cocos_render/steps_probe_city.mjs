// 探针：重载 → Campaign → 开内政 → dump Label 文本/层级，再手动 refresh() 对比
export default async function ({ evaluate, sleep, log, shot, s, send }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const DUMP = `(() => {
    const sc = cc.director.getScene();
    if (!sc) return JSON.stringify({ err: 'no scene' });
    const canvas = sc.getChildByName('Canvas');
    const out = { scene: sc.name, canvasKids: canvas.children.map((n) => n.name) };
    let p = null;
    for (const n of canvas.children) {
      const c = (n.components || []).find((x) => (x.__classname__ || '') === 'CityPanel');
      if (c) { p = c; out.panelNode = n.name; break; }
    }
    if (!p) return JSON.stringify(Object.assign(out, { err: 'no CityPanel comp' }));
    out.cityName = p.cityName; out.built = p.built; out.opened = p.opened; out.hasSave = !!p.save;
    out.methods = Object.getOwnPropertyNames(Object.getPrototypeOf(p)).filter((k) => typeof p[k] === 'function').slice(0, 60);
    const kids = [];
    const walk = (n, d) => { kids.push(d + ':' + n.name + '#' + n.getSiblingIndex()); if (d < 1) n.children.forEach((c) => walk(c, d + 1)); };
    walk(p.node, 0);
    out.tree = kids;
    const labels = [];
    const w2 = (n) => {
      const L = n.getComponent(cc.Label);
      if (L) labels.push({ s: String(L.string).slice(0, 14), fs: L.fontSize, x: Math.round(n.position.x), y: Math.round(n.position.y), op: L.color ? L.color.a : -1, p: n.parent ? n.parent.name : '' });
      n.children.forEach(w2);
    };
    w2(p.node);
    out.labelCount = labels.length;
    out.nonEmpty = labels.filter((l) => l.s.trim()).length;
    out.labels = labels.slice(0, 70);
    return JSON.stringify(out);
  })()`;

  const waitScene = async (want, ms) => {
    const t0 = Date.now();
    for (;;) {
      const s = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
      if (s === want) return s;
      if (Date.now() - t0 > ms) return 'timeout:' + s;
      await sleep(700);
    }
  };
  await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
  log('boot ->', await waitScene('Campaign', 30000));
  await sleep(2500);
  const info = await ev(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const comp = canvas.components.find((x) => x && x.save && x.cities);
    if (!comp) return JSON.stringify({ err: 'no root' });
    const s = comp.save || {};
    const names = (comp.cities || []).map((c) => c.NAME || c.name).slice(0, 60);
    const saveCities = s.cities ? Object.keys(s.cities).slice(0, 60) : [];
    return JSON.stringify({ hasData: !!comp.data, cityCount: (comp.cities || []).length, names: names.slice(0, 12), saveCities: saveCities.slice(0, 12), gold: s.gold, month: s.month });
  })()`);
  log('root: ' + JSON.stringify(info));
  const target = (info.names && info.names[0]) || '襄平';
  const opened = await ev(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const comp = canvas.components.find((x) => x && x.save && x.cities);
    if (!comp) return JSON.stringify({ err: 'no root' });
    try { comp.openCityPanel(${JSON.stringify(target)}); } catch (e) { return JSON.stringify({ err: 'open threw ' + (e && e.message) }); }
    return JSON.stringify({ ok: 1, target: ${JSON.stringify(target)} });
  })()`);
  log('open: ' + JSON.stringify(opened));
  await sleep(2500);
  const a = await ev(DUMP);
  log('--- AFTER OPEN: labels=' + a.labelCount + ' nonEmpty=' + a.nonEmpty + ' scene=' + a.scene + ' city=' + a.cityName + ' built=' + a.built + ' hasSave=' + a.hasSave);
  log(JSON.stringify(a.labels.filter((l) => l.s.trim()).map((l) => l.s), null, 0));

  const rf = await ev(`(() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    for (const n of canvas.children) { const c = (n.components || []).find((x) => (x.__classname__ || '') === 'CityPanel'); if (c) { p = c; break; } }
    if (!p) return JSON.stringify({ err: 'no panel' });
    const names = Object.getOwnPropertyNames(Object.getPrototypeOf(p));
    let called = null;
    try { if (typeof p.refresh === 'function') { p.refresh(); called = 'refresh'; } else if (typeof p.sync === 'function') { p.sync(); called = 'sync'; } } catch (e) { return JSON.stringify({ err: 'refresh threw ' + (e && e.message), stack: String(e && e.stack).slice(0, 300) }); }
    return JSON.stringify({ called, names: names.slice(0, 60) });
  })()`);
  log('refresh: ' + JSON.stringify(rf));
  await sleep(1200);
  const b = await ev(DUMP);
  log('--- AFTER REFRESH: labels=' + b.labelCount + ' nonEmpty=' + b.nonEmpty);
  await shot('probe_city_refresh.png');
  return { opened, a: { labelCount: a.labelCount, nonEmpty: a.nonEmpty }, b: { labelCount: b.labelCount, nonEmpty: b.nonEmpty } };
}
