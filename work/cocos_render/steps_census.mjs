// w5-render 取證：四頁「皮膚 / 描邊 / 字級」節點普查（只讀，不改狀態）
// 口徑說明（Cocos 3.8.8）：
//  - 描邊：Label.enableOutline / enableShadow 由 Label 自身裝配，**不產生 LabelOutline 組件**，
//    所以只能數 enableOutline，數 getComponent(cc.LabelOutline) 恆 0。
//  - 九宮：Sprite.type === cc.Sprite.Type.SLICED（= 1）才是九宮；TILED/SIMPLE 不算。
//  - 皮膚節點：本專案的皮膚層叫 `CityPanelSkin`/`CampaignSkin`/`ItemsSkin`…，
//    makeNineSlice 建的節點叫 `Skin_<key>`，makeBtn/makePanel 叫 `Btn_*`/`Panel_*`，
//    四種前綴一起數，避免只數一種得出 0。
export default async function run({ s, evaluate, shot, sleep, log }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true });
  await s('Page.setWebLifecycleState', { state: 'active' });
  await s('Page.bringToFront');
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  for (let i = 0; i < 60; i += 1) {
    const frames = await evaluate('(function(){try{return cc.director.getTotalFrames()}catch(e){return 0}})()');
    if (frames > 12) break;
    await sleep(500);
  }

  const install = `
window.__cn = function (c) { return (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?'; };
window.__walk = function (node, cb) { cb(node); const kids = node.children; for (let i = 0; i < kids.length; i += 1) window.__walk(kids[i], cb); };
window.__census = function (rootName) {
  const scene = cc.director.getScene();
  const root = rootName ? (scene.getChildByName(rootName) || scene) : scene;
  const out = { root: root.name, nodes: 0, labels: 0, labelsNonEmpty: 0, outline: 0, shadow: 0, sliced: 0, simple: 0,
    skinNodes: 0, btnNodes: 0, panelNodes: 0, gfx: 0, masks: 0, scrolls: 0, fonts: {}, skinNames: [] };
  window.__walk(root, function (n) {
    out.nodes += 1;
    if (/^(Skin_|.*Skin$)/.test(n.name)) { out.skinNodes += 1; if (out.skinNames.length < 6) out.skinNames.push(n.name); }
    if (/^Btn_/.test(n.name)) out.btnNodes += 1;
    if (/^Panel_/.test(n.name)) out.panelNodes += 1;
    const comps = n._components || [];
    for (let i = 0; i < comps.length; i += 1) {
      const c = comps[i];
      const name = window.__cn(c);
      if (name === 'cc.Label') {
        out.labels += 1;
        if (c.string && String(c.string).length > 0) out.labelsNonEmpty += 1;
        if (c.enableOutline) out.outline += 1;
        if (c.enableShadow) out.shadow += 1;
        const key = String(c.fontSize);
        out.fonts[key] = (out.fonts[key] || 0) + 1;
      } else if (name === 'cc.Sprite') {
        if (c.type === cc.Sprite.Type.SLICED) out.sliced += 1; else out.simple += 1;
      } else if (name === 'cc.Graphics') out.gfx += 1;
      else if (name === 'cc.Mask') out.masks += 1;
      else if (name === 'cc.ScrollView') out.scrolls += 1;
    }
  });
  return out;
};
window.__city = function () {
  const scene = cc.director.getScene();
  let found = null;
  window.__walk(scene, function (n) { if (found) return; const cs = n._components || []; for (let i = 0; i < cs.length; i += 1) if (window.__cn(cs[i]) === 'CityPanel') found = cs[i]; });
  return found;
};
window.__canvasComp = function () {
  const scene = cc.director.getScene();
  if (!scene) return null;
  let found = null;
  window.__walk(scene, function (n) { if (found) return; const cs = n._components || []; for (let i = 0; i < cs.length; i += 1) { const nm = window.__cn(cs[i]); if (nm === 'CampaignRoot' || nm === 'Canvas') found = cs[i]; } });
  return found;
};
true
`;
  await evaluate(install);

  const out = {};
  // 大地圖
  await evaluate('(function(){cc.director.loadScene("Campaign");return 1})()');
  await sleep(2500);
  // 進 Campaign 後先取一次
  out.campaign = await evaluate('(function(){ var c = window.__canvasComp(); return window.__census(c && c.node ? c.node.name : null); })()');

  // 內政
  out.city = await evaluate(`(function(){
    var comp = window.__canvasComp();
    if (!comp) return { error: 'no campaign comp' };
    comp.openCityPanel(comp.cities[0].name);
    var p = window.__city();
    if (p && p.save) p.save.searchLog = [];
    if (p && p.refresh) p.refresh();
    return window.__census(null);
  })()`);
  await sleep(600);
  await shot('after_city');

  // 物品
  out.items = await evaluate(`(function(){
    var p = window.__city();
    if (p && p.hide) p.hide();
    var comp = window.__canvasComp();
    comp.openItems();
    return window.__census(null);
  })()`);
  await sleep(600);
  await shot('after_items');

  // 編成
  out.deploy = await evaluate(`(function(){
    cc.director.loadScene('Deploy');
    return 1;
  })()`);
  await sleep(2500);
  out.deploy = await evaluate('(function(){ return window.__census(null); })()');
  await sleep(400);
  await shot('after_deploy');

  log('CENSUS ' + JSON.stringify(out));
  return out;
};
