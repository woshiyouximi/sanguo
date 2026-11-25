export default async function (ctx) {
  const { evaluate, sleep, log, shot } = ctx;
  const sel = `(() => { const c = cc.director.getScene() && cc.director.getScene().getChildByName('Canvas'); if (!c) return null; return c.components.find(x => x && x.save && x.cities) || null; })()`;
  let compOk = false;
  for (let i = 0; i < 60; i++) {
    compOk = (await evaluate(`!!(${sel})`)) === true;
    if (compOk) break;
    await sleep(500);
  }
  log('comp ready =', compOk, 'scene =', await evaluate(`cc.director.getScene().name`));
  await evaluate(`window.__errs = []; window.addEventListener('error', (e) => window.__errs.push(String(e.message)));`);
  const call = await evaluate(`(() => { const comp = ${sel}; window.__hadPanel = !!comp.itemsPanel; comp.openItems(); return 'ok'; })()`);
  log('call openItems =', JSON.stringify(call));
  for (const ms of [0, 50, 250, 800, 1600]) {
    if (ms) await sleep(ms);
    const st = await evaluate(`(() => {
      const comp = ${sel}; const p = comp.itemsPanel;
      return JSON.stringify({ had: window.__hadPanel, exists: !!p, opened: p ? p.opened : null, active: p ? p.node.active : null, parentActive: p && p.node.parent ? p.node.parent.activeInHierarchy : null, pages: p ? p.pages.length : null, entries: p ? p.pages.reduce((s,x)=>s+x.length,0) : null, gen: p ? p.debug().general : null, bag: p ? p.bag.size : null, errs: window.__errs });
    })()`);
    log(`t+${ms}`, st);
  }
  const sh = await shot('items_panel_timing2.png');
  return { shot: sh };
}
