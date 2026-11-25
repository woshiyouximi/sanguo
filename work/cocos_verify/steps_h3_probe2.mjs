export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    try {
      const v = await evaluate(expr);
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch (err) {
      return { err: err.message };
    }
  };
  const st = async () =>
    ev(`(() => { const d = cc.director; const sc = d.getScene();
      return JSON.stringify({ sc: sc ? sc.name : null, frames: (d.getTotalFrames && d.getTotalFrames()) || -1,
        sceneCount: d.getScene() ? 1 : 0 }); })()`);
  log('now ' + JSON.stringify(await st()));
  log('load ' + JSON.stringify(await ev(`(() => { cc.director.loadScene('Battle', (e) => { globalThis.__h3load = e ? String(e) : 'ok'; }); return JSON.stringify({ called: 1 }); })()`)));
  for (let i = 0; i < 15; i++) {
    await sleep(1000);
    const s = await st();
    const flag = await ev(`(() => JSON.stringify({ load: globalThis.__h3load || null }))()`);
    log(`t${i + 1} ` + JSON.stringify({ ...s, ...flag }));
    if (s.sc === 'Battle') break;
  }
  const comps = await ev(`(() => { const sc = cc.director.getScene(); if (!sc) return JSON.stringify({ err: 'nosc' });
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name) || '')).replace(/^cc\\./, '');
    const out = []; const walk = (n) => { out.push(n.name + ':' + (n.components || []).map(cn).join('+')); n.children.forEach(walk); };
    walk(sc); return JSON.stringify({ names: out.slice(0, 25) }); })()`);
  log('tree ' + JSON.stringify(comps));
}
