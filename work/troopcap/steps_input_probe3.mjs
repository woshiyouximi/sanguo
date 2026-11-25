// 診斷 6：開 touch emulation 後再送 touch（Cocos 的 DeployRoot 只聽 Input.EventType.TOUCH_*）
export default async function ({ evaluate, send, sleep, log }) {
  const ev = async (expr) => await evaluate(expr);
  const st = async () => JSON.parse(await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return JSON.stringify({ err: 'no comp' });
    return JSON.stringify({ soldiers: comp.soldiers, cavalry: comp.cavalry, caps: [comp.soldierCap, comp.cavalryCap], labelSoldier: comp.labelSoldier ? comp.labelSoldier.string : null });
  })()`));
  const out = { before: await st() };
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 1 });
  await sleep(300);
  out.touchOn = await ev(`String(navigator.maxTouchPoints) + '/' + String('ontouchstart' in window)`);
  const v = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height });
  })()`));
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.sy)];
  const [mx, my] = toPage(720, 1062);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mx, y: my, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
  await sleep(200);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  out.afterCav = await st();
  // 再點步兵軌道左段（應該把步兵拉到 1）
  const [sx, sy] = toPage(60, 1062);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
  await sleep(200);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(800);
  out.afterInf = await st();
  log('touchOn=' + out.touchOn);
  log('before=' + JSON.stringify(out.before));
  log('afterCav=' + JSON.stringify(out.afterCav));
  log('afterInf=' + JSON.stringify(out.afterInf));
  return out;
}
