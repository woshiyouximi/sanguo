// Battle 探针：Deploy 里点 go（坐标不翻转：rect 左上原点）→ 等 → 用 System.import('cc') 做 instanceof 统计
export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;
  const J = (s) => (typeof s === 'string' ? JSON.parse(s) : s);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = {};
  const sc0 = J(await ev(`JSON.stringify({ scene: cc.director.getScene().name })`));
  out.start = sc0;
  if (sc0.scene !== 'Deploy') {
    await ev(`cc.director.loadScene('Deploy')`);
    await sleep(3000);
  }
  const V = J(await ev(`(() => { const vp = cc.view.getViewportRect(); const d = cc.view.getDesignResolutionSize();
    return JSON.stringify({ vx: vp.x, vy: vp.y, s: cc.view.getScaleX(), dw: d.width, dh: d.height }); })()`));
  out.view = V;
  const probe = J(await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    if (!comp) return JSON.stringify({ err: 'no comp with buttons', scene: scene.name });
    return JSON.stringify({ scene: scene.name, loaded: comp.loaded, troop: comp.troop, form: comp.form,
      buttons: (comp.buttons || []).map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })) });
  })()`));
  out.deploy = probe;
  log('deploy probe =', JSON.stringify(probe).slice(0, 1400));
  if (probe.err) return out;

  const go = probe.buttons.find((b) => b.kind === 'go');
  out.go = go;
  if (go) {
    const gp = [Math.round(V.vx + (go.x + go.w / 2) * V.s), Math.round(V.vy + (go.y + go.h / 2) * V.s)];
    out.clickGo = gp;
    log('click go =', JSON.stringify(gp));
    await click(gp[0], gp[1]);
    await sleep(5000);
  }

  // 用真实引擎构造函数做 instanceof 统计（minify 后 constructor.name 不可靠）
  out.battle = J(await ev(`(async () => {
    const C = await System.import('cc');
    const sc = cc.director.getScene();
    let nodes = 0, labels = 0, sprites = 0, graphics = 0, masks = 0, uis = 0;
    const rec = (n) => { nodes++; uis += n.components.filter(c => c instanceof C.UITransform).length;
      labels += n.components.filter(c => c instanceof C.Label).length;
      sprites += n.components.filter(c => c instanceof C.Sprite).length;
      graphics += n.components.filter(c => c instanceof C.Graphics).length;
      masks += n.components.filter(c => c instanceof C.Mask).length;
      n.children.forEach(rec); };
    rec(sc);
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodes, labels, sprites, graphics, masks, uis,
      children: sc.children.length, names: sc.children.map(n => n.name).slice(0, 20) });
  })()`));
  log('BATTLE =', JSON.stringify(out.battle));
  await sleep(800);
  out.shot = await shot('05_battle');
  log('shot =', JSON.stringify(out.shot));

  out.fps = J(await ev(`new Promise((resolve) => {
    const t = []; let last = performance.now(); let n = 0;
    const tick = () => { const now = performance.now(); if (n > 0) t.push(now - last); last = now; n++;
      if (n <= 60) requestAnimationFrame(tick);
      else { const s = t.slice().sort((a,b)=>a-b); const sum = s.reduce((a,b)=>a+b,0);
        resolve(JSON.stringify({ frames: s.length, avgMs: +(sum/s.length).toFixed(2), medianMs: +s[Math.floor(s.length/2)].toFixed(2),
          p95Ms: +s[Math.floor(s.length*0.95)].toFixed(2), minMs: +s[0].toFixed(2), maxMs: +s[s.length-1].toFixed(2),
          fps: +(1000/(sum/s.length)).toFixed(1), engineFrameRate: cc.game.frameRate })); } };
    requestAnimationFrame(tick);
  })`));
  log('FPS =', JSON.stringify(out.fps));
  return out;
}
