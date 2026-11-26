// web-mobile 诊断 2：CDP 鼠标/触摸事件能否驱动 Cocos；用「勢力」按钮做可见副作用测试
export default async function (ctx) {
  const { evaluate, sleep, log, shot } = ctx;
  const s = ctx.send;
  const evalT = async (expr, ms = 8000) =>
    Promise.race([evaluate(expr, { returnByValue: true }), sleep(ms).then(() => '__timeout__')]);
  const J = (s2) => { try { return JSON.parse(s2); } catch { return { __raw: String(s2) }; } };

  const out = { steps: [] };
  const scene = J(await evalT('JSON.stringify({scene: cc.director.getScene().name})'));
  if (scene.scene !== 'Campaign') { await evalT("cc.director.loadScene('Campaign')"); await sleep(3500); }

  const probe = await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    window.__comp = c.components.find((x) => x && x.save && x.cities);
    const keys = Object.keys(cc).filter((k) => /input|Input/.test(k));
    const dom = document.querySelector('canvas');
    return JSON.stringify({
      keys,
      hasInput: typeof cc.input,
      paused: cc.game.isPaused(),
      frameRate: cc.game.frameRate,
      canvasTabIndex: dom.tabIndex,
      activeEl: document.activeElement && document.activeElement.tagName,
      compProps: Object.keys(window.__comp).filter((k) => /panel|slot|book/i.test(k)),
    });
  })()`, 8000);
  out.steps.push({ name: 'probe', probe });

  const nodeNames = () => evalT('JSON.stringify(cc.director.getScene().getChildByName("Canvas").children.map((n) => n.name))', 6000);

  // 势力按钮：设计 (464,40) → client
  const geom = J(await evalT(`(() => {
    const cvs = document.querySelector('canvas'); const r = cvs.getBoundingClientRect(); const vp = cc.view.getViewportRect(); const vis = cc.view.getVisibleSize();
    return JSON.stringify({ cw: cvs.width, ch: cvs.height, cl: r.left, ct: r.top, cW: r.width, cH: r.height, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height }, vis: { w: vis.width, h: vis.height } });
  })()`, 6000));
  const d2c = (dx, dy) => ({
    x: geom.cl + (geom.vp.x + (dx / geom.vis.w) * geom.vp.w) * (geom.cW / geom.cw),
    y: geom.ct + ((dy / geom.vis.h) * geom.vp.h) * (geom.cH / geom.ch),
  });

  const mouseClick = async (x, y) => {
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
    await sleep(60);
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  };
  const touchClick = async (x, y) => {
    await s('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
    await sleep(90);
    await s('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  };

  const ptForces = d2c(464, 40);
  out.steps.push({ name: 'ptForces', ptForces, geom });
  out.steps.push({ name: 'framesBefore', r: await evalT('JSON.stringify({f: cc.director.getTotalFrames()})') });

  await mouseClick(ptForces.x, ptForces.y);
  await sleep(900);
  out.steps.push({ name: 'afterMouseClick', nodes: J(await nodeNames()) });

  await touchClick(ptForces.x, ptForces.y);
  await sleep(900);
  out.steps.push({ name: 'afterTouchClick', nodes: J(await nodeNames()) });

  out.steps.push({ name: 'state', r: J(await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = window.__comp;
    return JSON.stringify({ frames: cc.director.getTotalFrames(), forcesNode: !!c.getChildByName('ForcesPanel'), children: c.children.map((n) => n.name).filter((n) => !n.startsWith('Label_')) });
  })()`, 6000)) });
  out.steps.push({ name: 'shot', r: await shot('52_web_touch_diag.png') });

  // 检查 Cocos 自己的 input 是否可用（从模块里拿实例）
  out.steps.push({ name: 'inputInstance', r: J(await evalT(`(() => {
    const cand = [];
    try { if (cc.input) cand.push('cc.input'); } catch {}
    try { if (cc.internal && cc.internal.input) cand.push('cc.internal.input'); } catch {}
    // 从任意组件里找 Node 的 input 引用不可行；直接看 cc 命名空间里有没有 Input 构造器
    const t = typeof cc.Input;
    return JSON.stringify({ cand, InputType: t, keys: Object.keys(cc).filter((k) => /EventType|Input/.test(k)).slice(0, 20) });
  })()`, 6000)) });

  return out;
}
