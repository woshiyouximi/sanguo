// 逐頁驗證：setPage(p) 之後 placed.length 必須等於 pageSizes[p]，
// 並且 scrollPx 必須落在 pageTops[p]（= 「頁頂位置只鋪當前頁」的雙模分支）。
// 這正是 work/cocos_items/panel_headless.mjs 鎖的那條不變式，但我不能改它的 _sim 副本，
// 所以在真引擎裡直接驗。
export default async function ({ evaluate, sleep, log }) {
  // 先確保在 Campaign 場景、物品頁開著（上一次 steps 收在 Deploy 場景）
  const scene = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
  if (scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(700);
      const sn = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
      if (sn === 'Campaign') break;
    }
    await sleep(2000);
  }
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); comp.openItems(); return 'open'; })()`);
  await sleep(2000);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const find = `(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    return p;
  })()`;

  const rows = [];
  const total = await ev(`(() => { const p = ${find}; return JSON.stringify({ pages: p.pages.length, sizes: p.debug().pageSizes }); })()`);
  log('pages=' + total.pages + ' sizes=' + JSON.stringify(total.sizes));
  for (let i = 0; i < total.pages; i += 1) {
    const r = await ev(`(() => { const p = ${find}; p.setPage(${i}); return JSON.stringify({ page: p.page, scrollPx: p.scrollPx, top: p.pageTops[p.page], placed: (p.placed || []).length, want: p.debug().pageSizes[p.page] }); })()`);
    rows.push(r);
    await sleep(160);
    log('page ' + i + ' → placed=' + r.placed + ' want=' + r.want + ' scrollPx=' + r.scrollPx + ' top=' + r.top);
  }
  const bad = rows.filter((r) => r.placed !== r.want || Math.abs(r.scrollPx - r.top) > 0.5);
  log('MISMATCH=' + bad.length);
  return { total, rows, bad: bad.length };
}
