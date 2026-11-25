// 探索：Canvas 节点上到底有什么组件 / UITransform 在哪
export default async function ({ evaluate, shoot, log, sleep }) {
  const q = async (label, expr) => {
    const r = await evaluate(expr);
    log('### ' + label + ' => ' + (typeof r === 'string' ? r : JSON.stringify(r)));
  };
  await q('scene', `cc.director.getScene().name`);
  await q('children', `JSON.stringify(cc.director.getScene().children.map(n=>n.name))`);
  await q('canvasComponents', `(() => { const c = cc.director.getScene().getChildByName('Canvas'); return JSON.stringify(c.components.map(x=>x && x.constructor && x.constructor.name)); })()`);
  await q('cc.UITransform?', `typeof cc.UITransform`);
  await q('canvas UITransform count', `(() => { const c = cc.director.getScene().getChildByName('Canvas'); return JSON.stringify(c.getComponents(cc.UITransform).length); })()`);
  await q('canvas ui via getComponent string', `(() => { const c = cc.director.getScene().getChildByName('Canvas'); const u = c.getComponent('cc.UITransform'); return u ? JSON.stringify({w:u.width,h:u.height,a:u.anchorPoint}) : 'null'; })()`);
  await q('canvas children', `(() => { const c = cc.director.getScene().getChildByName('Canvas'); return JSON.stringify(c.children.map(n=>n.name)); })()`);
  await q('vis', `JSON.stringify({w:cc.view.getVisibleSize().width,h:cc.view.getVisibleSize().height,dw:cc.view.getDesignResolutionSize().width,dh:cc.view.getDesignResolutionSize().height,sx:cc.view.getScaleX(),sy:cc.view.getScaleY(),inner:[window.innerWidth,window.innerHeight]})`);
  const s = await shoot('explore');
  log('shot ' + JSON.stringify(s));
  return 'ok';
}
