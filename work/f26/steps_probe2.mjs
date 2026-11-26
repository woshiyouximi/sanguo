// F26 診斷 2：真滑鼠事件到底落在哪（記錄 pointer/mouse/click 的 target 與座標）。
export default async function ({ evaluate, sleep, click, shot, log, send }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const url = 'http://127.0.0.1:5174/web/deploy.html?' + new URLSearchParams({
    city: '南皮', from: '南皮', a: '關羽', troops: '200', bsoldiers: '125',
  }).toString();
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    if (await ev(`document.querySelectorAll('#qlist .qrow').length > 0`)) break;
  }
  await ev(`(() => { localStorage.removeItem('sanguo_deploy_cols_v1'); location.reload(); })()`);
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    if (await ev(`document.querySelectorAll('#qlist .qrow').length > 0`)) break;
  }
  await ev(`(() => { window.__f26 = [];
    for (const t of ['pointerdown','pointerup','mousedown','mouseup','click','touchstart','touchend'])
      document.addEventListener(t, (e) => window.__f26.push([t, (e.target && e.target.tagName) || '?',
        (e.target && e.target.dataset && e.target.dataset.qcol) || '', Math.round(e.clientX), Math.round(e.clientY), e.isTrusted ? 1 : 0]), true);
    return 1; })()`);
  const rect = await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  log('real click at', JSON.stringify(rect));
  await click(rect.x, rect.y);
  await sleep(500);
  const out = {
    rect,
    events: await ev(`window.__f26`),
    btn: await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); return { cls: b.className, on: b.classList.contains('on') }; })()`),
    ls: await ev(`localStorage.getItem('sanguo_deploy_cols_v1')`),
    atAfter: await ev(`(() => { const e = document.elementFromPoint(${rect.x}, ${rect.y}); return e ? e.tagName + '|' + (e.dataset.qcol||'') + '|' + e.className : null; })()`),
    shot: await shot('f26_probe2.png'),
  };
  return out;
}
