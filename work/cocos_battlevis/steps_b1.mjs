// 战场观感探针 1：Campaign → 出征 → Deploy → Battle，按时间序列抓 主将层/士兵帧 状态 + 全屏截图
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function (ctx) {
  const { send, shot, evaluate, click, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return v;
  };
  const out = { page: PAGE, shots: {} };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Network.enable');

  await send('Page.navigate', { url: PAGE });
  await sleep(1200);

  let ready = false;
  for (let i = 0; i < 80; i++) {
    const st = J(await ev(`(() => { const has = typeof window.cc === 'object' && !!(cc.director && cc.director.getScene());
      return JSON.stringify({ has, scene: has ? cc.director.getScene().name : null }); })()`));
    if (st.has && st.scene) { ready = true; break; }
    await sleep(400);
  }
  if (!ready) { out.fatal = 'engine never ready'; return out; }
  await sleep(2600);

  // ---- campaign: 找相邻敌城 ----
  const info = J(await ev(`(() => {
    const scene = cc.director.getScene();
    const comp = scene.getChildByName('Canvas').components.find(c => c && c.save && c.cities && c.actionRects);
    if (!comp) return JSON.stringify({ err: 'no campaign comp' });
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    const own = comp.save.owned.slice();
    const adj = [];
    for (const p of comp.paths || []) {
      const L = Number(p.Length) || 0;
      if (L >= 30000) continue;
      const a = p.Start, b = p.End;
      const aOwn = own.indexOf(a) >= 0, bOwn = own.indexOf(b) >= 0;
      if (aOwn === bOwn) continue;
      const target = aOwn ? b : a;
      const sp = comp.cityScreen.get(target);
      if (!sp) continue;
      adj.push({ target, page: P(sp.x, sp.y) });
    }
    return JSON.stringify({ scene: scene.name, adjacent: adj.slice(0, 4) });
  })()`));
  out.info = info;
  log('INFO =', JSON.stringify(info));

  await click(info.adjacent[0].page[0], info.adjacent[0].page[1]);
  await sleep(1500);
  const march = J(await ev(`(() => {
    const comp = cc.director.getScene().getChildByName('Canvas').components.find(x => x && x.save && x.cities && x.actionRects);
    if (!comp || !comp.actionRects || !comp.actionRects.length) return JSON.stringify({ err: 'no actionRects' });
    const r = comp.actionRects[0];
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ kind: r.kind, page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
  })()`));
  log('MARCH =', JSON.stringify(march));
  if (!march.page) { out.fatal = 'no march button'; return out; }
  await click(march.page[0], march.page[1]);
  await sleep(3800);
  out.shots.deploy = await shot('01_deploy');
  const deployProbe = J(await ev(`(() => {
    const scene = cc.director.getScene();
    if (scene.name !== 'Deploy') return JSON.stringify({ scene: scene.name, err: 'not deploy' });
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    return JSON.stringify({ scene: scene.name, buttons: (comp.buttons || []).map((b) => ({ kind: b.kind, x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })),
      garrison: comp.garrison, soldiers: comp.soldiers, intel: comp.intel ? { name: comp.intel.name, troops: comp.intel.troops, fallback: comp.intel.fallback } : null,
      labelTarget: comp.labelTarget ? comp.labelTarget.string : null, labelIntel: comp.labelIntel ? comp.labelIntel.string : null });
  })()`));
  out.deploy = deployProbe;
  log('DEPLOY =', JSON.stringify(deployProbe).slice(0, 1200));
  const go = (deployProbe.buttons || []).find((b) => b.kind === 'go');
  if (!go) { out.fatal = 'no go button'; return out; }
  const vp = J(await ev(`(() => { const v = cc.view.getViewportRect(); return JSON.stringify({ vx: v.x, vy: v.y, s: cc.view.getScaleX() }); })()`));
  await click(Math.round(vp.vx + (go.x + go.w / 2) * vp.s), Math.round(vp.vy + (go.y + go.h / 2) * vp.s));

  // ---- battle: 时间序列 ----
  const probe = async () => J(await ev(`(() => {
    const scene = cc.director.getScene();
    if (scene.name !== 'Battle') return JSON.stringify({ scene: scene.name });
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ scene: scene.name, err: 'no root' });
    const ga = root.generalArt;
    const g = root.world ? root.world.units.filter((u) => u.isGeneral === true) : [];
    const sideDump = (side) => {
      const L = ga && ga.sides ? ga.sides[side] : null;
      if (!L) return null;
      const one = (k) => {
        const n = L[k].node; const sp = L[k].sprite;
        return { active: n.active, pos: [Math.round(n.position.x), Math.round(n.position.y)],
          size: [Math.round(L[k].box.contentSize.width), Math.round(L[k].box.contentSize.height)],
          frame: sp.spriteFrame ? (sp.spriteFrame.name || '(unnamed)') : null, en: sp.enabled };
      };
      return { horse: one('horse'), body: one('body'), weapon: one('weapon') };
    };
    return JSON.stringify({
      scene: scene.name, tick: root.world ? root.world.tick : null, frames: cc.director.getTotalFrames(),
      camX: root.camX, camY: root.camY,
      hasArt: ga ? ga.hasArt() : null, frameCount: ga && ga.frames ? ga.frames.size : null,
      indexGroups: ga && ga.index ? Object.keys(ga.index.groups).length : null,
      shapeOf: ga ? ga.shapeOf : null,
      A: sideDump('A'), B: sideDump('B'),
      units: g.map((u) => ({ side: u.side, x: Math.round(u.x), y: Math.round(u.y), alive: u.alive, cd: Math.round(u.cd || 0) })),
      aStart: root.world ? root.world.sides.A.start : null, bStart: root.world ? root.world.sides.B.start : null,
      unitsActive: root.unitLayer ? root.unitLayer.children.filter((c) => c.active).length : null,
      troopA: root.world ? root.world.sides.A.troop : null, troopB: root.world ? root.world.sides.B.troop : null,
    });
  })()`));

  const series = [];
  const mark = async (tag, ms) => {
    await sleep(ms);
    const p = await probe();
    const sh = await shot('02_battle_' + tag);
    series.push({ tag, p, shot: sh });
    log('AT', tag, JSON.stringify(p).slice(0, 1500));
  };
  await mark('t1', 1200);
  await mark('t3', 2000);
  await mark('t6', 3000);
  await mark('t9', 3000);
  out.series = series;

  // 主将局部放大：按最后一批真实节点位置算页面坐标
  const geo = J(await ev(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    const res = [];
    for (const side of ['A', 'B']) {
      const L = root.generalArt.sides[side];
      const body = L.body.node;
      if (!body.active) { res.push({ side, active: false }); continue; }
      const cx = body.position.x, bottom = L.horse.node.position.y;
      res.push({ side, active: true,
        page: [Math.round(vp.x + (cx + 375) * s), Math.round(vp.y + (667 - (bottom + 80)) * s)] });
    }
    return JSON.stringify({ vp: { x: vp.x, y: vp.y }, s, generals: res });
  })()`));
  out.geo = geo;
  log('GEO =', JSON.stringify(geo));
  const crops = {};
  for (const g of geo.generals || []) {
    if (!g.active) continue;
    const w = 200, h = 200;
    const clip = { x: Math.max(0, g.page[0] - w / 2), y: Math.max(0, g.page[1] - h / 2), width: w, height: h, scale: 3 };
    const r = await send('Page.captureScreenshot', { format: 'png', clip });
    const f = path.join(OUTDIR, '03_general_' + g.side + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    crops[g.side] = { path: f, bytes: fs.statSync(f).size, clip };
    log('crop', g.side, JSON.stringify(crops[g.side]));
  }
  out.crops = crops;
  return out;
}
