export default async function ({ evaluate, sleep, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  await sleep(14000);
  const r = await ev(`(() => {
    const out = {};
    const b = cc.assetManager.bundles.find((x) => x.name === 'main');
    out.hasMain = !!b;
    out.bundleNames = cc.assetManager.bundles.map((x) => x.name);
    if (b) { out.scenes = Object.keys((b.config && b.config.scenes) || {}); out.paths = Object.keys((b.config && b.config.paths) || {}).slice(0, 6); }
    return JSON.stringify(out);
  })()`);
  log('bundle ' + JSON.stringify(r));
}
