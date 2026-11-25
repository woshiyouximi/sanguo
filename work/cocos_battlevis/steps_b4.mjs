// 深挖：Battle 场景已在跑时，只看主将层的真实状态（不导航）
import fs from 'node:fs';
import path from 'node:path';

export default async function (ctx) {
  const { send, evaluate, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => J(await evaluate(expr));
  const out = {};

  await send('Page.enable');
  await send('Runtime.enable');

  out.before = await ev(`(() => JSON.stringify({ scene: cc.director.getScene() ? cc.director.getScene().name : null, paused: cc.director.isPaused() }))()`);
  log('BEFORE', JSON.stringify(out.before));
  if (out.before.paused) { await ev(`(() => { cc.director.resume(); return JSON.stringify({ paused: cc.director.isPaused() }); })()`); }
  await sleep(1500);

  out.dump = await ev(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ scene: scene.name, err: 'no root' });
    const ga = root.generalArt;
    const w = root.world;
    const gs = w.units.filter((u) => u.isGeneral === true).map((u) => ({ side: u.side, x: u.x, y: u.y, alive: u.alive, hp: u.hp, cd: u.cd }));
    const proj = (u) => { const p = root.constructor && null; return null; };
    const sides = {};
    for (const side of ['A', 'B']) {
      const L = ga.sides[side];
      const one = (k) => {
        const n = L[k].node; const sp = L[k].sprite;
        return { active: n.active, local: [Math.round(n.position.x), Math.round(n.position.y)],
          size: [Math.round(L[k].box.contentSize.width), Math.round(L[k].box.contentSize.height)],
          anchor: [L[k].box.anchorX, L[k].box.anchorY],
          z: n.zIndex, sibling: n.getSiblingIndex(), spriteEnabled: sp.enabled, color: sp.color ? [sp.color.r, sp.color.g, sp.color.b, sp.color.a] : null,
          frame: sp.spriteFrame ? { name: sp.spriteFrame.name, rect: [sp.spriteFrame.rect.x, sp.spriteFrame.rect.y, sp.spriteFrame.rect.width, sp.spriteFrame.rect.height],
            tex: sp.spriteFrame.texture ? [sp.spriteFrame.texture.width, sp.spriteFrame.texture.height] : null } : null };
      };
      sides[side] = { horse: one('horse'), body: one('body'), weapon: one('weapon'), nodeSibling: L.node.getSiblingIndex() };
    }
    return JSON.stringify({ scene: scene.name, tick: w.tick, over: w.over, camX: root.camX, camY: root.camY,
      totalFrames: cc.director.getTotalFrames(), hasArt: ga.hasArt(), frames: ga.frames ? ga.frames.size : null,
      indexGroups: ga.index ? Object.keys(ga.index.groups).length : null, shapeA: ga.shapeA, shapeB: ga.shapeB,
      generals: gs, sides,
      generalArtNode: { name: ga.node ? ga.node.name : 'GeneralArt', active: ga.node ? ga.node.active : null, sibling: ga.node ? ga.node.getSiblingIndex() : null,
        children: ga.node ? ga.node.children.map((c) => ({ name: c.name, active: c.active, sibling: c.getSiblingIndex(), kids: c.children.map((k) => ({ name: k.name, active: k.active, sibling: k.getSiblingIndex() })) })) : null },
      unitLayer: root.unitLayer ? { name: root.unitLayer.name, sibling: root.unitLayer.getSiblingIndex(), active: root.unitLayer.children.filter((c) => c.active).length, total: root.unitLayer.children.length, maxSiblingZ: Math.max(...root.unitLayer.children.map((c) => c.getSiblingIndex())) } : null,
      canvasChildren: scene.getChildByName('Canvas').children.map((c) => ({ name: c.name, active: c.active, sibling: c.getSiblingIndex() })) });
  })()`);
  log('DUMP', JSON.stringify(out.dump).slice(0, 6000));

  // 全屏 + 裁剪 各拍两张，检查是否帧间差异
  const shot = async (name, clip) => {
    const r = await send('Page.captureScreenshot', clip ? { format: 'png', clip } : { format: 'png' });
    const f = path.join(OUTDIR, name + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    return f;
  };
  out.shots = [];
  out.shots.push(await shot('20_live_full_a'));
  await sleep(200);
  out.shots.push(await shot('20_live_full_b'));
  await sleep(200);
  out.shots.push(await shot('20_live_full_c'));
  log('SHOTS', JSON.stringify(out.shots));
  return out;
}
