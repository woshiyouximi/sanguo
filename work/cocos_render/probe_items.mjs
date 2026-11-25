export default async function ({ s, evaluate, sleep, shot, log }) {
  const ev = async (expr) => { const v = await evaluate(expr); if (v && v.__throw) throw new Error('eval threw: ' + v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  const scene = await ev(`JSON.stringify({ s: cc.director.getScene() ? cc.director.getScene().name : null })`);
  if (scene.s !== 'Campaign') { await evaluate(`cc.director.loadScene('Campaign'); 'go'`); await sleep(6000); }
  await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); comp.openItems(); return JSON.stringify({ ok: 1 }); })()`);
  await sleep(2500);
  const p1 = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null; const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); }; w(c);
    if (!p) return JSON.stringify({ err: 'no ItemsPanel' });
    return JSON.stringify({ maxScroll: p.maxScroll, scrollPx: p.scrollPx, pageTops: p.pageTops, page: p.page, pages: p.pages.length, placed: (p.placed || []).length, dbg: p.debug ? Object.keys(p.debug()) : null });
  })()`);
  log('items state: ' + JSON.stringify(p1));
  await shot('w7_items_top.png');
  const p2 = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null; const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); }; w(c);
    if (typeof p.scrollTo === 'function') p.scrollTo(Math.min(400, p.maxScroll));
    return JSON.stringify({ scrollPx: p.scrollPx, page: p.page });
  })()`);
  log('after scrollTo: ' + JSON.stringify(p2));
  await sleep(1200);
  await shot('w7_items_scrolled.png');
  const p3 = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null; const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); }; w(c);
    return JSON.stringify({ scrollPx: p.scrollPx, page: p.page, placed: (p.placed || []).length, first: (p.placed || []).slice(0, 3).map((e) => ({ k: e.kind, y: e.y, h: e.height })) });
  })()`);
  log('after redraw: ' + JSON.stringify(p3));
  return { p1, p2, p3 };
}
