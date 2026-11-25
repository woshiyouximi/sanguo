// 探针 1：页面/引擎启动状态
export default async function ({ evaluate, sleep, log }) {
  const probe = `(() => {
    const out = {
      ready: document.readyState,
      url: location.href,
      hasCC: typeof window.cc,
      hasGame: !!(window.cc && cc.game),
      inited: !!(window.cc && cc.game && cc.game.inited),
      scene: (window.cc && cc.director && cc.director.getScene()) ? cc.director.getScene().name : null,
      canvas: null,
      body: document.body ? document.body.children.length : -1,
      err: window.__err || null,
    };
    const cv = document.querySelector('canvas');
    if (cv) out.canvas = [cv.width, cv.height];
    return JSON.stringify(out);
  })()`;
  for (let i = 0; i < 8; i++) {
    log(i, await evaluate(probe));
    await sleep(2500);
  }
  return 'done';
}
