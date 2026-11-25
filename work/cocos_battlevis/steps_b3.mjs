// 冻结战场（cc.director.pause()）后对比 全屏截图 vs 裁剪截图 —— 排除「相机滚动导致错位」
import fs from 'node:fs';
import path from 'node:path';

const PAGE = 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

export default async function (ctx) {
  const { send, evaluate, sleep, log, OUTDIR, click } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => J(await evaluate(expr));
  const shotFile = async (name, clip) => {
    const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
    const f = path.join(OUTDIR, name + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    return f;
  };
  const out = {};

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.navigate', { url: PAGE });
  await sleep(4500);

  const info = await ev(`(() => {
    const scene = cc.director.getScene();
    const comp = scene.getChildByName('Canvas').components.find(c => c && c.save && c.cities && c.actionRects);
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    const own = comp.save.owned.slice();
    for (const p of comp.paths || []) {
      const L = Number(p.Length) || 0;
      if (L >= 30000) continue;
      const a = p.Start, b = p.End;
      const aOwn = own.indexOf(a) >= 0, bOwn = own.indexOf(b) >= 0;
      if (aOwn === bOwn) continue;
      const target = aOwn ? b : a;
      const sp = comp.cityScreen.get(target);
      if (sp) return JSON.stringify({ target, page: P(sp.x, sp.y) });
    }
    return JSON.stringify({ err: 'no adjacent' });
  })()`);
  log('CITY', JSON.stringify(info));
  await click(info.page[0], info.page[1]);
  await sleep(1500);
  const march = await ev(`(() => {
    const comp = cc.director.getScene().getChildByName('Canvas').components.find(x => x && x.save && x.cities && x.actionRects);
    const r = comp.actionRects[0];
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ page: [Math.round(vp.x + (r.x + r.w / 2) * scale), Math.round(vp.y + (r.y + r.h / 2) * scale)] });
  })()`);
  await click(march.page[0], march.page[1]);
  await sleep(3600);
  const go = await ev(`(() => {
    const scene = cc.director.getScene();
    let comp = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && !comp) comp = c; }); n.children.forEach(find); };
    find(scene);
    const b = (comp.buttons || []).find((x) => x.kind === 'go');
    const scale = cc.view.getScaleX(); const vp = cc.view.getViewportRect();
    return JSON.stringify({ scene: scene.name, page: b ? [Math.round(vp.x + (b.x + b.w / 2) * scale), Math.round(vp.y + (b.y + b.h / 2) * scale)] : null,
      labelTarget: comp.labelTarget ? comp.labelTarget.string : null, labelIntel: comp.labelIntel ? comp.labelIntel.string : null, garrison: comp.garrison });
  })()`);
  log('GO', JSON.stringify(go));
  await click(go.page[0], go.page[1]);
  await sleep(3000);

  // 冻结：停掉 update，但渲染继续
  out.paused = await ev(`(() => { const s = cc.director.getScene(); cc.director.pause(); return JSON.stringify({ scene: s.name, paused: cc.director.isPaused() }); })()`);
  log('PAUSED', JSON.stringify(out.paused));

  const geo = async () => ev(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    const sides = {};
    for (const side of ['A', 'B']) {
      const L = root.generalArt.sides[side];
      const body = L.body.node;
      const wp = body.getWorldPosition();
      let chain = [];
      let n = body;
      while (n) { chain.push({ name: n.name, active: n.active, sibling: n.getSiblingIndex(), z: n.zIndex ?? null, op: n.getComponent(cc.UIOpacity) ? n.getComponent(cc.UIOpacity).opacity : null, layer: n.layer }); n = n.parent; }
      sides[side] = { active: body.active, local: [body.position.x, body.position.y], world: [wp.x, wp.y],
        page: [Math.round(vp.x + (wp.x + 375) * s), Math.round(vp.y + (667 - wp.y) * s)],
        horseLocal: [L.horse.node.position.x, L.horse.node.position.y], chain };
    }
    return JSON.stringify({ scene: scene.name, camX: root.camX, vp: { x: vp.x, y: vp.y }, s, sides });
  })()`);
  out.geo1 = await geo();
  log('GEO1', JSON.stringify(out.geo1).slice(0, 3000));

  await shotFile('11_frozen_full');
  out.geo2 = await geo();
  const A = out.geo1.sides.A.page, B = out.geo1.sides.B.page;
  await shotFile('11_frozen_clip_A', { x: A[0] - 100, y: A[1] - 100, width: 200, height: 200, scale: 3 });
  await shotFile('11_frozen_clip_B', { x: B[0] - 100, y: B[1] - 100, width: 200, height: 200, scale: 3 });
  await shotFile('11_frozen_full2');
  log('geo1', JSON.stringify(out.geo1.camX), 'geo2', JSON.stringify(out.geo2.camX));
  log('pageA', JSON.stringify(A), 'pageB', JSON.stringify(B));
  log('moved', JSON.stringify([out.geo1.sides.A.page, out.geo2.sides.A.page]));
  return out;
}
