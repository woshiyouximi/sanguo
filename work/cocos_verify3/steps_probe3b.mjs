// 收尾探针：HUD 底图/背景/天气状态 + 主将三层放大（含身体与武器，裁剪中心上移）
import fs from 'node:fs';
import path from 'node:path';

export default async function (ctx) {
  const { s, evaluate, log, OUTDIR } = ctx;
  const J = (x) => (typeof x === 'string' ? JSON.parse(x) : x);

  const st = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.artHud !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const hud = root && root.artHud;
    return JSON.stringify({
      artHudState: hud ? hud.state : null,
      bgReady: root && root.bg ? root.bg.ready : null,
      bgTerrain: root && root.bg ? root.bg.terrain : null,
      weatherSet: root && root.weatherLayer ? root.weatherLayer.weather : null,
      hasBgNode: !!scene.getChildByName('Canvas').getChildByName('BattleBg'),
      bgChildren: scene.getChildByName('Canvas').getChildByName('BattleBg') ? scene.getChildByName('Canvas').getChildByName('BattleBg').children.map((n) => n.name) : null,
      frameRate: cc.game.frameRate,
      totalFrames: cc.director.getTotalFrames(),
      gfx: ['BattleBase','UnitsA','UnitsB','Generals','Fx'].map((n) => {
        const node = scene.getChildByName('Canvas').getChildByName(n);
        return { name: n, exists: !!node, active: node ? node.active : null };
      }),
    });
  })()`));
  log('STATE =', JSON.stringify(st));

  const geo = J(await evaluate(`(() => {
    const vp = cc.view.getViewportRect(); const s = cc.view.getScaleX();
    const scene = cc.director.getScene();
    let root = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.world !== undefined && c.generalArt !== undefined && !root) root = c; }); n.children.forEach(find); };
    find(scene);
    const out = [];
    for (const side of ['A', 'B']) {
      const L = root.generalArt.sides[side];
      const horse = L.horse.node, body = L.body.node;
      // 马节点锚点在底部：脚底 y = horse.position.y；整组高约 165 设计px，中心取脚底上方 75
      const cx = (horse.position.x + body.position.x) / 2;
      const footY = horse.position.y;
      out.push({ side, page: [Math.round(vp.x + (cx + 375) * s), Math.round(vp.y + (667 - (footY + 75)) * s)] });
    }
    return JSON.stringify({ s, vp: { x: vp.x, y: vp.y }, generals: out });
  })()`));
  log('GEO2 =', JSON.stringify(geo));

  const crops = {};
  for (const g of geo.generals) {
    const w = 220, h = 220;
    const clip = { x: Math.max(0, g.page[0] - w / 2), y: Math.max(0, g.page[1] - h / 2), width: w, height: h, scale: 3 };
    const r = await s('Page.captureScreenshot', { format: 'png', clip });
    const out = path.join(OUTDIR, '08_general3_' + g.side + '.png');
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    crops[g.side] = { path: out, bytes: fs.statSync(out).size, clip };
    log('crop3', g.side, JSON.stringify(crops[g.side]));
  }
  return { state: st, geo, crops };
}
