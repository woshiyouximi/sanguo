export default async function ({ evaluate, sleep, log, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  await sleep(12000);
  const r = await ev(`(() => { const d = cc.director; return JSON.stringify({ frames: d.getTotalFrames(), paused: d.isPaused && d.isPaused(), bundles: (cc.assetManager.bundles ? cc.assetManager.bundles.length : -1), scene: d.getScene() ? d.getScene().name : null, gameInited: !!cc.game, raf: typeof requestAnimationFrame }); })()`);
  log('probe ' + JSON.stringify(r));
}
