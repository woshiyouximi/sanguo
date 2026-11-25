// 探针：Campaign 场景 / 存档 owned / 城池坐标 / CityPanel 命令与列表结构
export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;
  const J = (s) => JSON.parse(s);

  const sc0 = J(await evaluate(`JSON.stringify({ scene: cc.director.getScene() ? cc.director.getScene().name : null })`));
  if (sc0.scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3000);
  }

  const info = J(await evaluate(`(() => {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return JSON.stringify({ scene: scene.name, canvas: false });
    const comp = canvas.components.find(c => c && c.save && c.cities && c.actionRects);
    if (!comp) return JSON.stringify({ scene: scene.name, canvas: true, comp: false, comps: canvas.components.map(c => c && c.constructor && c.constructor.name).slice(0, 40) });
    const scale = cc.view.getScaleX();
    const vp = cc.view.getViewportRect();
    const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
    const cp = comp.cityPanel;
    return JSON.stringify({
      scene: scene.name,
      scale, vp: { x: vp.x, y: vp.y, w: vp.width, h: vp.height },
      own: comp.save.owned.slice(),
      hasBeiping: comp.cityScreen.has('北平'),
      beiping: comp.cityScreen.has('北平') ? P(comp.cityScreen.get('北平').x, comp.cityScreen.get('北平').y) : null,
      yijing: comp.cityScreen.has('易京') ? P(comp.cityScreen.get('易京').x, comp.cityScreen.get('易京').y) : null,
      cityScreenSize: comp.cityScreen.size,
      panelOpen: cp ? (typeof cp.isOpen === 'function' ? !!cp.isOpen() : !!cp.isOpen) : null,
      panelKeys: cp ? Object.keys(cp).filter(k => /cmd|sheet|rect|label|title/i.test(k)) : null,
      cmdTags: cp && cp.cmdTags ? cp.cmdTags.map(l => l.string) : null,
      cmdRects: cp && cp.cmdRects ? cp.cmdRects.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h, page: P(r.x + r.w / 2, r.y + r.h / 2) })) : null,
      sheetOpen: cp && cp.sheetOpen ? cp.sheetOpen.map ? cp.sheetOpen.map(s => !!s) : !!cp.sheetOpen : null,
      sheetLabels: cp && cp.sheetLabels ? cp.sheetLabels.map(l => l.string) : null,
      note: comp.hintText || null,
    });
  })()`));

  log('info =', JSON.stringify(info, null, 1));
  return info;
}
