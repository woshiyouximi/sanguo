// F26 診斷 5：把瀏覽器視窗從最小化/隱藏狀態恢復，再驗一次 CDP Input。
export default async function ({ evaluate, sleep, click, shot, log, send, page }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = { targetId: page.id };
  out.vis0 = await ev(`document.visibilityState`);
  const win = await send('Browser.getWindowForTarget', { targetId: page.id });
  out.window = win;
  await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { windowState: 'normal' } });
  await sleep(400);
  await send('Browser.setWindowBounds', { windowId: win.windowId, bounds: { left: 40, top: 20, width: 900, height: 1500, windowState: 'normal' } });
  await sleep(600);
  await send('Page.bringToFront');
  await sleep(600);
  out.vis1 = await ev(`document.visibilityState`);
  out.bounds = await send('Browser.getWindowBounds', { windowId: win.windowId });
  await ev(`(() => { window.__f26 = [];
    for (const t of ['pointerdown','mousedown','mouseup','click'])
      document.addEventListener(t, (e) => window.__f26.push([t, (e.target && e.target.tagName) || '?',
        (e.target && e.target.dataset && e.target.dataset.qcol) || '', Math.round(e.clientX), Math.round(e.clientY), e.isTrusted ? 1 : 0]), true);
    return 1; })()`);
  const rect = await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await click(rect.x, rect.y);
  await sleep(500);
  out.events = await ev(`window.__f26.splice(0)`);
  out.btn = await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); return { cls: b.className, on: b.classList.contains('on') }; })()`);
  out.ls = await ev(`localStorage.getItem('sanguo_deploy_cols_v1')`);
  out.vis2 = await ev(`document.visibilityState`);
  out.shot = await shot('f26_probe5.png');
  return out;
}
