// 惯性取证书（w9-render3 目标2）：一次快速滑动 → 松手后继续滑多少像素。
//
// 用法（cd work\cocos_verify）：
//   $env:PORT=9401; $env:PROFILE=F:\sanguo\work\cocos_render3\.edgeprof
//   $env:OUTDIR=F:\sanguo\work\cocos_render3; $env:PHASE=b3
//   $env:PAGE_URL=http://127.0.0.1:8912/cocos-build/web-mobile/index.html
//   node cdp.mjs launch; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_inertia.mjs
const PREFIX = process.env.PHASE || 'b3';

export default async function ({ s, evaluate, sleep, shot, log }) {
  const out = {};
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const panel = `(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'ItemsPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    return p;
  })()`;

  // ---- 进物品页 ----
  if ((await evaluate(`cc.director.getScene().name`)) !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(500);
      if ((await evaluate(`cc.director.getScene().name`)) === 'Campaign') break;
    }
    await sleep(2000);
  }
  await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    try { comp.openItems(); } catch (e) { return JSON.stringify({ err: String(e) }); }
    return JSON.stringify({ ok: 1 });
  })()`);
  await sleep(2200);

  const meta = await ev(`(() => {
    const p = ${panel};
    return JSON.stringify({ ok: !!p, scrollPx: p && p.scrollPx, maxScroll: p && p.maxScroll, paged: p && p.pagedMode });
  })()`);
  log('items panel: ' + JSON.stringify(meta));
  out.meta = meta;
  if (!meta.ok) return out;

  // 归零：position 0 = 列表顶端
  await ev(`(() => { const p = ${panel}; p.scrollTo(0); return JSON.stringify({ ok: 1 }); })()`);
  await sleep(400);
  const top = await ev(`JSON.stringify({ scrollPx: ${panel}.scrollPx })`);

  // ---- 一次快速上滑（手指从 y=980 抬到 y=700，5 段 / 每段 12ms）----
  const x = 300;
  const y0 = 980;
  const y1 = 700;
  await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: y0, button: 'none', buttons: 0, pointerType: 'mouse' });
  await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: y0, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  await sleep(30);
  const steps = 5;
  for (let i = 1; i <= steps; i += 1) {
    const yy = y0 + ((y1 - y0) * i) / steps;
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: yy, button: 'left', buttons: 1, pointerType: 'mouse' });
    await sleep(12);
  }
  const atRelease = await ev(`JSON.stringify({ scrollPx: ${panel}.scrollPx, vel: ${panel}.velPx })`);
  await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: y1, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  const shotA = await shot(PREFIX + '_inertia_release.png');

  // ---- 松手后逐帧采样 ----
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    await sleep(120);
    const v = await ev(`JSON.stringify({ r: Math.round(${panel}.scrollPx * 10) / 10, v: Math.round((${panel}.velPx || 0) * 10) / 10 })`);
    samples.push({ ms: (i + 1) * 120, ...v });
  }
  const shotB = await shot(PREFIX + '_inertia_settled.png');
  const final = await ev(`JSON.stringify({ scrollPx: ${panel}.scrollPx, maxScroll: ${panel}.maxScroll })`);

  const LIST_BODY = 644; // 列表可视高度（设计 px），见 ItemsPanel LAYOUT.listBody
  const travel = final.scrollPx - atRelease.scrollPx;
  log('#inertia top=' + JSON.stringify(top) + ' release=' + JSON.stringify(atRelease));
  log('#inertia samples=' + JSON.stringify(samples));
  log('#inertia final=' + JSON.stringify(final));
  log('#inertia travel=' + travel.toFixed(1) + 'px = ' + (travel / LIST_BODY).toFixed(2) + ' 屏  (1/4 屏 = ' + (LIST_BODY / 4) + 'px)');
  out.top = top;
  out.release = atRelease;
  out.samples = samples;
  out.final = final;
  out.travel = travel;
  out.shots = [shotA, shotB];

  // ---- 越界回弹：顶端下拉 120px 后松手，看是否弹回 0 ----
  await evaluate(`(() => { const p = ${panel}; p.scrollTo(0); return 1; })()`);
  await sleep(300);
  await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 600, button: 'none', buttons: 0, pointerType: 'mouse' });
  await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y: 600, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
  for (let i = 1; i <= 5; i += 1) {
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y: 600 + i * 24, button: 'left', buttons: 1, pointerType: 'mouse' });
    await sleep(30);
  }
  const over = await ev(`JSON.stringify({ scrollPx: ${panel}.scrollPx })`);
  await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y: 720, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  await sleep(900);
  const back = await ev(`JSON.stringify({ scrollPx: ${panel}.scrollPx })`);
  log('#bounce over=' + JSON.stringify(over) + ' after=' + JSON.stringify(back));
  out.bounce = { over, back };
  return out;
}
