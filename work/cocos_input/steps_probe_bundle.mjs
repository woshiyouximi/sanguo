export default async function ({ evaluate, shot, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  await sleep(2000);
  const a = await ev(`(async () => {
    const out = { scene: cc.director.getScene() ? cc.director.getScene().name : null };
    const b = cc.assetManager.getBundle('res');
    out.bundle = !!b;
    if (b) {
      out.gen = await new Promise((res) => {
        b.load('data/generals', cc.JsonAsset, (err, asset) => {
          res({ err: err ? String(err.message || err) : null, rows: asset && asset.json ? asset.json.length : null });
        });
      });
    }
    const r = (() => { const sc = cc.director.getScene(); if (!sc) return null; let f = null; const w = (n) => { if (f) return; for (const c of n.components || []) { const cn = c.__classname__ || (c.constructor && c.constructor.name); if (cn === 'BattleRoot') { f = c; return; } } n.children.forEach(w); }; w(sc); return f; })();
    out.root = !!r;
    out.world = !!(r && r.world);
    if (r) { out.booted = r.booted; out.loading = r.loading; out.launch = r.launch; }
    return JSON.stringify(out);
  })()`);
  log(JSON.stringify(a));
  await shot('probe_bundle.png');
  return a;
}
