export default async function ({ evaluate, sleep, log, shot, s }) {
  const ev = async (x) => { const v = await evaluate(x); if (v && v.__throw) throw new Error(v.__throw); return typeof v === 'string' ? JSON.parse(v) : v; };
  await s('Page.navigate', { url: 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html?cb=' + Date.now() });
  await sleep(14000);
  const pre = await ev(`(() => new Promise((res) => {
    cc.director.preloadScene('Battle', (err) => res(JSON.stringify({ err: err ? String(err && err.message || err) : null })));
    setTimeout(() => res(JSON.stringify({ err: 'timeout' })), 25000);
  }))()`);
  log('preload ' + JSON.stringify(pre));
  const load = await ev(`(() => new Promise((res) => {
    cc.director.loadScene('Battle', (err) => res(JSON.stringify({ err: err ? String(err && err.message || err) : null, scene: cc.director.getScene() ? cc.director.getScene().name : null })));
    setTimeout(() => res(JSON.stringify({ err: 'timeout' })), 30000);
  }))()`);
  log('load ' + JSON.stringify(load));
  await sleep(3000);
  await shot('v171_battle2');
}
