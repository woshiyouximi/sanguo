// 步骤模块：把 Campaign 场景的坐标映射、可点按钮、组件暴露面 dump 出来
export default async function ({ evaluate, shot, log }) {
  const info = await evaluate(`(() => {
    const out = {};
    out.view = {
      visible: (() => { const v = cc.view.getVisibleSize(); return [Math.round(v.width), Math.round(v.height)]; })(),
      design: (() => { const v = cc.view.getDesignResolutionSize(); return [v.width, v.height]; })(),
      scaleX: cc.view.getScaleX(), scaleY: cc.view.getScaleY(),
      canvasRect: cc.view.getCanvasRect ? (() => { const r = cc.view.getCanvasRect(); return [r.x, r.y, r.width, r.height]; })() : null,
      frameSize: [Math.round(cc.view.getFrameSize().width), Math.round(cc.view.getFrameSize().height)],
      dpr: cc.view.getDevicePixelRatio(),
      visibleRect: (() => { const r = cc.view.getVisibleRect ? cc.view.getVisibleRect() : null; return r ? [r.x, r.y, r.width, r.height] : null; })(),
    };
    out.innerWH = [innerWidth, innerHeight];
    const scene = cc.director.getScene();
    const walk = (n, depth, acc) => {
      if (acc.length > 120) return;
      const t = n.getComponent && n.getComponent(cc.UITransform);
      let bb = null;
      if (t && t.getBoundingBoxToWorld) { const b = t.getBoundingBoxToWorld(); bb = [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)]; }
      acc.push('  '.repeat(depth) + n.name + (n.activeInHierarchy ? '' : '(inactive)') + (bb ? ' @' + bb.join(',') : ''));
      n.children.forEach((c) => walk(c, depth + 1, acc));
    };
    const acc = [];
    walk(scene, 0, acc);
    out.tree = acc;
    // 所有自定义组件（脚本）暴露的属性
    const comps = [];
    const collect = (n) => {
      (n._components || []).forEach((c) => {
        const nm = (c.constructor && c.constructor.name) || 'anon';
        if (nm === 'UITransform' || nm === 'Canvas' || nm === 'Camera' || nm === 'Widget' || nm === 'Sprite' || nm === 'Label' || nm === 'Graphics' || nm === 'UIOpacity' || nm === 'BlockInputEvents' || nm === 'Button') return;
        const own = Object.keys(c).filter((k) => !k.startsWith('_'));
        comps.push({ node: n.name, comp: nm, keys: own.slice(0, 60) });
      });
      n.children.forEach(collect);
    };
    collect(scene);
    out.components = comps;
    return out;
  })()`);
  const sp = await shot('campaign_ui');
  log('shot', sp.path, sp.bytes);
  return info;
}
