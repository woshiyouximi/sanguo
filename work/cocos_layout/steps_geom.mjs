// 几何探针 v2：先强制视口 876×1368（与 lead 截图同尺寸），再量节点矩形
export default async function ({ s, evaluate, shot, log, sleep }) {
  const q = async (label, expr) => {
    const r = await evaluate(expr);
    log('### ' + label + ' => ' + (typeof r === 'string' ? r : JSON.stringify(r)));
  };
  await q('win', `JSON.stringify({iw:innerWidth,ih:innerHeight,ow:outerWidth,oh:outerHeight,dpr:devicePixelRatio,sw:screen.width,sh:screen.height,aw:screen.availWidth,ah:screen.availHeight})`);
  await s('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);
  await q('win after emu', `JSON.stringify({iw:innerWidth,ih:innerHeight,dpr:devicePixelRatio})`);
  await q('view after emu', `JSON.stringify({w:cc.view.getVisibleSize().width,h:cc.view.getVisibleSize().height,dw:cc.view.getDesignResolutionSize().width,dh:cc.view.getDesignResolutionSize().height,sx:cc.view.getScaleX(),sy:cc.view.getScaleY(),cw:cc.game.canvas.width,ch:cc.game.canvas.height})`);

  // 通用：把节点世界 bbox 转成「设计坐标 + 屏幕像素」两种
  await q('geom', `(() => {
    const scene = cc.director.getScene();
    const canvasNode = scene.getChildByName('Canvas');
    const cbox = canvasNode.getComponent('cc.UITransform').getBoundingBoxToWorld();
    const V = cc.view.getVisibleSize();
    const scale = cc.view.getScaleX();
    const conv = (n) => {
      const ut = n.getComponent('cc.UITransform');
      if (!ut) return null;
      const b = ut.getBoundingBoxToWorld();
      // 设计坐标：以 canvas bbox 左下为原点，y 向下
      const dx = b.x - cbox.x, dy = (cbox.y + cbox.height) - (b.y + b.height);
      // 屏幕像素：canvas 在视口中居中
      const vis = cc.view.getVisibleSize();
      const offX = (vis.width - cbox.width) / 2, offY = (vis.height - cbox.height) / 2;
      return { node: n.name, design: [ +dx.toFixed(2), +dy.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2) ],
               px: [ +((dx + offX) * scale).toFixed(1), +((dy + offY) * scale).toFixed(1), +(b.width * scale).toFixed(1), +(b.height * scale).toFixed(1) ] };
    };
    const out = { canvas: { size: [cbox.width, cbox.height], wp: [canvasNode.worldPosition.x, canvasNode.worldPosition.y], cbox },
                  visible: [V.width, V.height], scale, offset: [ (V.width - cbox.width)/2, (V.height - cbox.height)/2 ] };
    const names = ['CampaignMapImage','CampaignBands','CampaignVeil','CampaignVeilScreen','CampaignCityIcons','CampaignBase','CampaignMap','CampaignUi'];
    out.nodes = names.map(n => { const c = canvasNode.getChildByName(n); return c ? conv(c) : { node: n, missing: true }; });
    const bands = canvasNode.getChildByName('CampaignBands');
    out.bands = bands ? bands.children.map(conv) : [];
    const icons = canvasNode.getChildByName('CampaignCityIcons');
    out.iconCount = icons ? icons.children.length : -1;
    out.iconSample = icons ? icons.children.slice(0, 3).map(conv) : [];
    out.iconAll = icons ? icons.children.map(conv) : [];
    const ui = canvasNode.getChildByName('CampaignUi');
    out.uiChildren = ui ? ui.children.map(c => ({ name: c.name, comps: c.components.map(x => x && x.constructor && x.constructor.name) })) : [];
    return JSON.stringify(out);
  })()`);
  const p = await shot('emu_campaign');
  log('shot ' + JSON.stringify(p));
  return 'ok';
}
