// F26 診斷 3：CDP Input 到底有沒有送到頁面（focus / bringToFront / 多次點擊）。
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
  await send('Page.bringToFront');
  await sleep(300);
  await ev(`(() => { window.__f26 = [];
    for (const t of ['pointerdown','mousedown','mouseup','click'])
      document.addEventListener(t, (e) => window.__f26.push([t, (e.target && e.target.tagName) || '?',
        (e.target && e.target.dataset && e.target.dataset.qcol) || '', Math.round(e.clientX), Math.round(e.clientY), e.isTrusted ? 1 : 0]), true);
    return 1; })()`);
  const out = { hasFocus: await ev(`document.hasFocus()`), visibility: await ev(`document.visibilityState`) };
  out.logs = [];
  const probe = async (tag, x, y) => {
    await click(x, y);
    await sleep(350);
    out.logs.push({ tag, x, y, ev: await ev(`window.__f26.splice(0)`) });
  };
  await probe('body-blank', 60, 200);
  const rect = await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await probe('qcol-0:back', rect.x, rect.y);
  await sleep(800);
  await probe('qcol-0:back-2nd', rect.x, rect.y);
  out.btn = await ev(`(() => { const b = document.querySelector('[data-qcol="0:back"]'); return { cls: b.className, on: b.classList.contains('on') }; })()`);
  out.ls = await ev(`localStorage.getItem('sanguo_deploy_cols_v1')`);
  out.focus2 = await ev(`document.hasFocus()`);
  // 直接測 #go 的 handler 是否還能被真滑鼠點到（導航前最後一次）
  const goRect = await ev(`(() => { const b = document.querySelector('#go'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  out.goRect = goRect;
  out.shot = await shot('f26_probe3.png');
  return out;
}
