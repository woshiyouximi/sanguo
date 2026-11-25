// 步骤：①点「推進一月」验证输入链路 ②切到 Deploy ③若 Deploy 就绪，点 go 进 Battle；每步截图
export default async function ({ evaluate, sleep, click, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  const VIEW = `(() => {
    const vp = cc.view.getViewportRect();
    const d = cc.view.getDesignResolutionSize();
    return { vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), dw: d.width, dh: d.height };
  })()`;
  const v = await ev(VIEW);
  const toPage = (dx, dy) => [Math.round(v.vx + dx * v.s), Math.round(v.vy + (v.dh - dy) * v.s)];

  const findComp = `(() => {
    const scene = cc.director.getScene();
    const hits = [];
    const walk = (n) => {
      (n._components || []).forEach((c) => {
        if (!c || c === undefined) return;
        const keys = Object.keys(c).filter((k) => !k.startsWith('_'));
        if (keys.length > 6) hits.push({ node: n.name, keys: keys.slice(0, 40) });
      });
      n.children.forEach(walk);
    };
    walk(scene);
    return JSON.stringify({ scene: scene.name, comps: hits });
  })()`;

  // ① Campaign：点第三个动作
  const camp = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ err: 'no campaign comp' });
    return JSON.stringify({ month: comp.labelMonth ? comp.labelMonth.string : null, gold: comp.save ? comp.save.gold : null, rects: (comp.actionRects || []).map((r) => ({ x: r.x, y: r.y, w: r.width, h: r.height })) });
  })()`);
  out.campaignBefore = camp;
  log('VIEW', JSON.stringify(v));
  log('CAMPAIGN', JSON.stringify(camp).slice(0, 500));
  if (camp.rects && camp.rects.length >= 3 && Number.isFinite(camp.rects[2].x) && Number.isFinite(camp.rects[2].w)) {
    const r = camp.rects[2];
    const [px, py] = toPage(r.x + r.w / 2, r.y + r.h / 2);
    out.clickAdvance = [px, py];
    await click(px, py);
    await sleep(1200);
    out.campaignAfter = await ev(`(() => {
      const scene = cc.director.getScene();
      let comp = null;
      const find = (n) => { (n._components || []).forEach((c) => { if (c && c.cities && c.actionRects && !comp) comp = c; }); n.children.forEach(find); };
      find(scene);
      return JSON.stringify({ scene: scene.name, month: comp && comp.labelMonth ? comp.labelMonth.string : null, gold: comp && comp.save ? comp.save.gold : null, title: comp && comp.labelTitle ? comp.labelTitle.string : null });
    })()`);
    out.shotAdvance = await shot('campaign_advance_month');
  }

  // ② 切 Deploy
  out.loadDeploy = await ev(`(() => { try { cc.director.loadScene('Deploy'); return JSON.stringify({ok:true}); } catch (e) { return JSON.stringify({err:String(e)}); } })()`);
  await sleep(3000);
  out.deployComps = await ev(findComp);
  out.deployProbe = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ scene: scene.name, err: 'no comp with buttons', frameRate: cc.game.frameRate });
    const bt = (comp.buttons || []).map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) }));
    return JSON.stringify({ scene: scene.name, loaded: comp.loaded, troop: comp.troop, form: comp.form, buttons: bt, frames: cc.director.getTotalFrames() });
  })()`);
  const dp = out.deployProbe;
  const go = dp.buttons ? dp.buttons.find((b) => b.kind === 'go') : null;
  if (go) {
    const [px, py] = toPage(go.x + go.w / 2, go.y + go.h / 2);
    out.clickGo = [px, py];
    await click(px, py);
    await sleep(3500);
    out.battle = await ev(`(() => {
      const scene = cc.director.getScene();
      return JSON.stringify({ scene: scene.name, frames: cc.director.getTotalFrames(), children: scene.children.length, names: scene.children.map((n) => n.name).slice(0, 12) });
    })()`);
    out.shotBattle = await shot('battle_scene');
  }
  out.shotDeploy = await shot('deploy_scene');
  return out;
}
