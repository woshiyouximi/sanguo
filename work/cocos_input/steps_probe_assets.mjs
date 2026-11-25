export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const a = await ev(`(async () => {
    const out = { steps: [] };
    const b = cc.assetManager.getBundle('res');
    out.bundle = !!b;
    if (!b) return JSON.stringify(out);
    const names = ['data/generals', 'data/magics', 'data/magic_so'];
    for (const n of names) {
      const t0 = performance.now();
      const r = await new Promise((res) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; res({ timeout: true }); } }, 8000);
        b.load(n, (err, asset) => { if (done) return; done = true; clearTimeout(timer); res({ err: err ? String(err.message || err) : null, ok: !!asset, type: asset && asset.constructor && asset.constructor.name }); });
      });
      r.name = n; r.ms = Math.round(performance.now() - t0);
      out.steps.push(r);
    }
    return JSON.stringify(out);
  })()`);
  log(JSON.stringify(a));
  return a;
}
