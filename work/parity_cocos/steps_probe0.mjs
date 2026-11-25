// 探针 0：确认 __classname__ 可用 + 当前 canvas/viewport 尺寸
export default async function ({ evaluate, sleep, log, s }) {
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const r = await evaluate(`(() => {
    const sc = cc.director.getScene();
    const names = {};
    const walk = (n) => {
      (n._components || []).forEach((c) => {
        const k = (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
        names[k] = (names[k] || 0) + 1;
      });
      n.children.forEach(walk);
    };
    walk(sc);
    const cv = cc.game.canvas;
    return JSON.stringify({
      scene: sc.name,
      viewport: [innerWidth, innerHeight],
      canvas: [cv.width, cv.height, cv.clientWidth, cv.clientHeight],
      visibleSize: cc.view.getVisibleSize(),
      design: cc.view.getDesignResolutionSize(),
      compCount: Object.keys(names).length,
      comps: names,
    });
  })()`);
  log(r);
  return r;
}
