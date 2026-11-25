// 构建产物级取证（修复后）：连 serve_fixed.mjs 端出来的同一份 web-mobile，
// 但内存里把 [].concat(m.values()) 改回 Array.from —— 证明「只改这一处」就能让
// 物品页从「共 1 件」变成「共 77 件 · 可裝備 55」，且 8 页都有内容。
//   node cdp.mjs run steps_items_fixed.mjs   （PAGE_URL=http://127.0.0.1:5187/index.html）
export default async function (ctx) {
  const { evaluate, sleep, shot, log } = ctx;
  const J = (s) => {
    if (typeof s === 'string') return JSON.parse(s);
    log('evaluate 返回非字符串：', JSON.stringify(s).slice(0, 400));
    return s;
  };
  const sel = `(() => { const c = cc.director.getScene().getChildByName('Canvas'); return c.components.find(x => x && x.save && x.cities); })()`;

  const boot = J(await evaluate(`JSON.stringify({ scene: (window.cc && cc.director.getScene()) ? cc.director.getScene().name : null })`));
  log('scene at boot =', JSON.stringify(boot));
  if (boot.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  const dataShape = J(await evaluate(`(() => {
    const comp = ${sel};
    const d = comp.data || {};
    return JSON.stringify({ itemsLen: Array.isArray(d.items) ? d.items.length : typeof d.items, generalsLen: Array.isArray(d.generals) ? d.generals.length : null });
  })()`));
  log('comp.data =', JSON.stringify(dataShape));

  await evaluate(`(() => { (${sel}).openItems(); return 'ok'; })()`);
  await sleep(1800);

  const panel = J(await evaluate(`(() => {
    const p = (${sel}).itemsPanel;
    const labels = [];
    const walk = (n) => { const l = n.getComponent && n.getComponent(cc.Label); if (l && l.string) labels.push(l.string); for (const ch of n.children) walk(ch); };
    walk(p.node);
    const rows = labels.filter((s) => /^(?!第 )/.test(s));
    return JSON.stringify({ active: p.node.active, dbg: p.debug ? p.debug() : null, labels });
  })()`));

  const header = panel.labels.find((s) => s.startsWith('共 ')) ?? null;
  const pageText = panel.labels.find((s) => /^第 \d+\/\d+ 頁$/.test(s)) ?? null;
  const groups = panel.labels.filter((s) => /件 · 已擁有/.test(s));
  log('header =', JSON.stringify(header));
  log('pageText =', JSON.stringify(pageText));
  log('groups =', JSON.stringify(groups));
  log('dbg =', JSON.stringify(panel.dbg));

  const shot1 = await shot('items_panel_fixed.png');
  log('shot =', JSON.stringify(shot1));
  return {
    dataShape,
    header,
    pageText,
    groups,
    entries: panel.dbg ? panel.dbg.entries : null,
    pages: panel.dbg ? panel.dbg.pages : null,
    pageSizes: panel.dbg ? panel.dbg.pageSizes : null,
    selected: panel.dbg ? panel.dbg.selected : null,
    bag: panel.dbg ? panel.dbg.bag : null,
    firstRows: panel.labels.filter((s) => /^Lv /.test(s)).length,
    shot: shot1,
  };
}
