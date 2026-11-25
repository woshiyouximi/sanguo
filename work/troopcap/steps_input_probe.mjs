// 診斷 4：mouse vs touch（Input.dispatchTouchEvent）對滑桿的效果
export default async function ({ evaluate, send, sleep, click, log }) {
  const ev = async (expr) => await evaluate(expr);
  const st = async () => JSON.parse(await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return JSON.stringify({ err: 'no comp' });
    return JSON.stringify({ soldiers: comp.soldiers, cavalry: comp.cavalry, caps: [comp.soldierCap, comp.cavalryCap], queueOpen: comp.queueOpen, dragging: comp.dragging, dragColumn: comp.dragColumn, lastTouch: comp.__lastTouch || null });
  })()`));
  // 在組件上裝一個探針：記錄收到的 TOUCH_START 設計座標
  await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp || comp.__patched) return 'skip';
    comp.__patched = true;
    const orig = comp.onTouchStart.bind(comp);
    comp.onTouchStart = function (e) { try { const p = comp.toDesign(e); comp.__lastTouch = p; } catch (err) { comp.__lastTouch = 'ERR ' + err; } return orig(e); };
    return 'patched';
  })()`);
  const out = { before: await st() };
  const v = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height });
  })()`));
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.sy)];
  const [mx, my] = toPage(700, 1062);

  // ① 鼠標（cdp 的 click）
  await click(mx, my);
  await sleep(600);
  out.afterMouse = await st();

  // ② 觸摸事件
  const tp = [{ x: mx, y: my, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
  await sleep(120);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  out.afterTouch = await st();
  out.page = [mx, my];
  log('before=' + JSON.stringify(out.before));
  log('afterMouse=' + JSON.stringify(out.afterMouse));
  log('afterTouch=' + JSON.stringify(out.afterTouch));
  return out;
}
