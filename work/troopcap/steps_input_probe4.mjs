// 診斷 7：遊戲是否被暫停 / 觸摸監聽掛在哪個元素 / resume 後再試
export default async function ({ evaluate, send, sleep, log }) {
  const ev = async (expr) => await evaluate(expr);
  const out = {};
  out.paused = await ev(`JSON.stringify({ game: cc.game.isPaused(), director: cc.director.isPaused(), hidden: document.hidden, focus: document.hasFocus(), active: document.activeElement ? document.activeElement.tagName : null })`);
  out.canvas = await ev(`(() => { const c = document.querySelector('canvas'); const r = c.getBoundingClientRect(); return JSON.stringify({ tag: c.tagName, w: c.width, h: c.height, cw: Math.round(r.width), ch: Math.round(r.height), listeners: !!c.__listeners }); })()`);
  // Cocos 的 touch 監聽可能掛在 window / document / canvas；用 getEventListeners 只有 devtools console 能用，
  // 這裡改用「注入 capture 監聽打印」的辦法確認 DOM 事件是否到達。
  await ev(`(() => {
    if (window.__probe) return 'already';
    window.__probe = [];
    ['pointerdown','mousedown','touchstart'].forEach((t) => {
      document.addEventListener(t, (e) => {
        const pt = e.touches && e.touches[0] ? [e.touches[0].clientX, e.touches[0].clientY] : [e.clientX, e.clientY];
        window.__probe.push({ t, x: Math.round(pt[0]), y: Math.round(pt[1]), target: e.target.tagName });
      }, true);
    });
    return 'ok';
  })()`);
  const v = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height });
  })()`));
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.sy)];
  const [px, py] = toPage(700, 1062);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(400);
  out.domEvents = await ev(`JSON.stringify(window.__probe || [])`);
  await ev(`cc.game.resume(); 'resumed'`);
  await sleep(600);
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: px, y: py, id: 0, radiusX: 1, radiusY: 1, force: 1 }] });
  await sleep(150);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(600);
  out.state = await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    return comp ? JSON.stringify({ soldiers: comp.soldiers, cavalry: comp.cavalry, label: comp.labelSoldier ? comp.labelSoldier.string : null }) : 'no comp';
  })()`);
  out.domEvents2 = await ev(`JSON.stringify(window.__probe || [])`);
  log('paused=' + out.paused);
  log('canvas=' + out.canvas);
  log('domEvents=' + out.domEvents);
  log('state=' + out.state);
  log('domEvents2=' + out.domEvents2);
  return out;
}
