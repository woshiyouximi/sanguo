// web-mobile 诊断：CDP 的 click 事件到底有没有进 Cocos 的 input？
export default async function (ctx) {
  const { evaluate, sleep, log, click, shot } = ctx;
  const evalT = async (expr, ms = 8000) =>
    Promise.race([evaluate(expr, { returnByValue: true }), sleep(ms).then(() => '__timeout__')]);
  const J = (s) => { try { return JSON.parse(s); } catch { return { __raw: String(s) }; } };

  const out = { steps: [] };
  const scene = J(await evalT('JSON.stringify({scene: cc.director.getScene().name})'));
  if (scene.scene !== 'Campaign') { await evalT("cc.director.loadScene('Campaign')"); await sleep(3500); }

  // 装监听：DOM 层 + cc.input 层
  out.steps.push({ name: 'hook', r: await evalT(`(() => {
    window.__dom = []; window.__inp = [];
    const cvs = document.querySelector('canvas');
    for (const t of ['mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend']) {
      cvs.addEventListener(t, (e) => window.__dom.push(t + ':' + Math.round(e.clientX || 0) + ',' + Math.round(e.clientY || 0)), true);
    }
    window.__comp = cc.director.getScene().getChildByName('Canvas').components.find((x) => x && x.save && x.cities);
    cc.input.on(cc.Input.EventType.TOUCH_START, (e) => { const u = e.getUILocation(); window.__inp.push('TS:' + Math.round(u.x) + ',' + Math.round(u.y)); });
    cc.input.on(cc.Input.EventType.TOUCH_END, (e) => { const u = e.getUILocation(); window.__inp.push('TE:' + Math.round(u.x) + ',' + Math.round(u.y)); });
    cc.input.on(cc.Input.EventType.MOUSE_UP, (e) => { const u = e.getUILocation(); window.__inp.push('MU:' + Math.round(u.x) + ',' + Math.round(u.y)); });
    return 'hooked';
  })()`)});

  // 打开城池一览
  await evalT('(() => { window.__comp.openCityList(); return 1; })()');
  await sleep(600);
  out.steps.push({ name: 'opened', r: J(await evalT(`(() => {
    const p = cc.director.getScene().getChildByName('Canvas').getChildByName('CityListPanel').getComponent('CityListPanel');
    return JSON.stringify({ opened: p.isOpen, hits: p.hits.length });
  })()`)) });

  // 设计(661,60) = 關閉；client 坐标 = vp.x + dx/750*vp.w, dy/1334*vp.h
  const geom = J(await evalT(`(() => {
    const cvs = document.querySelector('canvas'); const r = cvs.getBoundingClientRect(); const vp = cc.view.getViewportRect(); const vis = cc.view.getVisibleSize();
    return JSON.stringify({ cw: cvs.width, ch: cvs.height, cl: r.left, ct: r.top, cW: r.width, cH: r.height, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height }, vis: { w: vis.width, h: vis.height } });
  })()`));
  const d2c = (dx, dy) => ({
    x: geom.cl + (geom.vp.x + (dx / geom.vis.w) * geom.vp.w) * (geom.cW / geom.cw),
    y: geom.ct + ((dy / geom.vis.h) * geom.vp.h) * (geom.cH / geom.ch),
  });
  const pt = d2c(661, 60);
  out.steps.push({ name: 'clickAt', pt, geom });
  await click(pt.x, pt.y);
  await sleep(800);
  out.steps.push({ name: 'domEvents', r: await evalT('JSON.stringify({dom: window.__dom, inp: window.__inp})') });
  out.steps.push({ name: 'panelAfterClick', r: J(await evalT(`(() => {
    const p = cc.director.getScene().getChildByName('Canvas').getChildByName('CityListPanel').getComponent('CityListPanel');
    return JSON.stringify({ opened: p.isOpen });
  })()`)) });
  out.steps.push({ name: 'shot', r: await shot('51_web_click_diag.png') });

  // 点击 canvas 中央的表格行（设计 375,600）看是否选中
  const pt2 = d2c(375, 600);
  await click(pt2.x, pt2.y);
  await sleep(700);
  out.steps.push({ name: 'domEvents2', r: await evalT('JSON.stringify({dom: window.__dom, inp: window.__inp})') });
  out.steps.push({ name: 'afterRowClick', r: J(await evalT(`(() => {
    const p = cc.director.getScene().getChildByName('Canvas').getChildByName('CityListPanel').getComponent('CityListPanel');
    return JSON.stringify({ opened: p.isOpen, selected: p.debug().selected });
  })()`)) });

  return out;
}
