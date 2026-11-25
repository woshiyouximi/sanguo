// 稳定态测量：视口 876×1368，读 Canvas/节点世界 bbox，并查组件方法名（找 mapImageRect 等）
export default async function ({ s, evaluate, shot, log, sleep }) {
  await s('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  const q = async (label, expr) => {
    const r = await evaluate(expr);
    log('### ' + label + ' => ' + (typeof r === 'string' ? r : JSON.stringify(r)));
  };
  await q('view', `JSON.stringify({vis:[cc.view.getVisibleSize().width,cc.view.getVisibleSize().height],design:[cc.view.getDesignResolutionSize().width,cc.view.getDesignResolutionSize().height],scale:[cc.view.getScaleX(),cc.view.getScaleY()],canvasPx:[cc.game.canvas.width,cc.game.canvas.height],css:[cc.game.canvas.style.width,cc.game.canvas.style.height],inner:[innerWidth,innerHeight]})`);
  await q('proto', `(() => { const C = cc.director.getScene().getChildByName('Canvas'); const comp = C.components.find((x) => x && x.save && x.cities); const names = Object.getOwnPropertyNames(Object.getPrototypeOf(comp)); return JSON.stringify({ n: names.length, names: names.slice(0, 200) }); })()`);
  await q('geom', `(() => {
    const C = cc.director.getScene().getChildByName('Canvas');
    const cub = C.getComponent('cc.UITransform').getBoundingBoxToWorld();
    const conv = (n) => { const ut = n.getComponent('cc.UITransform'); if (!ut) return null;
      const b = ut.getBoundingBoxToWorld();
      return { n: n.name, world: [+b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)],
               design: [+b.x.toFixed(2), +(1334 - (b.y + b.height)).toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)],
               local: [+n.position.x.toFixed(2), +n.position.y.toFixed(2), n.getComponent('cc.UITransform').anchorPoint.x, n.getComponent('cc.UITransform').anchorPoint.y, n.getComponent('cc.UITransform').width, n.getComponent('cc.UITransform').height] }; };
    const out = { canvasWorld: [+cub.x.toFixed(2), +cub.y.toFixed(2), +cub.width.toFixed(2), +cub.height.toFixed(2)], canvasPos: [C.worldPosition.x, C.worldPosition.y] };
    out.map = conv(C.getChildByName('CampaignMapImage'));
    out.veil = conv(C.getChildByName('CampaignVeil'));
    out.bandsChildren = C.getChildByName('CampaignBands') ? C.getChildByName('CampaignBands').children.map(c => c.name) : null;
    return JSON.stringify(out);
  })()`);
  await shot('measure_baseline');
  return 'ok';
}
