// 診斷 5：patch setColumnFromX 記錄呼叫；mouse 與 touch 各點一次
export default async function ({ evaluate, send, sleep, click, log }) {
  const ev = async (expr) => await evaluate(expr);
  const st = async () => JSON.parse(await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return JSON.stringify({ err: 'no comp' });
    if (!comp.__patched) {
      comp.__patched = true;
      comp.__calls = [];
      const origSet = comp.setColumnFromX.bind(comp);
      comp.setColumnFromX = function (col, x) { comp.__calls.push({ col, x: Math.round(x) }); return origSet(col, x); };
      const origStart = comp.onTouchStart.bind(comp);
      comp.onTouchStart = function (e) { comp.__calls.push({ start: true }); return origStart(e); };
      const origTouch = comp.onTouch.bind(comp);
      comp.onTouch = function (e) { comp.__calls.push({ end: true }); return origTouch(e); };
    }
    return JSON.stringify({ soldiers: comp.soldiers, cavalry: comp.cavalry, caps: [comp.soldierCap, comp.cavalryCap], calls: comp.__calls.slice(-12), loaded: comp.loaded, queueOpen: comp.queueOpen });
  })()`));
  const out = { a: await st() };
  const v = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height });
  })()`));
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.sy)];
  const [mx, my] = toPage(700, 1062);
  await click(mx, my);
  await sleep(700);
  out.b = await st();
  const tp = [{ x: mx, y: my, id: 1, radiusX: 1, radiusY: 1, force: 1 }];
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...tp[0], x: mx + 2 }] });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(700);
  out.c = await st();
  log('a=' + JSON.stringify(out.a));
  log('b=' + JSON.stringify(out.b));
  log('c=' + JSON.stringify(out.c));
  return out;
}
