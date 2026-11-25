// 步骤：①用 console.error 钩子抓 3804 的调用栈 ②dump Campaign 坐标表 ③点「推進一月」验证交互
export default async function ({ evaluate, shot, sleep, click, log }) {
  const out = {};

  // ① 钩 console.error，抓 3804 首次调用栈
  out.hook = await evaluate(`(() => {
    if (window.__hooked) return {already:true};
    window.__hooked = true;
    window.__hits = [];
    const orig = console.error.bind(console);
    console.error = function (...a) {
      try {
        const s = a.map((x) => (typeof x === 'string' ? x : String(x))).join(' ');
        if (s.indexOf('3804') >= 0 && window.__hits.length < 5) {
          window.__hits.push({ msg: s.slice(0, 120), stack: (new Error('probe')).stack.split('\\n').slice(1, 7).join(' | ') });
        }
      } catch (e) {}
      return orig(...a);
    };
    return {installed:true};
  })()`);
  await sleep(1500);
  out.hits = await evaluate('window.__hits || null');

  // ② 坐标表 + 状态
  out.state = await evaluate(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return {err:'campaign comp not found'};
    const vp = cc.view.getViewportRect();
    const r2 = (r) => (r ? { x: r.x, y: r.y, w: r.width, h: r.height } : null);
    return {
      viewport: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      scale: cc.view.getScaleX(),
      design: (() => { const d = cc.view.getDesignResolutionSize(); return [d.width, d.height]; })(),
      hintText: comp.hintText,
      actionRects: (comp.actionRects || []).map(r2),
      actionLabels: comp.actionLabels || null,
      selected: comp.selected || null,
      cityCount: (comp.cities || []).length,
      citySample: (comp.cities || []).slice(0, 3),
      cityScreenSample: (comp.cityScreen || []).slice(0, 3),
      pathsCount: (comp.paths || []).length,
      generlsCount: (comp.generals || []).length,
      dataKeys: comp.data ? Object.keys(comp.data) : null,
      saveSummary: comp.save ? { month: comp.save.month, year: comp.save.year, gold: comp.save.gold, cities: Object.keys(comp.save.cities || {}).length } : null,
      labelTitle: comp.labelTitle ? comp.labelTitle.string : null,
    };
  })()`);

  const st = out.state;
  const toPage = (dx, dy) => {
    const s = st.scale;
    return [st.viewport.x + dx * s, st.viewport.y + (st.design[1] - dy) * s];
  };

  // ③ 点第三个动作（推進一月）
  if (st.actionRects && st.actionRects.length >= 3) {
    const r = st.actionRects[2];
    const [px, py] = toPage(r.x + r.w / 2, r.y + r.h / 2);
    out.click = { rect: r, page: [Math.round(px), Math.round(py)] };
    await click(Math.round(px), Math.round(py));
    await sleep(1500);
    out.after = await evaluate(`(() => {
      const scene = cc.director.getScene();
      let comp = null;
      const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
      find(scene);
      return { hintText: comp.hintText, title: comp.labelTitle ? comp.labelTitle.string : null,
        save: comp.save ? { year: comp.save.year, month: comp.save.month, gold: comp.save.gold } : null,
        frames: cc.director.getTotalFrames(), scene: scene.name };
    })()`);
    out.shot = await shot('campaign_after_advance');
  }
  log('hook', JSON.stringify(out.hook), 'hits', (out.hits || []).length);
  return out;
}
