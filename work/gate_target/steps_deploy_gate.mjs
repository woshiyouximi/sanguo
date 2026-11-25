// 出征目标点「易京」→ Deploy 编成页：确认 守軍=110 / 上陣=110 真的进了战斗入口
const CAMP = `(() => {
  const scene = cc.director.getScene();
  if (!scene) return null;
  const canvas = scene.getChildByName('Canvas');
  if (!canvas) return null;
  return canvas.components.find(c => c && c.save && c.cities && c.actionRects) || null;
})()`;

const STATE = `(() => { try {
  const comp = ${CAMP};
  if (!comp) return JSON.stringify({ camp: false, scene: cc.director.getScene() ? cc.director.getScene().name : null });
  const scale = cc.view.getScaleX();
  const vp = cc.view.getViewportRect();
  const P = (x, y) => [Math.round(vp.x + x * scale), Math.round(vp.y + y * scale)];
  const cp = comp.cityPanel;
  const open = cp ? (typeof cp.isOpen === 'function' ? !!cp.isOpen() : !!cp.isOpen) : false;
  const tags = cp ? (cp.cmdTags || []).map(l => String(l.string).replace(/\\s/g, '')) : [];
  const idx = tags.findIndex(t => t.indexOf('出征') >= 0);
  const cr = cp && idx >= 0 ? cp.cmdRects[idx] : null;
  const sp = comp.cityScreen.get(comp.save.owned[0]);
  const labels = cp ? (cp.sheetLabels || []).map(l => l.string) : [];
  const rects = cp ? (cp.sheetRects || []).map(r => ({ page: P(r.x + r.w / 2, r.y + r.h / 2) })) : [];
  return JSON.stringify({
    camp: true, scene: cc.director.getScene().name, own: comp.save.owned.slice(),
    home: comp.save.owned[0], homePage: sp ? P(sp.x, sp.y) : null,
    panelOpen: open, tags, deployIdx: idx,
    deployPage: cr ? P(cr.x + cr.w / 2, cr.y + cr.h / 2) : null,
    labels, rects: rects.slice(0, 6),
  });
} catch (e) { return JSON.stringify({ err: String(e) }); } })()`;

export default async function (ctx) {
  const { evaluate, click, shot, sleep, log } = ctx;
  const J = (s) => JSON.parse(s);
  const st = async () => J(await evaluate(STATE));
  const out = {};

  // 0) 等 Campaign 就绪
  let s = null;
  for (let i = 0; i < 30; i++) {
    s = await st();
    if (s.camp) break;
    if (s.scene !== 'Campaign') await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(1000);
  }
  log('state =', JSON.stringify(s));
  out.first = s;
  if (!s.camp || !s.homePage) return out;

  // 1) 点自己的城开内政面板（最多试 3 次）
  for (let i = 0; i < 3 && !s.panelOpen; i++) {
    await click(s.homePage[0], s.homePage[1]);
    for (let k = 0; k < 10; k++) {
      await sleep(400);
      s = await st();
      if (s.panelOpen) break;
    }
  }
  out.panel = { open: s.panelOpen, tags: s.tags, deployIdx: s.deployIdx, deployPage: s.deployPage };
  log('panel open =', s.panelOpen, 'tags =', JSON.stringify(s.tags));
  if (!s.panelOpen || s.deployIdx < 0) return out;

  // 2) 点「出 征」→ 等列表
  await click(s.deployPage[0], s.deployPage[1]);
  for (let k = 0; k < 12; k++) {
    await sleep(400);
    s = await st();
    if (s.labels && s.labels.slice(0, 4).some(t => String(t).indexOf('｜') >= 0)) break;
  }
  out.rows = { labels: s.labels, rects: s.rects };
  log('rows =', JSON.stringify(s.labels));
  out.rowsShot = await shot('cocos_deploy_targets.png');

  // 3) 点易京那一行 → Deploy 场景
  const yi = (s.labels || []).findIndex(x => String(x).indexOf('易京') >= 0);
  out.yijingRow = yi;
  if (yi >= 0 && s.rects[yi]) {
    await click(s.rects[yi].page[0], s.rects[yi].page[1]);
    await sleep(5000);
  }

  const deploy = J(await evaluate(`(() => { try {
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    if (!canvas) return JSON.stringify({ scene: scene.name, canvas: false });
    const comp = (canvas.components || []).find(c => c && Array.isArray(c.buttons));
    if (!comp) return JSON.stringify({ scene: scene.name, comps: (canvas.components || []).map(c => c && c.constructor && c.constructor.name) });
    const str = (k) => (comp[k] && comp[k].string !== undefined ? comp[k].string : null);
    return JSON.stringify({
      scene: scene.name, loaded: comp.loaded,
      target: comp.targetCity ? comp.targetCity.NAME : null,
      garrison: comp.garrison,
      intel: comp.intel ? { name: comp.intel.name, troops: comp.intel.troops, fallback: comp.intel.fallback } : null,
      enemySoldiers: typeof comp.enemySoldiers === 'function' ? comp.enemySoldiers() : null,
      labelTarget: str('labelTarget'), labelIntel: str('labelIntel'), labelHint: str('labelHint'),
      soldiers: comp.soldiers, soldierCap: comp.soldierCap,
    });
  } catch (e) { return JSON.stringify({ err: String(e) }); } })()`));
  log('deploy =', JSON.stringify(deploy, null, 1));
  out.deploy = deploy;
  out.deployShot = await shot('cocos_deploy_gate.png');
  return out;
}
