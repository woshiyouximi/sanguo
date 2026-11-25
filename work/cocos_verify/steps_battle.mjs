// 步骤：①真点「出征」试进 Battle ②不行就直接 loadScene('Battle') 证明场景可渲染
//        ③回 Campaign 真点「推進一月」验证输入链路
// 坐标：按钮 rect 是左上角原点 y 向下，页面坐标 = viewport + design*scale（不翻转 y）
export default async function ({ evaluate, sleep, click, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  const v = await ev(`(() => { const vp = cc.view.getViewportRect(); return { vx: vp.x, vy: vp.y, s: cc.view.getScaleX() }; })()`);
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + dy * v.s)];

  const sceneNow = `(() => { const sc = cc.director.getScene(); return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames() }); })()`;

  // ① 点「出征」
  const go = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ err: 'no comp' });
    const b = (comp.buttons || []).find((x) => x.kind === 'go');
    return JSON.stringify({ scene: scene.name, loaded: comp.loaded, hint: comp.labelHint ? comp.labelHint.string : null,
      soldiers: comp.soldiers, cap: comp.soldierCap, troop: comp.troop, form: comp.form,
      btn: b ? { x: b.x, y: b.y, w: b.w, h: b.h } : null });
  })()`);
  out.beforeClick = go;
  if (go.btn) {
    const [px, py] = toPage(go.btn.x + go.btn.w / 2, go.btn.y + go.btn.h / 2);
    out.clickGo = [px, py];
    await click(px, py);
    await sleep(4000);
    out.afterClick = await ev(`(() => {
      const scene = cc.director.getScene();
      let hint = null, comp = null;
      const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
      find(scene);
      if (comp && comp.labelHint) hint = comp.labelHint.string;
      return JSON.stringify({ scene: scene.name, hint: hint, frames: cc.director.getTotalFrames() });
    })()`);
    out.shotAfterClick = await shot(go && 'after_go_click');
  }

  // ② 直接载入 Battle
  if (out.afterClick && out.afterClick.scene !== 'Battle') {
    out.loadBattle = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ok:true}); } catch (e) { return JSON.stringify({err:String(e)}); } })()`);
    await sleep(4000);
    out.battleProbe = await ev(`(() => {
      const sc = cc.director.getScene();
      let comps = [];
      const walk = (n) => { (n._components || []).forEach((c) => { const k = Object.keys(c).filter((x) => !x.startsWith('_')); if (k.length > 8) comps.push({ node: n.name, keys: k.slice(0, 30) }); }); n.children.forEach(walk); };
      walk(sc);
      return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), children: sc.children.map((n) => n.name), comps: comps.slice(0, 3) });
    })()`);
    out.shotBattle = await shot('battle_scene');
  }

  // ③ 回 Campaign，真点「推進一月」
  out.loadCampaign = await ev(`(() => { try { cc.director.loadScene('Campaign'); return JSON.stringify({ok:true}); } catch (e) { return JSON.stringify({err:String(e)}); } })()`);
  await sleep(2500);
  const camp = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ err: 'no campaign comp', scene: scene.name });
    return JSON.stringify({ scene: scene.name, month: comp.labelMonth ? comp.labelMonth.string : null, gold: comp.save ? comp.save.gold : null,
      rects: (comp.actionRects || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })) });
  })()`);
  out.campaignBefore = camp;
  if (camp.rects && camp.rects.length >= 3) {
    const r = camp.rects[2];
    const [px, py] = toPage(r.x + r.w / 2, r.y + r.h / 2);
    out.clickAdvance = [px, py];
    await click(px, py);
    await sleep(1600);
    out.campaignAfter = await ev(`(() => {
      const scene = cc.director.getScene();
      let comp = null;
      const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
      find(scene);
      return JSON.stringify({ scene: scene.name, month: comp && comp.labelMonth ? comp.labelMonth.string : null,
        gold: comp && comp.save ? comp.save.gold : null, stats: comp && comp.labelStats ? comp.labelStats.string : null,
        hint: comp && comp.hintText ? comp.hintText : null });
    })()`);
    out.shotAdvance = await shot('campaign_advance_month');
  }
  log('sceneNow', await ev(sceneNow));
  return out;
}
