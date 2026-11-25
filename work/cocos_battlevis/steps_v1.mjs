// 战场观感探针：出征屏数字 + 主将「场内贴边」修复的活体验证
// 思路：不改产物，在页面里用**与 GeneralArt.clampShift 完全相同的公式**给现网节点做一次
// 「画完再夹」的补丁，然后截图。这样截出来的就是重建后新代码应有的画面。
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
  const out = { page: PAGE, shots: {}, notes: [] };

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

  // ---- Campaign → 相邻敌城 ----
  const info = J(await ev(`(() => {
    const scene = cc.director.getScene();
    const comp = scene.getChildByName('Canvas').components.find(c => c && c.save && c.cities && c.actionRects);
    if (!comp) return JSON.stringify({ err: 'no campaign comp' });
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    const own = comp.save.owned.slice(); const adj = [];
    for (const p of comp.paths || []) {
      const L = Number(p.Length) || 0; if (L >= 30000) continue;
      const a = p.Start, b = p.End; const aOwn = own.indexOf(a) >= 0, bOwn = own.indexOf(b) >= 0;
      if (aOwn === bOwn) continue;
      const target = aOwn ? b : a; const sp = comp.cityScreen.get(target);
      if (!sp) continue; adj.push({ target, page: P(sp.x, sp.y) });
    }
    return JSON.stringify({ scene: scene.name, adjacent: adj.slice(0, 4) });
  })()`));
  log('INFO =', JSON.stringify(info));
  if (!info.adjacent || !info.adjacent.length) { out.fatal = 'no adjacent enemy city'; return out; }
  await click(info.adjacent[0].page[0], info.adjacent[0].page[1]);
  await sleep(1500);

  const march = J(await ev(`(() => {
    const comp = cc.director.getScene().getChildByName('Canvas').components.find(x => x && x.save && x.cities && x.actionRects);
    if (!comp || !comp.actionRects || !comp.actionRects.length) return JSON.stringify({ err: 'no actionRects' });
    const r = comp.actionRects[0]; const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ kind: r.kind, page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
  })()`));
  log('MARCH =', JSON.stringify(march));
  if (!march.page) { out.fatal = 'no march button'; return out; }
  await click(march.page[0], march.page[1]);
  await sleep(3800);

  // ---- Deploy：出征屏两个兵力数字（改前快照）----
  out.shots.deploy = await shot('10_deploy_before');
  const deploy = J(await ev(`(() => {
    const scene = cc.director.getScene();
    if (scene.name !== 'Deploy') return JSON.stringify({ scene: scene.name, err: 'not deploy' });
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    return JSON.stringify({ scene: scene.name, garrison: comp.garrison, soldiers: comp.soldiers,
      intel: comp.intel ? { name: comp.intel.name, troops: comp.intel.troops, fallback: comp.intel.fallback } : null,
      labelTarget: comp.labelTarget ? comp.labelTarget.string : null,
      labelIntel: comp.labelIntel ? comp.labelIntel.string : null,
      hasEnemySoldiers: typeof comp.enemySoldiers === 'function' });
  })()`));
  out.deploy = deploy;
  log('DEPLOY =', JSON.stringify(deploy));

  const go = J(await ev(`(() => {
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(cc.director.getScene());
    const b = (comp.buttons || []).find((x) => x.kind === 'go');
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    return JSON.stringify(b ? { page: [Math.round(vp.x + (b.x + b.w / 2) * s), Math.round(vp.y + (b.y + b.h / 2) * s)] } : {});
  })()`));
  if (!go.page) { out.fatal = 'no go button'; return out; }
  await click(go.page[0], go.page[1]);

  // ---- Battle：先拍「修复前」，再装贴边补丁拍「修复后」----
  const probe = async () => J(await ev(`(() => {
    const scene = cc.director.getScene();
    if (scene.name !== 'Battle') return JSON.stringify({ scene: scene.name });
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ scene: scene.name, err: 'no root' });
    const ga = root.generalArt;
    const sideDump = (side) => {
      const L = ga && ga.sides ? ga.sides[side] : null;
      if (!L) return null;
      const one = (k) => { const n = L[k].node; const w = L[k].box.contentSize.width; const h = L[k].box.contentSize.height;
        return { on: n.active, w: Math.round(w), h: Math.round(h), px: Math.round(n.position.x), py: Math.round(n.position.y),
          top: Math.round(667 - n.position.y - h), bottom: Math.round(667 - n.position.y) }; };
      return { horse: one('horse'), body: one('body'), weapon: one('weapon') };
    };
    const pin = window.__pin ? { A: window.__pin.A, B: window.__pin.B } : null;
    return JSON.stringify({ scene: scene.name, tick: root.world ? root.world.tick : null, camX: root.camX,
      hasArt: ga ? ga.hasArt() : null, A: sideDump('A'), B: sideDump('B'), pin,
      unitsActive: root.unitLayer ? root.unitLayer.children.filter((c) => c.active).length : null,
      bStart: root.world ? root.world.sides.B.start : null, aStart: root.world ? root.world.sides.A.start : null,
      troopA: root.world ? root.world.sides.A.troop : null, troopB: root.world ? root.world.sides.B.troop : null,
      genA: root.world ? (root.world.units.find((u) => u.isGeneral === true && u.side === 'A') || null) : null,
      genB: root.world ? (root.world.units.find((u) => u.isGeneral === true && u.side === 'B') || null) : null });
  })()`));

  await sleep(1000);
  out.before = await probe();
  out.shots.before = await shot('11_battle_before_t1');
  log('BEFORE =', JSON.stringify(out.before));

  // 与 GeneralArt.clampShift 同公式：三層並集 bbox 夾進 FIELD_TOP+4 .. FIELD_BOTTOM-4
  const install = J(await ev(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ err: 'no root' });
    const ga = root.generalArt; if (!ga) return JSON.stringify({ err: 'no art' });
    const FIELD_TOP = 100, FIELD_BOTTOM = 1000, DESIGN_W = 750, HALF_W = 375, HALF_H = 667, PAD = 4;
    const pin = { A: null, B: null };
    window.__pin = pin;
    const measure = (layer) => { const n = layer.node; const w = layer.box.contentSize.width; const h = layer.box.contentSize.height;
      const bottom = HALF_H - n.position.y; const left = n.position.x + HALF_W - w / 2;
      return { n, h, cx: n.position.x, cy: n.position.y, top: bottom - h, bottom, left, right: left + w }; };
    const orig = ga.drawSide.bind(ga);
    ga.drawSide = function (world, u, side, camX) {
      orig(world, u, side, camX);
      const L = this.sides[side];
      if (!L || !L.body.node.active) { pin[side] = null; return; }
      const parts = [L.body, L.horse.node.active ? L.horse : null, L.weapon.node.active ? L.weapon : null].filter(Boolean).map(measure);
      let top = Infinity, bottom = -Infinity, left = Infinity, right = -Infinity;
      for (const p of parts) { top = Math.min(top, p.top); bottom = Math.max(bottom, p.bottom); left = Math.min(left, p.left); right = Math.max(right, p.right); }
      let dy = 0, dx = 0;
      if (top < FIELD_TOP + PAD) dy = FIELD_TOP + PAD - top; else if (bottom > FIELD_BOTTOM - PAD) dy = FIELD_BOTTOM - PAD - bottom;
      if (left < PAD) dx = PAD - left; else if (right > DESIGN_W - PAD) dx = DESIGN_W - PAD - right;
      if (dx || dy) for (const p of parts) p.n.setPosition(p.cx + dx, p.cy - dy, 0);
      pin[side] = { dy: Math.round(dy * 10) / 10, dx: Math.round(dx * 10) / 10,
        rawTop: Math.round(top), rawBottom: Math.round(bottom), rawLeft: Math.round(left), rawRight: Math.round(right),
        x: (left + right) / 2 + dx, y: bottom + dy };
    };
    const origSprites = root.drawUnitSprites.bind(root);
    root.drawUnitSprites = function (world) {
      origSprites(world);
      for (const side of ['A', 'B']) {
        const p = pin[side];
        if (!p || (Math.abs(p.dy) < 0.5 && Math.abs(p.dx) < 0.5)) continue;
        const g = side === 'A' ? this.gA : this.gB; if (!g) continue;
        g.fillColor = new cc.Color(4, 6, 10, 120);
        g.ellipse(p.x - HALF_W, HALF_H - p.y, 16, 16 * 0.42);
        g.fill();
      }
    };
    return JSON.stringify({ ok: true, hasArt: ga.hasArt() });
  })()`));
  log('INSTALL =', JSON.stringify(install));
  out.install = install;

  await sleep(300);
  out.after1 = await probe();
  out.shots.after1 = await shot('12_battle_pinned_t1');
  log('AFTER1 =', JSON.stringify(out.after1));

  // 裁剪两张主将（按贴边后的脚底算页面坐标）
  const geo = J(await ev(`(() => {
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    const out = [];
    for (const side of ['A', 'B']) {
      const p = window.__pin ? window.__pin[side] : null;
      if (!p) { out.push({ side, ok: false }); continue; }
      out.push({ side, ok: true, page: [Math.round(vp.x + p.x * s), Math.round(vp.y + (p.y - 80) * s)], footY: Math.round(vp.y + p.y * s) });
    }
    return JSON.stringify({ vp: { x: vp.x, y: vp.y, w: vp.w, h: vp.h }, s, sides: out });
  })()`));
  out.geo = geo;
  log('GEO =', JSON.stringify(geo));
  const crops = {};
  for (const g of geo.sides || []) {
    if (!g.ok) continue;
    const w = 240, h = 240;
    const clip = { x: Math.max(0, Math.min(876 - w, g.page[0] - w / 2)), y: Math.max(0, Math.min(1368 - h, g.page[1] - h / 2)), width: w, height: h, scale: 2.5 };
    const r = await send('Page.captureScreenshot', { format: 'png', clip });
    const f = path.join(OUTDIR, '13_pinned_' + g.side + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    crops[g.side] = { path: f, bytes: fs.statSync(f).size, clip };
    log('crop', g.side, JSON.stringify(crops[g.side]));
  }
  out.crops = crops;

  // 两军接近后再看一次：贴边位移应趋近 0（恢复真实阵位）
  await sleep(6000);
  out.late = await probe();
  out.shots.late = await shot('14_battle_pinned_t9');
  log('LATE =', JSON.stringify(out.late));
  return out;
}
