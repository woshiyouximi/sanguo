// web-mobile：用 cc.view 的真实 viewport 把设计坐标换算成浏览器点击坐标，验证真实点击能否操作城池一览
export default async function (ctx) {
  const { evaluate, sleep, shot, log, click } = ctx;
  const evalT = async (expr, ms = 8000) =>
    Promise.race([evaluate(expr, { returnByValue: true }), sleep(ms).then(() => '__timeout__')]);
  const J = (s) => { try { return JSON.parse(s); } catch { return { __raw: String(s) }; } };

  const out = { steps: [] };
  const scene = J(await evalT('JSON.stringify({scene: cc.director.getScene().name})'));
  if (scene.scene !== 'Campaign') {
    await evalT("cc.director.loadScene('Campaign')");
    await sleep(3500);
  }
  await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    window.__comp = c.components.find((x) => x && x.save && x.cities);
    return 'ok';
  })()`);

  // 精确的坐标换算常量
  const geom = J(await evalT(`(() => {
    const cvs = document.querySelector('canvas');
    const r = cvs.getBoundingClientRect();
    const vp = cc.view.getViewportRect();
    const vis = cc.view.getVisibleSize();
    return JSON.stringify({
      canvas: { w: cvs.width, h: cvs.height, cssW: r.width, cssH: r.height, left: r.left, top: r.top },
      viewport: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      vis: { w: vis.width, h: vis.height },
      dpr: window.devicePixelRatio,
    });
  })()`));
  out.steps.push({ name: 'geom', geom });

  const d2c = (dx, dy) => {
    const g = geom;
    const px = g.viewport.x + (dx / g.vis.w) * g.viewport.w;
    const pyBottom = g.viewport.y + (dy / g.vis.h) * g.viewport.h;
    const pyTop = g.canvas.h - pyBottom;
    return {
      x: g.canvas.left + px * (g.canvas.cssW / g.canvas.w),
      y: g.canvas.top + pyTop * (g.canvas.cssH / g.canvas.h),
    };
  };

  // 打开面板
  out.steps.push({ name: 'open', r: await evalT("(() => { try { window.__comp.openCityList(); return 'opened'; } catch(e) { return 'ERR '+e; } })()") });
  await sleep(600);

  const state = async (tag) => {
    const r = await evalT(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const node = c.getChildByName('CityListPanel');
      const p = node && node.getComponent('CityListPanel');
      return JSON.stringify({ opened: p ? p.isOpen : null, active: node ? node.active : null, filter: p ? p.debug().filter : null, page: p ? p.debug().page : null, sort: p ? p.debug().sort : null, dir: p ? p.debug().dir : null });
    })()`, 6000);
    out.steps.push({ name: 'state_' + tag, r: J(r) });
    return J(r);
  };
  await state('afterOpen');

  // 1) 真实点击「關閉」设计 (661,60)
  let pt = d2c(661, 60);
  out.steps.push({ name: 'click_close_at', pt });
  await click(pt.x, pt.y);
  await sleep(700);
  await state('afterClickClose');
  out.steps.push({ name: 'shot_close', r: await shot('41_web_click_close.png') });

  // 2) 若能关闭，再开一次；点「敵方」筛选（filterRect(2) 中心）
  const fmt = await evalT(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    window.__comp.openCityList();
    const n = c.getChildByName('CityListPanel');
    const p = n.getComponent('CityListPanel');
    return JSON.stringify({ hits: p.hits.map((h) => ({ n: h.name, x: h.rect.x, y: h.rect.y, w: h.rect.w, h: h.rect.h })) });
  })()`);
  out.steps.push({ name: 'openAgain+hits', r: fmt.slice(0, 2500) });
  await sleep(500);
  const hits = J(fmt).hits || [];
  const target = hits.find((h) => h.n === 'filter:enemy') || hits.find((h) => h.n === 'next') || null;
  out.steps.push({ name: 'target', target });
  if (target) {
    const p2 = d2c(target.x + target.w / 2, target.y + target.h / 2);
    out.steps.push({ name: 'click_target_at', p2 });
    await click(p2.x, p2.y);
    await sleep(700);
    await state('afterClickFilter');
    out.steps.push({ name: 'shot_filter', r: await shot('42_web_click_filter.png') });
  }

  // 3) 点「下一頁」
  const nh = hits.find((h) => h.n === 'next');
  if (nh) {
    const p3 = d2c(nh.x + nh.w / 2, nh.y + nh.h / 2);
    await click(p3.x, p3.y);
    await sleep(700);
    await state('afterClickNext');
    out.steps.push({ name: 'shot_next', r: await shot('43_web_click_next.png') });
  }

  // 4) 点一行（row）看是否 selected 变化
  const rh = hits.find((h) => h.n && h.n.startsWith('row:'));
  if (rh) {
    const p4 = d2c(rh.x + rh.w / 2, rh.y + rh.h / 2);
    await click(p4.x, p4.y);
    await sleep(700);
    const sel = J(await evalT(`(() => {
      const c = cc.director.getScene().getChildByName('Canvas');
      const p = c.getChildByName('CityListPanel').getComponent('CityListPanel');
      return JSON.stringify({ selected: p.debug().selected });
    })()`));
    out.steps.push({ name: 'afterClickRow', r: sel });
  }

  return out;
}
