// F26 診斷：編成頁三檔按鈕為什麼沒被真滑鼠點中。
export default async function ({ evaluate, sleep, click, shot, log, send }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = {};
  const url = 'http://127.0.0.1:5174/web/deploy.html?' + new URLSearchParams({
    city: '南皮', from: '南皮', a: '關羽', troops: '200', bsoldiers: '125',
  }).toString();
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i += 1) {
    await sleep(250);
    if (await ev(`document.querySelectorAll('#qlist .qrow').length > 0`)) break;
  }
  out.viewport = await ev(`({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio })`);
  out.before = await ev(`(() => { const b = document.querySelector('[data-qcol="0:front"]'); const r = b.getBoundingClientRect();
    return { cls: b.className, text: b.textContent, x: r.x, y: r.y, w: r.width, h: r.height,
      vh: innerHeight, scrollY: scrollY,
      at: (() => { const e = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return e ? e.tagName + '.' + e.className + '|' + (e.textContent || '').slice(0,8) : null; })(),
      bodyScroll: (document.scrollingElement || {}).scrollTop }; })()`);

  // ① 合成 click（驗證 handler 本身）
  out.synthetic = await ev(`(() => { const b = document.querySelector('[data-qcol="0:front"]'); b.click();
    return { cls: b.className, ls: localStorage.getItem('sanguo_deploy_cols_v1') }; })()`);
  await sleep(200);
  out.afterSynthetic = await ev(`(() => { const rows = [...document.querySelectorAll('#qlist .qrow')];
    return rows.slice(0,2).map((r) => [...r.querySelectorAll('[data-qcol]')].map((b) => b.dataset.qcol + '=' + (b.classList.contains('on') ? 1 : 0))); })()`);

  // ② 真滑鼠點第 2 行「後」
  const r2 = await ev(`(() => { const b = document.querySelector('[data-qcol="1:back"]'); b.scrollIntoView({block:'center'}); return 1; })()`);
  await sleep(400);
  const rect = await ev(`(() => { const b = document.querySelector('[data-qcol="1:back"]'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2, w: r.width, h: r.height,
      at: (() => { const e = document.elementFromPoint(r.x + r.width/2, r.y + r.height/2); return e ? e.tagName + '.' + e.className + '|' + (e.textContent||'').slice(0,8) : null; })() }; })()`);
  out.realRect = rect;
  await click(rect.x, rect.y);
  await sleep(300);
  out.afterReal = await ev(`(() => { const rows = [...document.querySelectorAll('#qlist .qrow')];
    return { rows: rows.slice(0,2).map((r) => [...r.querySelectorAll('[data-qcol]')].map((b) => b.dataset.qcol + '=' + (b.classList.contains('on') ? 1 : 0))),
      ls: localStorage.getItem('sanguo_deploy_cols_v1') }; })()`);
  // ③ 對照：真滑鼠點第 2 行「前」
  const rect2 = await ev(`(() => { const b = document.querySelector('[data-qcol="1:front"]'); const r = b.getBoundingClientRect();
    return { x: r.x + r.width/2, y: r.y + r.height/2 }; })()`);
  await click(rect2.x, rect2.y);
  await sleep(300);
  out.afterRealFront = await ev(`localStorage.getItem('sanguo_deploy_cols_v1')`);
  out.innerSize = await ev(`({ iw: innerWidth, ih: innerHeight, sw: document.documentElement.scrollWidth, ch: document.documentElement.clientHeight })`);
  out.shot = await shot('f26_probe_cols.png');
  return out;
}
