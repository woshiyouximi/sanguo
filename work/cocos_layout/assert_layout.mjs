// 版式像素级自检（v18-cocos-layout）
//
//   node F:\sanguo\work\cocos_layout\assert_layout.mjs
//
// 前提：Edge 已在 9333 上开着 game\cocos-build\web-mobile（或 work\cocos_layout\cocos-build\web-mobile）
//       的页面；本脚本自己会做 876×1368 的 metrics override + 解除 rAF 凍結，
//       然後在同一份產物上切三個頁面取幾何、跑斷言。
//
// 斷言（驗收單第二條）：
//   ① 地圖底圖矩形不超出螢幕可視區（左右溢出 ≤ 1px）
//   ② 戰報 / 紀錄 矩形與地圖矩形不相交
//   ③ 60 個城點矩形都在地圖矩形內
//   ④ 內政頁最底部元素 bottom ≥ 1300（吃滿 1334）
//   ⑤ （追加）物品頁「加成」表 10 個標籤矩形兩兩不重疊，且每個數值矩形右邊界同列一致
//
// 端點可用環境變數覆蓋：CDP_PORT（預設 9333）、ASSERT_OUT（預設同目錄 assert_layout.json）。
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.CDP_PORT || 9333);
const OUT = process.env.ASSERT_OUT || path.join(import.meta.dirname, 'assert_layout.json');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DESIGN = { w: 750, h: 1334 };

async function jget(p, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
  return res.json();
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params }));
    });
  return { ws, send, ready };
}

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

const CAMPAIGN_DUMP = `(() => {${HELPERS}
  const comp = window.__comp();
  const canvas = window.__canvas();
  const layer = canvas.getChildByName('CampaignCityIcons');
  return {
    view: { w: cc.view.getVisibleSize().width, h: cc.view.getVisibleSize().height, k: cc.view.getScaleX() },
    map: comp.mapRect(),
    mapNode: window.__box(canvas.getChildByName('CampaignMapImage')),
    log: comp.logRect(),
    con: comp.consoleRects(),
    cityCount: comp.cities ? comp.cities.length : -1,
    icons: layer ? layer.children.filter((n) => n.name.indexOf('CityIcon_') === 0).map(window.__box) : [],
  };
})()`;

const CITY_DUMP = `(() => {${HELPERS}
  const comp = window.__comp();
  const panel = comp.cityPanel;
  const node = panel.node;
  const boxes = [];
  for (const c of node.children) { const b = window.__box(c); if (b) boxes.push(b); }
  const labels = window.__walk(node, [], 0).filter((l) => l.active && l.t.trim().length > 0);
  return {
    open: node.active,
    rects: panel.layoutRects,
    cmdRects: panel.cmdRects,
    boxes,
    labels,
    labelBottom: labels.reduce((m, l) => Math.max(m, l.y + l.h), 0),
    boxBottom: boxes.reduce((m, k) => Math.max(m, k.y + k.h), 0),
  };
})()`;

const ITEMS_DUMP = `(() => {${HELPERS}
  const node = window.__canvas().getChildByName('ItemsPanel');
  const panel = node ? node.components.find((c) => typeof c.statNameRect === 'function') : null;
  if (!panel) return { missing: true, nodes: window.__canvas().children.map((n) => n.name) };
  const nameRects = [], valRects = [];
  for (let i = 0; i < 10; i += 1) { nameRects.push(panel.statNameRect(i)); valRects.push(panel.statValRect(i)); }
  return { nameRects, valRects, active: node.active };
})()`;

function overlapArea(a, b) {
  const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

async function main() {
  const v = await jget('/json/version').catch(() => null);
  if (!v) throw new Error(`no devtools on ${PORT}（先 node work\\cocos_verify\\cdp.mjs launch）`);
  const list = await jget('/json/list');
  const page = list.find((x) => x.type === 'page' && (x.url || '').includes('cocos-build'));
  if (!page) throw new Error('no cocos-build page: ' + list.map((x) => x.type + ':' + (x.url || '').slice(0, 40)).join(' | '));

  const { ws, send, ready } = connect(page.webSocketDebuggerUrl);
  await ready;
  await send('Runtime.enable');
  await send('Page.enable');
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails));
    return r.result.value;
  };

  // 同一份量測口徑：876×1368 + 解除凍結（否則 captureScreenshot/Runtime 都拿到舊狀態）
  await send('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await send('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await send('Page.bringToFront').catch(() => {});
  await send('Emulation.setDeviceMetricsOverride', { width: 876, height: 1368, deviceScaleFactor: 1, mobile: false });
  await sleep(700);
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(500);
  const f2 = await evaluate('cc.director.getTotalFrames()');

  // ---- 大地圖 ----
  await evaluate(`(() => { const c = window.__comp(); if (c.cityPanel && c.cityPanel.node && c.cityPanel.node.active) c.cityPanel.hide(); c.refresh(); return 1; })()`);
  await sleep(800);
  const campaign = await evaluate(CAMPAIGN_DUMP);

  // ---- 內政 ----
  await evaluate(`(() => { window.__comp().openCityPanel('襄平'); return 1; })()`);
  await sleep(800);
  const city = await evaluate(CITY_DUMP);

  // ---- 物品（加成表） ----
  await evaluate(`(() => { const c = window.__comp(); if (c.cityPanel && c.cityPanel.node && c.cityPanel.node.active) c.cityPanel.hide(); c.openItems(); return 1; })()`);
  await sleep(1000);
  const items = await evaluate(ITEMS_DUMP);
  // 回到大地圖，讓交件後的畫面狀態與 campaign.png 一致
  await evaluate(`(() => { const n = window.__canvas().getChildByName('ItemsPanel'); if (n) { const c = n.components.find((x) => typeof x.hide === 'function'); if (c) c.hide(); } const cm = window.__comp(); cm.refresh(); return 1; })()`);
  await sleep(400);

  const checks = [];
  const add = (name, pass, detail) => checks.push({ name, pass, detail });

  // ① 底圖不超出可視區（左右溢出 ≤ 1px）
  const map = campaign.map;
  const ovL = Math.max(0, -map.x);
  const ovR = Math.max(0, map.x + map.w - DESIGN.w);
  add('①a 底圖左溢出 ≤ 1px', ovL <= 1, `rect.x=${map.x} → overflow=${ovL.toFixed(2)}px`);
  add('①b 底圖右溢出 ≤ 1px', ovR <= 1, `rect 右邊=${(map.x + map.w).toFixed(2)} → overflow=${ovR.toFixed(2)}px`);
  add('①c 底圖寬 = 設計寬 750', Math.abs(map.w - DESIGN.w) < 0.5, `w=${map.w}`);
  const mn = campaign.mapNode;
  add(
    '①d 底圖節點 bbox == mapRect',
    mn && Math.abs(mn.x - map.x) < 0.5 && Math.abs(mn.y - map.y) < 0.5 && Math.abs(mn.w - map.w) < 0.5 && Math.abs(mn.h - map.h) < 0.5,
    `node=${JSON.stringify(mn)} rect=${JSON.stringify(map)}`,
  );

  // ② 戰報/紀錄 不與地圖矩形相交
  const log = campaign.log;
  add('②a 戰報 ∩ 地圖 = 0', overlapArea(log, map) === 0, `戰報=${JSON.stringify(log)} 交集面積=${overlapArea(log, map)}`);
  add('②b 戰報在地圖下方', log.y >= map.y + map.h, `戰報.y=${log.y} ≥ 地圖底=${(map.y + map.h).toFixed(2)}`);
  const cityLog = city.rects.log;
  add('②c 內政紀錄 ∩ 地圖 = 0', overlapArea(cityLog, map) === 0, `紀錄=${JSON.stringify(cityLog)} 交集面積=${overlapArea(cityLog, map)}`);
  add('②d 內政紀錄在地圖下方', cityLog.y >= map.y + map.h, `紀錄.y=${cityLog.y} ≥ 地圖底=${(map.y + map.h).toFixed(2)}`);

  // ③ 60 個城點矩形都在地圖矩形內
  const icons = campaign.icons.filter(Boolean);
  const outside = icons.filter((b) => b.x < map.x - 0.01 || b.y < map.y - 0.01 || b.x + b.w > map.x + map.w + 0.01 || b.y + b.h > map.y + map.h + 0.01);
  add('③a 城點數 = 60', icons.length === 60, `icons=${icons.length} cities=${campaign.cityCount}`);
  add('③b 城點全部在地圖矩形內', outside.length === 0, `越界 ${outside.length} 個${outside.length ? '：' + JSON.stringify(outside.slice(0, 5)) : ''}`);

  // ④ 內政頁吃滿：最底部元素 bottom ≥ 1300
  const bottom = Math.max(city.labelBottom, city.boxBottom, city.rects.hint.y + city.rects.hint.h);
  add('④ 內政頁最底元素 bottom ≥ 1300', bottom >= 1300, `bottom=${bottom.toFixed(2)}（提示卡底=${city.rects.hint.y + city.rects.hint.h}，label 底=${city.labelBottom.toFixed(2)}）`);

  // ⑤ 物品頁加成表：10 個標籤不重疊、數值右邊界同列一致
  if (items && items.nameRects) {
    let worst = 0;
    for (let i = 0; i < items.nameRects.length; i += 1) {
      for (let j = i + 1; j < items.nameRects.length; j += 1) worst = Math.max(worst, overlapArea(items.nameRects[i], items.nameRects[j]));
    }
    add('⑤a 加成表 10 標籤兩兩不重疊', worst === 0, `最大交集面積=${worst}`);
    const right = (r) => +(r.x + r.w).toFixed(2);
    const c0 = items.valRects.slice(0, 5).map(right);
    const c1 = items.valRects.slice(5).map(right);
    const same = (arr) => Math.max(...arr) - Math.min(...arr) <= 1;
    add('⑤b 左欄數值右邊界一致', same(c0), `right=${JSON.stringify(c0)}`);
    add('⑤c 右欄數值右邊界一致', same(c1), `right=${JSON.stringify(c1)}`);
    const colGap = items.nameRects[5].x - (items.valRects[0].x + items.valRects[0].w);
    add('⑤d 兩欄之間有淨空', colGap >= 4, `左欄值右緣 ${right(items.valRects[0])} → 右欄標籤 x ${items.nameRects[5].x}，間距 ${colGap.toFixed(2)}px`);
  } else {
    add('⑤ 加成表可量測', false, 'ItemsPanel.statNameRect 取不到');
  }

  const failed = checks.filter((c) => !c.pass);
  const report = {
    at: new Date().toISOString(),
    port: PORT,
    page: page.url,
    frames: [f1, f2],
    view: campaign.view,
    map,
    log,
    cityLog,
    console: campaign.con,
    cityBottom: bottom,
    checks,
    failed: failed.length,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 1), 'utf8');

  const pad = Math.max(...checks.map((c) => c.name.length));
  for (const c of checks) console.log((c.pass ? 'PASS' : 'FAIL') + '  ' + c.name.padEnd(pad) + '  ' + c.detail);
  console.log(`\n${checks.length - failed.length}/${checks.length} PASS → ${OUT}`);
  ws.close();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error('assert fail:', e.message);
  process.exit(2);
});
