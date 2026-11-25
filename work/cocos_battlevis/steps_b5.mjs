// 精确 dump：把主将层节点的「底边中心 local 坐标」换成设计坐标(750x1334, 左上原点)页面坐标，
// 冻结后同时拍 全屏 + 该点裁剪，判断主将到底画在哪 / 有没有画
import fs from 'node:fs';
import path from 'node:path';

export default async function (ctx) {
  const { send, evaluate, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);
  const ev = async (expr) => J(await evaluate(expr));
  const out = {};

  await send('Page.enable');
  await send('Runtime.enable');
  if ((await ev(`(() => JSON.stringify({ p: cc.director.isPaused() }))()`)).p) {
    await ev(`(() => { cc.director.resume(); return 'ok'; })()`);
  }
  await sleep(1200);

  const dump = () => ev(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    if (!root) return JSON.stringify({ scene: scene.name, err: 'no root' });
    const ga = root.generalArt; const w = root.world;
    const layer = (L) => {
      const n = L.node; const b = L.box.contentSize; const sp = L.sprite;
      // local 是底边中心（anchor 0.5,0）；设计坐标左上原点：px = 375 + x, py = 667 - y
      const px = 375 + n.position.x; const py = 667 - n.position.y;
      return { on: n.active, sE: sp.enabled, z: n.zIndex, sib: n.getSiblingIndex(), w: Math.round(b.width), h: Math.round(b.height),
        px: Math.round(px), py: Math.round(py), top: Math.round(py - b.height),
        frame: sp.spriteFrame ? (sp.spriteFrame.name || '?') : null,
        rect: sp.spriteFrame ? [sp.spriteFrame.rect.x, sp.spriteFrame.rect.y, sp.spriteFrame.rect.width, sp.spriteFrame.rect.height] : null };
    };
    return JSON.stringify({
      scene: scene.name, tick: w.tick, over: w.over, camX: root.camX, frame: cc.director.getTotalFrames(),
      hasArt: ga.hasArt(), nFrames: ga.frames ? ga.frames.size : 0, shapeA: ga.shapeA, shapeB: ga.shapeB,
      shapes: ga.shapeOf,
      gens: w.units.filter((u) => u.isGeneral === true).map((u) => ({ side: u.side, x: Math.round(u.x), y: Math.round(u.y), alive: u.alive, hp: Math.round(u.hp), cd: Math.round(u.cd), prev: [Math.round(u.prevX ?? -1), Math.round(u.prevY ?? -1)], hit: u.lastHitTick })),
      A: { horse: layer(ga.sides.A.horse), body: layer(ga.sides.A.body), weapon: layer(ga.sides.A.weapon) },
      B: { horse: layer(ga.sides.B.horse), body: layer(ga.sides.B.body), weapon: layer(ga.sides.B.weapon) },
      genRoot: { name: ga.root.name, active: ga.root.active, sib: ga.root.getSiblingIndex(), kids: ga.root.children.map((c) => ({ n: c.name, on: c.active, sib: c.getSiblingIndex() })) },
      canvasOrder: scene.getChildByName('Canvas').children.map((c) => ({ n: c.name, sib: c.getSiblingIndex(), on: c.active })),
    });
  })()`);

  out.d1 = await dump();
  log('D1', JSON.stringify(out.d1));
  if (out.d1.scene !== 'Battle') { out.fatal = 'not battle: ' + out.d1.scene; return out; }

  await ev(`(() => { cc.director.pause(); return 'paused'; })()`);
  await sleep(120);
  out.d2 = await dump();
  log('D2', JSON.stringify(out.d2));

  const clipA = async (name, px, py, w, h) => {
    const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: px, y: py, width: w, height: h, scale: 2 } });
    const f = path.join(OUTDIR, name + '.png');
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    return f;
  };
  const vp = await ev(`(() => { const v = cc.view.getViewportRect(); return JSON.stringify({ x: v.x, y: v.y, s: cc.view.getScaleX() }); })()`);
  out.vp = vp;
  const conv = (d) => [Math.round(vp.x + d.px * vp.s), Math.round(vp.y + d.top * vp.s)];
  out.shots = {};
  for (const side of ['A', 'B']) {
    const d = out.d2[side];
    const tm = conv(d.horse);
    out.shots[side] = { tm, }
    out.shots[side].clip = await clipA('30_frozen_' + side, Math.max(0, tm[0] - 100), Math.max(0, tm[1] - 20), 220, 200);
  }
  const f = await send('Page.captureScreenshot', { format: 'png' });
  out.shots.full = path.join(OUTDIR, '30_frozen_full.png');
  fs.writeFileSync(out.shots.full, Buffer.from(f.data, 'base64'));
  log('SHOTS', JSON.stringify(out.shots));
  return out;
}
