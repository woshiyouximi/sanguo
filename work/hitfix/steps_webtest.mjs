// web-mobile 预览：城池一覽面板是否同样「打开后卡死/点不动」
// 关键判据：cc.director.getTotalFrames() 在打开面板后是否继续增长；Runtime.evaluate 是否还能执行
export default async function (ctx) {
  const { evaluate, sleep, shot, log } = ctx;

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
  const frames = async () => {
    const r = await evalT('JSON.stringify({ frames: cc.director.getTotalFrames(), scene: cc.director.getScene() && cc.director.getScene().name })', 5000);
    return r;
  };

  const out = { steps: [] };
  out.steps.push({ name: 'boot', r: await frames() });

  // 1) 确保在 Campaign 场景
  const sc = J(await evalT('JSON.stringify({ scene: cc.director.getScene().name })', 5000));
  if (sc.scene !== 'Campaign') {
    out.steps.push({ name: 'loadScene', r: await evalT("cc.director.loadScene('Campaign')", 8000) });
    await sleep(3500);
  }
  out.steps.push({ name: 'afterScene', r: await frames() });

  // 2) 拿 CampaignRoot 组件
  const grab = await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    if (!c) return JSON.stringify({ err: 'no canvas' });
    const comp = c.components.find((x) => x && x.save && x.cities);
    window.__comp = comp || null;
    return JSON.stringify({ ok: !!comp, children: c.children.map((n) => n.name) });
  })()`, 8000);
  out.steps.push({ name: 'grabRoot', r: grab });

  // 3) 打开面板前帧数基线
  const f0 = await frames();
  await sleep(1000);
  const f1 = await frames();
  out.steps.push({ name: 'frameBaseline', f0, f1 });

  // 4) 打开城池一览（直接调组件方法，绕开点击坐标）
  const openR = await evalT(`(() => {
    try { window.__comp.openCityList(); return 'opened'; }
    catch (e) { return 'ERR ' + (e && e.stack || e); }
  })()`, 12000);
  out.steps.push({ name: 'openCityList', r: openR });
  await sleep(1000);

  // 5) 打开后帧数：若 JS 主循环卡死，这里 evaluate 超时或帧数不涨
  const f2 = await frames();
  await sleep(1000);
  const f3 = await frames();
  out.steps.push({ name: 'frameAfterOpen', f2, f3 });

  // 6) 面板状态
  const panelState = await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const node = c.getChildByName('CityListPanel');
    if (!node) return JSON.stringify({ err: 'no panel node', children: c.children.map((n) => n.name) });
    const p = node.getComponent('CityListPanel');
    const d = p ? p.debug() : null;
    return JSON.stringify({ nodeName: node.name, active: node.active, opened: p ? p.isOpen : null, debug: d });
  })()`, 8000);
  out.steps.push({ name: 'panelState', r: panelState });

  const p1 = await shot('31_web_panel.png');
  out.steps.push({ name: 'shot', r: p1 });

  // 7) 直接调用 tap() 命中「關閉」设计坐标 (661,60)，验证 hits 是否可用
  const tapClose = await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const node = c.getChildByName('CityListPanel');
    const p = node && node.getComponent('CityListPanel');
    if (!p) return 'no panel';
    const before = p.isOpen;
    const hit = p.tap(661, 60);
    return JSON.stringify({ before, hit, after: p.isOpen });
  })()`, 8000);
  out.steps.push({ name: 'tapCloseDirect', r: tapClose });
  await sleep(600);
  const p2 = await shot('32_web_after_close.png');
  out.steps.push({ name: 'shot2', r: p2 });

  // 8) 再开一次，测真实鼠标点击（换算 canvas 显示坐标 → 设计坐标）
  const openR2 = await evalT(`(() => { try { window.__comp.openCityList(); return 'opened2'; } catch (e) { return 'ERR ' + e; } })()`, 12000);
  out.steps.push({ name: 'open2', r: openR2 });
  await sleep(700);

  const geo = await evalT(`(() => {
    const cvs = document.querySelector('canvas');
    const r = cvs.getBoundingClientRect();
    const vis = cc.view.getVisibleSize();
    const vs = cc.view.getVisibleSizeInPixel ? cc.view.getVisibleSizeInPixel() : null;
    return JSON.stringify({ rect: { x: r.x, y: r.y, w: r.width, h: r.height }, dpr: window.devicePixelRatio, vis: { w: vis.width, h: vis.height }, vs });
  })()`, 6000);
  out.steps.push({ name: 'canvasGeo', r: geo });
  const g = J(geo);
  if (g && g.rect && g.rect.w) {
    // 设计坐标 → 页面坐标：canvas 内按 750x1334 等比缩放，居中
    const scale = Math.min(g.rect.w / 750, g.rect.h / 1334);
    const offX = g.rect.x + (g.rect.w - 750 * scale) / 2;
    const offY = g.rect.y + (g.rect.h - 1334 * scale) / 2;
    const cx = offX + 661 * scale;
    const cy = offY + 60 * scale;
    out.steps.push({ name: 'clickCalc', scale, cx, cy });
    await ctx.click(cx, cy);
    await sleep(700);
    const afterClick = await evalT(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const node = c.getChildByName('CityListPanel');
      const p = node && node.getComponent('CityListPanel');
      return JSON.stringify({ opened: p ? p.isOpen : null, active: node ? node.active : null });
    })()`, 6000);
    out.steps.push({ name: 'afterRealClick', r: afterClick });
    const p3 = await shot('33_web_after_realclick.png');
    out.steps.push({ name: 'shot3', r: p3 });
  }

  return out;
}
