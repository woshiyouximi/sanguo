// 四步截圖 + 幾何 dump（同一份產物）：campaign.png / city.png / city_after_cmd.png / items.png
// 用法：cd work\cocos_verify && $env:PORT=9333; $env:OUTDIR=F:\sanguo\work\cocos_layout
//       node cdp.mjs run F:\sanguo\work\cocos_layout\steps_shot_all.mjs
// 前置：cdp.mjs launch 已用新產物的 PAGE_URL 開好頁；本檔會把分頁推前景 + 解除 rAF 凍結。
const H = 1334;
const K = 1.025487256371814; // cc.view scaleX @ 876×1368 模擬視口
const OX = 52.1687; // 可視設計區左邊界（負設計座標）
const px = (dx) => 53.5 + dx * K; // 設計 x → 截圖 px
const py = (dy) => dy * K;

const HELPERS = `
  window.__H = ${H};
  window.__box = (n) => {
    const t = n.getComponent('cc.UITransform');
    if (!t) return null;
    const b = t.getBoundingBoxToWorld();
    return { n: n.name, x: +b.x.toFixed(2), y: +(__H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) };
  };
  window.__comp = () => {
    const c = cc.director.getScene().getChildByName('Canvas');
    return c.components.find((x) => x && x.save && x.cities);
  };
  window.__canvas = () => cc.director.getScene().getChildByName('Canvas');
`;

const CAMPAIGN_DUMP = `(() => {
  ${HELPERS}
  const canvas = __canvas();
  const comp = __comp();
  const map = comp.mapImageRect();
  const layer = canvas.getChildByName('CampaignCityIcons');
  const labelOf = (n) => (n && n.getComponent('cc.Label') ? n.getComponent('cc.Label').string : null);
  const byText = (t) => canvas.children.find((n) => labelOf(n) === t);
  return {
    view: { w: cc.view.getVisibleSize().width, h: cc.view.getVisibleSize().height, k: cc.view.getScaleX() },
    mapImageRect: map,
    mapNode: __box(canvas.getChildByName('CampaignMapImage')),
    logRect: comp.logRect ? comp.logRect() : null,
    consoleRects: comp.consoleRects ? comp.consoleRects() : null,
    cityCount: comp.cities ? comp.cities.length : -1,
    icons: layer ? layer.children.filter((n) => n.name.indexOf('CityIcon_') === 0).map(__box) : [],
    logTitle: __box(byText('戰 報 · 尚無戰事 ▾') || byText('戰 報')),
    legend: ['我方', '勢力', '無主'].map((t) => __box(byText(t))).filter(Boolean),
  };
})()`;

const CITY_DUMP = `(() => {
  ${HELPERS}
  const comp = __comp();
  const panel = comp.cityPanel;
  const node = panel.node;
  const kids = [];
  for (const c of node.children) {
    const b = __box(c);
    if (!b) continue;
    kids.push(b);
    for (const g of c.children) { const d = __box(g); if (d) kids.push(d); }
  }
  const labelOf = (n) => (n.getComponent('cc.Label') ? n.getComponent('cc.Label').string : null);
  return {
    open: panel.isOpen ? panel.isOpen() : null,
    layoutRects: panel.layoutRects || null,
    cmdRects: panel.cmdRects,
    logRows: panel.save && Array.isArray(panel.save.searchLog) ? panel.save.searchLog.length : -1,
    bottom: kids.reduce((m, k) => Math.max(m, k.y + k.h), 0),
    texts: (function walk(n, acc, d) { if (d > 3) return acc; const t = labelOf(n); if (t) acc.push({ t, ...__box(n) }); for (const c of n.children) walk(c, acc, d + 1); return acc; })(node, [], 0),
  };
})()`;

export default async ({ send, evaluate, shot, click, sleep, log }) => {
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(800);
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(600);
  const f2 = await evaluate('cc.director.getTotalFrames()');
  log('frames', f1, '->', f2);

  // ---------- 1. 大地圖 ----------
  await evaluate(`(() => { const c = __comp(); if (c.cityPanel && c.cityPanel.hide) c.cityPanel.hide(); c.refresh(); return 'ok'; })()`);
  await sleep(1000);
  const camp = await evaluate(CAMPAIGN_DUMP);
  const s1 = await shot('campaign.png');
  log('campaign.png', JSON.stringify(s1));

  // ---------- 1b. 推進一月（讓內政月令重置成「可下」） ----------
  const acts = await evaluate(`(() => { const c = __comp(); return (c.actionRects || []).map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h, kind: r.kind })); })()`);
  let advanced = null;
  if (Array.isArray(acts) && acts.length) {
    const r = acts[acts.length - 1];
    const cx = px(r.x + r.w / 2);
    const cy = py(r.y + r.h / 2);
    advanced = { kind: r.kind, cx: +cx.toFixed(1), cy: +cy.toFixed(1) };
    await click(cx, cy);
    await sleep(1400);
  }

  // ---------- 2. 內政（襄平）：先清紀錄 → 空狀態截圖 ----------
  await evaluate(`(() => { __comp().openCityPanel('襄平'); return 'ok'; })()`);
  await sleep(1200);
  const cleared = await evaluate(`(() => {
    const p = __comp().cityPanel;
    if (!p || !p.save) return 'no-save';
    p.save.searchLog = [];
    if (typeof p.refresh === 'function') p.refresh();
    return 'len=' + (Array.isArray(p.save.searchLog) ? p.save.searchLog.length : 'n/a');
  })()`);
  await sleep(700);
  const city = await evaluate(CITY_DUMP);
  const s2 = await shot('city.png');
  log('city.png', JSON.stringify(s2), 'clear:', cleared, 'rows:', city.logRows);

  // ---------- 3. 點一條命令 → 紀錄有內容 ----------
  const rect = city && city.cmdRects && city.cmdRects[0];
  let clicked = null;
  if (rect) {
    const cx = px(rect.x + rect.w / 2);
    const cy = py(rect.y + rect.h / 2);
    clicked = { rect, cx: +cx.toFixed(1), cy: +cy.toFixed(1) };
    await click(cx, cy);
  }
  await sleep(1200);
  const city2 = await evaluate(CITY_DUMP);
  const s3 = await shot('city_after_cmd.png');
  log('city_after_cmd.png', JSON.stringify(s3), 'rows:', city2.logRows);

  // ---------- 4. 物品（加成表兩列） ----------
  await evaluate(`(() => { const c = __comp(); if (c.cityPanel && c.cityPanel.hide) c.cityPanel.hide(); c.openItems(); return 'ok'; })()`);
  await sleep(1600);
  const items = await evaluate(`(() => {
    const node = __canvas().getChildByName('ItemsPanel');
    const p = node ? node.components.find((c) => typeof c.statNameRect === 'function') : null;
    if (!p) return { missing: true };
    const names = [], vals = [];
    for (let i = 0; i < 10; i += 1) { names.push(p.statNameRect(i)); vals.push(p.statValRect(i)); }
    return { active: node.active, names, vals };
  })()`);
  const s4 = await shot('items.png');
  log('items.png', JSON.stringify(s4));

  // ---------- 5. 回到大地圖 ----------
  await evaluate(`(() => {
    const n = __canvas().getChildByName('ItemsPanel');
    if (n) { const c = n.components.find((x) => typeof x.hide === 'function'); if (c) c.hide(); }
    const cm = __comp(); cm.refresh(); return 'ok';
  })()`);

  return { frames: [f1, f2], campaign: camp, advanced, cleared, city, clicked, city2, items, shots: [s1, s2, s3, s4], ox: OX };
};
