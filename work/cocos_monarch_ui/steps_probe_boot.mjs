// 為什麼停在 Boot：看 scene / readyState / cc.game 狀態 / 有沒有報錯
export default async ({ evaluate, sleep, log, s }) => {
  try { await s('Page.bringToFront'); } catch (e) { log('bringToFront failed'); }
  await sleep(6000);
  const info = await evaluate(`(() => {
    const out = { href: location.href, ready: document.readyState, hasCC: typeof window.cc, scene: null, vis: null, fps: null, paused: null, canvas: null, errs: [] };
    try {
      out.scene = window.cc && cc.director && cc.director.getScene() ? cc.director.getScene().name : null;
      out.fps = window.cc && cc.game ? cc.game.frameRate : null;
      out.paused = window.cc && cc.director ? cc.director.isPaused() : null;
      const cvs = document.querySelector('canvas');
      out.canvas = cvs ? { w: cvs.width, h: cvs.height, cw: +cvs.getBoundingClientRect().width.toFixed(1) } : null;
      out.vis = window.cc ? cc.view.getVisibleSize() : null;
      out.loaded = window.cc && cc.assetManager && cc.assetManager.bundles ? cc.assetManager.bundles.size : null;
    } catch (e) { out.err = String(e && e.message ? e.message : e); }
    try {
      const cv = window.cc && cc.director.getScene() && cc.director.getScene().getChildByName('Canvas');
      out.children = cv ? cv.children.map((n) => n.name).slice(0, 20) : [];
      out.comps = cv ? cv.components.map((x) => (x && x.__classname__) || 'x').slice(0, 10) : [];
    } catch (e) {}
    return JSON.stringify(out);
  })()`);
  log('info:', info);
  return info;
};
