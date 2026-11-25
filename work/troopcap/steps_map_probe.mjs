// 診斷 8：量 comp.toDesign 的座標換算（找 CSS → 設計座標的正確關係）
export default async function ({ evaluate, send, sleep, log }) {
  const ev = async (expr) => await evaluate(expr);
  const out = {};
  out.map = JSON.parse(await ev(`(() => {
    let comp = null;
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && Array.isArray(c.buttons) && typeof c.soldierCap === 'number' && !comp) comp = c; }); n.children.forEach(walk); };
    walk(cc.director.getScene());
    if (!comp) return JSON.stringify({ err: 'no comp' });
    const node = comp.node;
    const ui = node.getComponent(cc.UITransform);
    const rows = [];
    for (const cssY of [100, 300, 500, 700, 900, 1100, 1242, 253]) {
      const cssX = 400;
      const pt = comp.toDesign({ getUILocation: () => ({ x: cssX, y: 1242 - cssY }) });
      rows.push({ cssY, design: pt ? { x: Math.round(pt.x), y: Math.round(pt.y) } : null });
    }
    return JSON.stringify({ rows, nodePos: { x: node.position.x, y: node.position.y }, anchor: ui ? { x: ui.anchorPoint.x, y: ui.anchorPoint.y } : null, size: ui ? { w: ui.contentSize.width, h: ui.contentSize.height } : null });
  })()`));
  log('map=' + JSON.stringify(out.map));
  return out;
}
