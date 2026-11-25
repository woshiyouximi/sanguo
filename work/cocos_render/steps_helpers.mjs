// w5-render：給 work\cocos_layout\assert_layout.mjs 預置它假設已存在的 window 輔助函數。
// （assert_layout.mjs 的 main() 一開頭就呼叫 window.__comp()，但那組 helper 只內聯在
//  CAMPAIGN_DUMP/CITY_DUMP/ITEMS_DUMP 字串裡，沒有先 evaluate 過 —— 所以要先跑本檔。）
// 內容逐字照抄 assert_layout.mjs:56-71 的 HELPERS，不要改口徑。
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
  true
`;

export default async function run({ s, evaluate, sleep, log }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Page.setWebLifecycleState', { state: 'active' });
  await s('Page.bringToFront');
  for (let i = 0; i < 60; i += 1) {
    const frames = await evaluate('(function(){try{return cc.director.getTotalFrames()}catch(e){return 0}})()');
    if (frames > 12) break;
    await sleep(500);
  }
  await evaluate(HELPERS);
  // Boot 場景會自己跳 Campaign；等它落地（最多 40s），落不下來就手動 loadScene
  for (let i = 0; i < 40; i += 1) {
    const name = await evaluate('(function(){try{var s=cc.director.getScene();return s?s.name:"none"}catch(e){return "none"}})()');
    if (name && name !== 'Boot' && name !== 'none') break;
    await sleep(500);
  }
  const sceneNow = await evaluate('(function(){try{return cc.director.getScene().name}catch(e){return "none"}})()');
  if (sceneNow === 'Boot') {
    await evaluate('(function(){cc.director.loadScene("Campaign");return 1})()');
    await sleep(3000);
  }
  // 回到大地圖，讓 assert_layout 從乾淨狀態開始（它自己會 refresh()）
  await evaluate(`(function(){
    const c = window.__comp();
    if (c && c.cityPanel && c.cityPanel.node && c.cityPanel.node.active) c.cityPanel.hide();
    if (c && c.itemsPanel && c.itemsPanel.hide) c.itemsPanel.hide();
    if (c && c.refresh) c.refresh();
    return window.__comp() ? 'helpers ok' : 'no comp';
  })()`);
  const probe = await evaluate('(function(){return typeof window.__comp + "/" + typeof window.__box + "/" + cc.director.getScene().name})()');
  log('HELPERS ' + probe);
  return probe;
}
