// 逐 0.5s 采样 Battle 前 12 秒：每侧主将的动作/分组/取帧结果/节点可见性
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function (ctx) {
  const { send, evaluate, sleep, log, OUTDIR, click } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => J(await evaluate(expr));
  const out = { samples: [] };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(4500);

  const info = await ev(`(() => {
    const scene = cc.director.getScene();
    const comp = scene.getChildByName('Canvas').components.find(c => c && c.save && c.cities && c.actionRects);
    const s = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * s), Math.round(vp.y + y * s)];
    const own = comp.save.owned.slice();
    for (const p of comp.paths || []) {
      if ((Number(p.Length) || 0) >= 30000) continue;
      const aOwn = own.indexOf(p.Start) >= 0, bOwn = own.indexOf(p.End) >= 0;
      if (aOwn === bOwn) continue;
      const t = aOwn ? p.End : p.Start; const sp = comp.cityScreen.get(t);
      if (sp) return JSON.stringify({ target: t, page: P(sp.x, sp.y) });
    }
    return JSON.stringify({ err: 'no adjacent' });
  })()`);
  await click(info.page[0], info.page[1]);
  await sleep(1500);
  const march = await ev(`(() => {
    const comp = cc.director.getScene().getChildByName('Canvas').components.find(x => x && x.save && x.cities && x.actionRects);
    const r = comp.actionRects[0]; const s = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ page: [Math.round(vp.x + (r.x + r.w / 2) * s), Math.round(vp.y + (r.y + r.h / 2) * s)] });
  })()`);
  await click(march.page[0], march.page[1]);
  await sleep(3600);
  const go = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null; const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); }; find(scene);
    const b = (comp.buttons || []).find((x) => x.kind === 'go');
    const s = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ scene: scene.name, page: b ? [Math.round(vp.x + (b.x + b.w / 2) * s), Math.round(vp.y + (b.y + b.h / 2) * s)] : null,
      labelTarget: comp.labelTarget ? comp.labelTarget.string : null, labelIntel: comp.labelIntel ? comp.labelIntel.string : null,
      garrison: comp.garrison, intel: comp.intel ? { troops: comp.intel.troops, name: comp.intel.name, fallback: !!comp.intel.fallback } : null });
  })()`);
  out.deploy = go;
  log('DEPLOY', JSON.stringify(go));
  await click(go.page[0], go.page[1]);

  const probe = () => ev(`(() => {
    const scene = cc.director.getScene();
    let root = null; const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ scene: scene.name });
    const ga = root.generalArt; const w = root.world;
    if (!ga || !ga.frames) return JSON.stringify({ scene: scene.name, art: false });
    const sides = {};
    for (const side of ['A', 'B']) {
      const u = w.units.find((x) => x.side === side && x.isGeneral === true);
      if (!u) { sides[side] = { unit: null }; continue; }
      const dead = !u.alive;
      const moving = u.x !== (u.prevX ?? u.x) || u.y !== (u.prevY ?? u.y);
      const attack = !dead && (u.cd ?? 0) > 96;
      const act = dead ? 'Death' : attack ? 'Attack' : moving ? 'Walk' : 'Wait';
      const letter = side === 'A' ? 'L' : 'R';
      const suffix = act === 'Wait' || act === 'Attack' ? ':1' : '';
      const bodyGroup = letter + ga.shapeOf[side] + ':' + act + suffix;
      const horseAct = attack ? 'Attack' : moving ? 'Walk' : 'Wait';
      const L = ga.sides[side];
      const geo = (n) => ({ on: n.node.active, py: Math.round(667 - n.node.position.y), px: Math.round(375 + n.node.position.x), h: Math.round(n.box.contentSize.height), oy: null });
      sides[side] = { act, moving, attack, bodyGroup, inIdx: !!ga.index.groups[bodyGroup], hasFrames: !!ga.frames.get((ga.index.groups[bodyGroup] || [])[0]),
        horseGroup: 'H900:' + horseAct, horseInIdx: !!ga.index.groups['H900:' + horseAct],
        u: [Math.round(u.x), Math.round(u.y)], prev: [Math.round(u.prevX ?? -1), Math.round(u.prevY ?? -1)], cd: Math.round(u.cd ?? 0), alive: u.alive,
        body: geo(L.body), horse: geo(L.horse), weapon: geo(L.weapon) };
    }
    return JSON.stringify({ scene: scene.name, tick: w.tick, over: w.over, camX: Math.round(root.camX * 10) / 10, shapes: ga.shapeOf, nF: ga.frames.size, sides });
  })()`);

  const shots = [];
  out.t0 = Date.now();
  for (let i = 0; i < 24; i += 1) {
    await sleep(500);
    const p = await probe();
    if (p.scene !== 'Battle') { out.samples.push({ i, scene: p.scene }); break; }
    out.samples.push({ i, t: Math.round((Date.now() - out.t0) / 100) / 10, tick: p.tick, over: p.over, camX: p.camX, shapes: p.shapes, A: p.sides.A, B: p.sides.B });
    log('S' + i, JSON.stringify({ tick: p.tick, over: p.over, A: p.sides.A && { act: p.sides.A.act, bg: p.sides.A.bodyGroup, on: p.sides.A.body.on, py: p.sides.A.body.py, u: p.sides.A.u }, B: p.sides.B && { act: p.sides.B.act, bg: p.sides.B.bodyGroup, on: p.sides.B.body.on, py: p.sides.B.body.py, u: p.sides.B.u } }));
    if (i === 3 || i === 6 || i === 12) {
      const r = await send('Page.captureScreenshot', { format: 'png' });
      const f = path.join(OUTDIR, `40_t${Math.round((Date.now() - out.t0) / 1000)}s.png`);
      fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
      shots.push(f);
    }
  }
  out.shots = shots;
  return out;
}
