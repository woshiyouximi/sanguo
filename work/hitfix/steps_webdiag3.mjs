// web-mobile 预览：定位「面板按钮点不动」——node 级触摸派发 vs 全局 input 监听
const DESIGN_W = 750;
const DESIGN_H = 1334;

export default async function (ctx) {
  const { send, evaluate, click, sleep, shot, log } = ctx;

  const evalT = async (expr, ms = 8000) => {
    const r = await Promise.race([
      evaluate(expr, { returnByValue: true }),
      sleep(ms).then(() => ({ __timeout: true })),
    ]);
    return r;
  };
  const J = (s) => {
    try { return JSON.parse(s); } catch { return { __raw: String(s) }; }
  };

  const out = { steps: [] };
  try { await send('Page.bringToFront', {}); } catch (e) { out.frontErr = String(e && e.message || e); }
  await sleep(300);
  out.resume = J(await evalT(`(() => { try { cc.game.resume(); cc.director.resume(); } catch (e) {} return JSON.stringify({ paused: cc.game.isPaused(), frames: cc.director.getTotalFrames() }); })()`, 5000));

  // 1) cc 上跟 input 有关的键
  out.ccInputKeys = J(await evalT(`JSON.stringify(Object.keys(cc).filter((k) => /input/i.test(k)).map((k) => k + ':' + typeof cc[k]))`, 6000));

  const sc = J(await evalT('JSON.stringify({ scene: cc.director.getScene().name })', 5000));
  if (sc.scene !== 'Campaign') {
    await evalT("cc.director.loadScene('Campaign')", 8000);
    await sleep(3500);
  }

  const geo = J(await evalT(`(() => {
    const c = document.querySelector('canvas'); const r = c.getBoundingClientRect();
    const vp = cc.view.getViewportRect();
    return JSON.stringify({ cw: c.width, ch: c.height, left: r.left, top: r.top, cssW: r.width, cssH: r.height, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height } });
  })()`, 6000));
  out.geo = geo;
  const toClient = (dx, dy) => {
    const px = geo.vp.x + (dx / DESIGN_W) * geo.vp.w;
    const py = geo.vp.y + ((DESIGN_H - dy) / DESIGN_H) * geo.vp.h;
    return [geo.left + px * (geo.cssW / geo.cw), geo.top + (geo.ch - py) * (geo.cssH / geo.ch)];
  };

  // 2) 装一个全屏 probe 节点（siblingIndex 保持最低，避免遮挡面板）
  const probe = await evalT(`(() => {
    const scene = cc.director.getScene();
    const c = scene.getChildByName('Canvas');
    const old = c.getChildByName('HBPROBE'); if (old) old.destroy();
    const n = new cc.Node('HBPROBE');
    n.layer = cc.Layers.Enum.UI_2D;
    n.parent = c;
    n.setSiblingIndex(0);
    n.addComponent(cc.UITransform).setContentSize(750, 1334);
    window.__hits = [];
    const rec = (tag) => (e) => {
      let ui = null;
      try { const p = e.getUILocation(); ui = [Math.round(p.x), Math.round(p.y)]; } catch (err) {}
      window.__hits.push(tag + ' ui=' + JSON.stringify(ui));
    };
    n.on(cc.Node.EventType.TOUCH_START, rec('probe-start'));
    n.on(cc.Node.EventType.TOUCH_END, rec('probe-end'));
    n.on(cc.Node.EventType.TOUCH_CANCEL, rec('probe-cancel'));
    window.__hits.push('probe-installed');
    return 'ok';
  })()`, 8000);
  out.probe = probe;

  const hits = async () => J(await evalT('JSON.stringify(window.__hits || null)', 5000));

  // 3) 打开面板
  await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); window.__comp = comp; comp.openCityList(); return 'ok'; })()`, 10000);
  await sleep(700);
  out.panelOpened = J(await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const n = c.getChildByName('CityListPanel'); const p = n && n.getComponent('CityListPanel'); return JSON.stringify({ isOpen: p ? p.isOpen : null, children: c.children.map((x) => x.name) }); })()`, 6000));
  out.hitsBeforeClicks = await hits();

  const probes = [];
  const targets = [
    ['close', 661, 60],
    ['enemyTab', 448, 158],
    ['row1', 375, 600],
  ];
  for (const [name, dx, dy] of targets) {
    const [cx, cy] = toClient(dx, dy);
    await click(cx, cy);
    await sleep(500);
    probes.push({ name, design: [dx, dy], client: [Math.round(cx * 100) / 100, Math.round(cy * 100) / 100], hits: await hits() });
  }
  out.probes = probes;

  // 4) 立刻用同一点再点一次（有些实现第一次 touch 只 start 不 end）
  const [cx2, cy2] = toClient(661, 60);
  await click(cx2, cy2);
  await sleep(600);
  out.afterSecondClose = J(await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const n = c.getChildByName('CityListPanel'); const p = n && n.getComponent('CityListPanel'); return JSON.stringify({ isOpen: p ? p.isOpen : null }); })()`, 6000));
  await sleep(300);
  await shot('37_web3_after_click.png');

  // 5) CDP 触摸注入再试一次
  const [tx, ty] = toClient(661, 60);
  out.touchInjected = await evalT(`(() => { return 'skip'; })()`, 3000);
  try {
    await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    await sleep(120);
    await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  } catch (e) { out.touchErr = String(e && e.message || e); }
  await sleep(600);
  out.afterTouchInjection = J(await evalT(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const n = c.getChildByName('CityListPanel'); const p = n && n.getComponent('CityListPanel'); return JSON.stringify({ isOpen: p ? p.isOpen : null }); })()`, 6000));
  await sleep(300);
  await shot('38_web3_after_touch_inject.png');

  return out;
}
