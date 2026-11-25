export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await evaluate(`location.href='http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now(); 'go'`);
  await sleep(9000);
  const r = await ev(`(() => new Promise((resolve) => {
    const b = cc.assetManager.getBundle('res');
    if (!b) { resolve(JSON.stringify({ step: 'no-bundle', bundles: cc.assetManager.bundles ? Object.keys(cc.assetManager.bundles) : null })); return; }
    const t0 = Date.now();
    const done = (tag) => (err, asset) => resolve(JSON.stringify({ step: tag, ms: Date.now() - t0, err: err ? String(err.message || err) : null, has: !!asset }));
    b.load('data/levels_by_scenario', cc.JsonAsset, done('load-lv'));
    setTimeout(() => resolve(JSON.stringify({ step: 'timeout-6s' })), 6000);
  }))()`);
  log('probe ' + JSON.stringify(r));
}
