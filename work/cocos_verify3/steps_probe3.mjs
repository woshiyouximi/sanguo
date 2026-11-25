// 结算后补探针：主将三层节点真实名字/激活/贴图 + 局部放大截图（证明马/身体/武器三层）
import fs from 'node:fs';
import path from 'node:path';

export default async function (ctx) {
  const { s, shot, evaluate, sleep, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

  const probe = J(await evaluate(`(async () => {
    const C = await System.import('cc');
    const S = C.Sprite, L = C.Label, UIT = C.UITransform;
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const ga = root && root.generalArt;
    const arts = [];
    const walk = (n, depth) => {
      const sp = n.components.find((c) => S && c instanceof S);
      const ui = n.components.find((c) => UIT && c instanceof UIT);
      arts.push({ name: n.name, depth, active: n.active, pos: [Math.round(n.position.x), Math.round(n.position.y)],
        size: ui ? [Math.round(ui.contentSize.width), Math.round(ui.contentSize.height)] : null,
        frame: sp && sp.spriteFrame ? (sp.spriteFrame.name || '(unnamed)') : null,
        hasSprite: !!sp, spriteEnabled: sp ? sp.enabled : null });
      if (depth < 2) n.children.forEach((c) => walk(c, depth + 1));
    };
    if (ga) walk(ga.root, 0);
    const unitRoot = scene.getChildByName('Canvas').getChildByName('UnitSprites');
    const sprites = unitRoot ? unitRoot.children.filter((c) => c.active).slice(0, 3).map((c) => {
      const sp = c.components.find((x) => S && x instanceof S);
      return { name: c.name, pos: [Math.round(c.position.x), Math.round(c.position.y)],
        frame: sp && sp.spriteFrame ? sp.spriteFrame.name : null };
    }) : [];
    const labels = [];
    const rec = (n) => { n.components.forEach((c) => { if (L && c instanceof L) labels.push({ node: n.name, text: String(c.string || '').slice(0, 260) }); }); n.children.forEach(rec); };
    rec(scene);
    return JSON.stringify({
      scene: scene.name,
      generalsRoot: ga ? ga.root.name : null,
      generalHasArt: ga ? ga.hasArt() : null,
      artNodes: arts,
      unitSpritesActive: unitRoot ? unitRoot.children.filter((c) => c.active).length : null,
      sampleUnitSprites: sprites,
      labels,
      settlement: root && root.settlement ? { winner: root.settlement.winner, kills: root.settlement.kills, spellKills: root.settlement.spellKills, dur: root.settlement.durationSec } : null,
      worldOver: root && root.world ? root.world.over : null,
    });
  })()`));
  log('PROBE =', JSON.stringify(probe).slice(0, 4000));

  // 局部放大：主将所在的战场区域（设计坐标 750x1334 → 页面坐标）
  const geo = J(await evaluate(`(() => {
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const out = [];
    if (root && root.generalArt) {
      for (const side of ['A', 'B']) {
        const layers = root.generalArt.sides ? root.generalArt.sides[side] : null;
        if (layers && layers.body && layers.body.node.active) {
          const p = layers.body.node.position;
          out.push({ side, page: [Math.round(vp.x + (p.x + 375) * s), Math.round(vp.y + (667 - p.y) * s)],
            design: [Math.round(p.x + 375), Math.round(667 - p.y)] });
        }
      }
    }
    return JSON.stringify({ vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height }, s, generals: out });
  })()`));
  log('GEO =', JSON.stringify(geo));

  const crops = {};
  for (const g of geo.generals || []) {
    const w = 150, h = 150;
    const clip = { x: Math.max(0, g.page[0] - w / 2), y: Math.max(0, g.page[1] - h / 2), width: w, height: h, scale: 3 };
    const r = await s('Page.captureScreenshot', { format: 'png', clip });
    const out = path.join(OUTDIR, '07_general_' + g.side + '_zoom.png');
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    crops[g.side] = { path: out, bytes: fs.statSync(out).size, clip, generalPage: g.page };
    log('crop', g.side, JSON.stringify(crops[g.side]));
  }
  return { probe, geo, crops };
}
