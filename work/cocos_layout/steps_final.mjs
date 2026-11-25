// 最終截圖 + 幾何 dump（同一份產物）：campaign.png / city.png / city_after_cmd.png / items.png
// 前提：cdp.mjs launch 已用新產物 URL 開頁；分頁必須在前景且 lifecycle=active，否則 captureScreenshot 只給凍結舊幀。
const K = 1.025487256371814;
const OX = 53.5; // 設計 x=0 對應的截圖 px
const px = (dx) => OX + dx * K;
const py = (dy) => dy * K;

const HELPERS = `
  window.__H = 1334;
  window.__box = (n) => {
    const t = n.getComponent('cc.UITransform');
    if (!t) return null;
    const b = t.getBoundingBoxToWorld();
    return { n: n.name, x: +b.x.toFixed(2), y: +(__H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  };
  window.__canvas = () => cc.director.getScene().getChildByName('Canvas');
  window.__comp = () => window.__canvas().components.find((x) => x && x.save && x.cities);
  window.__labelOf = (n) => (n && n.getComponent('cc.Label') ? n.getComponent('cc.Label').string : null);
  window.__walk = (n, acc, d) => {
    if (d > 4) return acc;
    const t = window.__labelOf(n);
    if (t) { const b = window.__box(n); if (b) acc.push({ t, x: b.x, y: b.y, w: b.w, h: b.h, active: n.active }); }
    for (const c of n.children) window.__walk(c, acc, d + 1);
    return acc;
  };
  window.__hit = (a, b) => {
    const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
    const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
    return w > 0 && h > 0 ? +(w * h).toFixed(2) : 0;
  };
`;

const CAMPAIGN = `(() => {
  ${HELPERS}
  const comp = window.__comp();
  const canvas = window.__canvas();
  const map = comp.mapRect();
  const log = comp.logRect();
  const con = comp.consoleRects();
  const layer = canvas.getChildByName('CampaignCityIcons');
  const icons = layer ? layer.children.filter((n) => n.name.indexOf('CityIcon_') === 0).map(window.__box) : [];
  const labels = window.__walk(canvas, [], 0);
  return {
    view: { w: cc.view.getVisibleSize().width, h: cc.view.getVisibleSize().height, k: cc.view.getScaleX() },
    map,
    mapNode: window.__box(canvas.getChildByName('CampaignMapImage')),
    log,
    con,
    logMapHit: window.__hit(log, map),
    cityCount: comp.cities ? comp.cities.length : -1,
    icons,
    labels,
  };
})()`;

const CITY = `(() => {
  ${HELPERS}
  const comp = window.__comp();
  const panel = comp.cityPanel;
  const node = panel.node;
  const rects = panel.layoutRects;
  const labels = window.__walk(node, [], 0);
  const boxes = [];
  for (const c of node.children) { const b = window.__box(c); if (b) boxes.push(b); }
  return {
    open: node.active,
    rects,
    cmdRects: panel.cmdRects,
    labels,
    boxes,
    bottom: boxes.reduce((m, k) => Math.max(m, k.y + k.h), 0),
    logBottom: rects ? rects.log.y + rects.log.h : null,
    hintBottom: rects ? rects.hint.y + rects.hint.h : null,
  };
})()`;

const ITEMS = `(() => {
  ${HELPERS}
  const canvas = window.__canvas();
  const panel = canvas.components.find((x) => x && x.statNameRect) || null;
  if (!panel) return { missing: true, names: canvas.components.map((c) => c.constructor.name) };
  const nameRects = [], valRects = [];
  for (let i = 0; i < 10; i += 1) { nameRects.push(panel.statNameRect(i)); valRects.push(panel.statValRect(i)); }
  return { hovered: true, nameRects, valRects, labels: window.__walk(panel.node, [], 0) };
})()`;

export default async ({ send, evaluate, shot, click, sleep, log }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(900);
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(600);
  const f2 = await evaluate('cc.director.getTotalFrames()');
  log('frames', f1, '->', f2);

  // ---------- 1. 大地圖 ----------
  await evaluate(`(() => { const c = window.__comp(); if (c.cityPanel && c.cityPanel.node && c.cityPanel.node.active) c.cityPanel.hide(); c.refresh(); return 'ok'; })()`);
  await sleep(900);
  const campaign = await evaluate(CAMPAIGN);
  const s1 = await shot('campaign.png');

  // ---------- 2. 內政（紀錄清空 → 乾淨的「改後」截圖） ----------
  await evaluate(`(() => { const c = window.__comp(); if (c.save) c.save.log = []; c.openCityPanel('襄平'); return 'ok'; })()`);
  await sleep(900);
  const city = await evaluate(CITY);
  const s2 = await shot('city.png');

  // ---------- 3. 點「開發」→ 紀錄有內容 ----------
  const r0 = city && city.cmdRects ? city.cmdRects[0] : null;
  if (r0) await click(px(r0.x + r0.w / 2), py(r0.y + r0.h / 2));
  await sleep(1000);
  const city2 = await evaluate(CITY);
  const s3 = await shot('city_after_cmd.png');

  // ---------- 4. 物品（加成表） ----------
  await evaluate(`(() => { const c = window.__comp(); if (c.cityPanel && c.cityPanel.node && c.cityPanel.node.active) c.cityPanel.hide(); return 'ok'; })()`);
  await sleep(400);
  await evaluate(`(() => { window.__comp().openItems(); return 'ok'; })()`);
  await sleep(1200);
  let items = await evaluate(ITEMS);
  // 若加成表還沒有值（未選武器），點列表第一列
  const hasVal = items && items.labels && items.labels.some((l) => l.t === '武力');
  if (!hasVal) {
    await click(px(230), py(470));
    await sleep(900);
    items = await evaluate(ITEMS);
  }
  const s4 = await shot('items.png');

  return {
    frames: [f1, f2],
    campaign,
    city,
    city2,
    items: items && items.nameRects ? { nameRects: items.nameRects, valRects: items.valRects, labelCount: items.labels.length, labels: items.labels.slice(0, 80) } : items,
    shots: [s1, s2, s3, s4],
    clicked: r0 ? { x: px(r0.x + r0.w / 2), y: py(r0.y + r0.h / 2) } : null,
  };
};
