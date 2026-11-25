export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  const H = `
    const __cn = (c) => { const n = (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; return n.replace(/^cc\\./, ''); };
    const __all = () => { const sc = cc.director.getScene(); if (!sc) return []; const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; w(sc); return a; };
  `;
  for (let i = 0; i < 20; i++) { await sleep(1500); const s = await ev(`(() => { ${H} const sc = cc.director.getScene(); return JSON.stringify({ n: sc ? sc.name : null }); })()`); if (s.n && s.n !== 'null') break; }
  const bundleOk = await ev(`(() => new Promise((resolve) => {
    const b = cc.assetManager.getBundle('res');
    if (!b) { resolve(JSON.stringify({ ok: false, why: 'no res bundle', bundles: Object.keys(cc.assetManager.bundles || {}) })); return; }
    let done = 0; const res = {};
    const keys = ['ui/frame_panel', 'ui/plate_btn', 'ui/gem_gold', 'ui/force_01'];
    for (const k of keys) {
      b.load(k + '/spriteFrame', cc.SpriteFrame, (err, a) => {
        res[k] = err ? ('ERR ' + (err.message || err)) : (a ? 'ok' : 'null');
        if (++done === keys.length) resolve(JSON.stringify({ ok: true, res }));
      });
    }
    setTimeout(() => resolve(JSON.stringify({ ok: false, why: 'timeout', res })), 8000);
  }))()`);
  log('bundle ' + JSON.stringify(bundleOk));
  const s = await ev(`(() => { ${H} const sc = cc.director.getScene(); return JSON.stringify({ scene: sc ? sc.name : null }); })()`);
  log('scene ' + JSON.stringify(s));
  await shot('r86_skin_bundle');
}
