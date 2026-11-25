export default async function ({ evaluate, log }) {
  const r = await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    if (!p) return JSON.stringify({ err: 'no ItemsPanel' });
    return JSON.stringify({ maxScroll: p.maxScroll, scrollPx: p.scrollPx, pageTops: p.pageTops, page: p.page, pages: p.pages.length, placed: (p.placed||[]).length });
  })()`);
  log('probe: ' + JSON.stringify(r));
}
