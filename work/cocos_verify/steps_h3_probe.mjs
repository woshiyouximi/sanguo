export default async function ({ evaluate, sleep, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const g = await ev(`(() => {
    const cv = document.querySelector('canvas');
    const rect = cv.getBoundingClientRect();
    const vp = cc.view.getViewportRect();
    const vs = cc.view.getVisibleSize();
    const fr = cc.view.getFrameSize ? cc.view.getFrameSize() : null;
    return JSON.stringify({
      win: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio },
      canvas: { w: cv.width, h: cv.height, cssW: +rect.width.toFixed(1), cssH: +rect.height.toFixed(1),
        left: +rect.left.toFixed(1), top: +rect.top.toFixed(1) },
      scale: { x: cc.view.getScaleX(), y: cc.view.getScaleY() },
      viewport: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      visible: { w: vs.width, h: vs.height },
      frame: fr ? { w: fr.width, h: fr.height } : null,
      designRes: cc.view.getDesignResolutionSize ? cc.view.getDesignResolutionSize() : null,
      winSize: cc.winSize ? { w: cc.winSize.width, h: cc.winSize.height } : null,
    });
  })()`);
  log('geo ' + JSON.stringify(g));
  await sleep(200);
}
