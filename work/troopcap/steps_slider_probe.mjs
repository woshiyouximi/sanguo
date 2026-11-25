// 診斷 3：騎兵滑桿點擊映射（印 VIEW + 多次點擊 + 每次回讀 cavalry）
export default async function ({ evaluate, sleep, click, log }) {
  const ev = async (expr) => await evaluate(expr);
  const out = {};
  const state = async () => JSON.parse(await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return JSON.stringify({ err: 'no comp' });
    return JSON.stringify({
      soldiers: comp.soldiers, cavalry: comp.cavalry, soldierCap: comp.soldierCap, cavalryCap: comp.cavalryCap,
      sliders: (comp.buttons || []).filter((b) => b.kind === 'slide').map((b) => ({ x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })),
      canvas: (() => { const el = document.querySelector('canvas'); const r = el.getBoundingClientRect(); return { left: Math.round(r.left), top: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), dpr: window.devicePixelRatio }; })(),
    });
  })()`));
  out.view = JSON.parse(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), sy: cc.view.getScaleY(), dw: d.width, dh: d.height, cw: window.innerWidth, ch: window.innerHeight });
  })()`));
  out.before = await state();
  log('view=' + JSON.stringify(out.view));
  log('before=' + JSON.stringify(out.before));
  const v = out.view;
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.sy)];
  const cav = (out.before.sliders || [])[1];
  const targets = [
    ['mid', cav.x + cav.w * 0.5, cav.y + cav.h / 2],
    ['right', cav.x + cav.w - 10, cav.y + cav.h / 2],
  ];
  out.clicks = [];
  for (const [name, dx, dy] of targets) {
    const [px, py] = toPage(dx, dy);
    await click(px, py);
    await sleep(700);
    const st = await state();
    out.clicks.push({ name, page: [px, py], design: [Math.round(dx), Math.round(dy)], soldiers: st.soldiers, cavalry: st.cavalry });
  }
  log('clicks=' + JSON.stringify(out.clicks));
  return out;
}
