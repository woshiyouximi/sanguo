// 渲染对齐取证书：大地图 / 内政 / 内政(点命令后) / 物品 / 编成 五张 + 组件普查
// 用法：cd work\cocos_verify
//   $env:PORT=9401; $env:PROFILE=F:\sanguo\work\cocos_render\.edgeprof
//   $env:OUTDIR=F:\sanguo\work\cocos_render; $env:PHASE=before
//   $env:PAGE_URL=http://127.0.0.1:5188/cocos_render/cocos-build/web-mobile/index.html
//   node cdp.mjs launch; node cdp.mjs run F:\sanguo\work\cocos_render\steps_pages.mjs
const PREFIX = process.env.PHASE || 'before';

const CENSUS = `(() => {
  const sc = cc.director.getScene();
  if (!sc) return JSON.stringify({ err: 'no scene' });
  const comps = {};
  const fonts = {};
  const names = {};
  let nodes = 0, labels = 0, labelsNonEmpty = 0, sprites = 0, graphics = 0, masks = 0, scrolls = 0, outlines = 0;
  const walk = (n) => {
    nodes++;
    const nm = n.name || '';
    if (/^Skin_/.test(nm)) names.skin = (names.skin || 0) + 1;
    if (/^Panel_/.test(nm)) names.panel = (names.panel || 0) + 1;
    if (/^Btn_/.test(nm)) names.btn = (names.btn || 0) + 1;
    (n._components || []).forEach((c) => {
      if (!c) return;
      const k = c.__classname__ || (c.constructor && c.constructor.name) || '?';
      comps[k] = (comps[k] || 0) + 1;
      if (k === 'cc.Label' || k === 'Label') {
        labels++;
        const s = typeof c.string === 'string' ? c.string : '';
        let outlined = false;
        try { outlined = !!(c.node.getComponent(cc.LabelOutline)); } catch (e) {}
        if (outlined) outlines++;
        if (s.trim()) {
          labelsNonEmpty++;
          const f = String(c.fontSize);
          fonts[f] = (fonts[f] || 0) + 1;
        }
      }
      if (k === 'cc.Sprite' || k === 'Sprite') sprites++;
      if (k === 'cc.Graphics' || k === 'Graphics') graphics++;
      if (k === 'cc.Mask' || k === 'Mask') masks++;
      if (k === 'cc.ScrollView' || k === 'ScrollView') scrolls++;
    });
    n.children.forEach(walk);
  };
  walk(sc);
  return JSON.stringify({
    scene: sc.name, nodes, labels, labelsNonEmpty, sprites, graphics, masks, scrolls, outlines,
    skins: names.skin || 0, panels: names.panel || 0, btns: names.btn || 0,
    fonts, comps,
    visible: [cc.view.getVisibleSize().width, cc.view.getVisibleSize().height],
    design: [cc.view.getDesignResolutionSize().width, cc.view.getDesignResolutionSize().height],
    frame: [cc.view.getFrameSize().width, cc.view.getFrameSize().height],
  });
})()`;

export default async function ({ s, evaluate, sleep, shot, log, click }) {
  const out = {};
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1500);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const grab = async (tag) => {
    const c = await ev(CENSUS);
    c.shot = await shot(PREFIX + '_' + tag + '.png');
    out[tag] = c;
    log('### ' + tag + ' scene=' + c.scene + ' nodes=' + c.nodes + ' labels=' + c.labels + '/' + c.labelsNonEmpty +
      ' outline=' + c.outlines + ' skin=' + c.skins + ' panel=' + c.panels + ' btn=' + c.btns +
      ' sprite=' + c.sprites + ' gfx=' + c.graphics + ' scroll=' + c.scrolls +
      ' fonts=' + JSON.stringify(c.fonts) + ' visible=' + JSON.stringify(c.visible));
    return c;
  };
  // 面板内 Label 文本（验「有没有内容」）
  const panelText = async (compName) => ev(`(() => {
    const sc = cc.director.getScene();
    const canvas = sc.getChildByName('Canvas');
    let node = null;
    const w = (n) => { if (node) return; if ((n.components || []).some((c) => (c.__classname__ || '') === ${JSON.stringify(compName)})) { node = n; return; } n.children.forEach(w); };
    w(canvas);
    if (!node) return JSON.stringify({ err: 'no ' + ${JSON.stringify(compName)} });
    const ts = [];
    const w2 = (n) => { const L = n.getComponent(cc.Label); if (L && String(L.string).trim()) ts.push(String(L.string)); n.children.forEach(w2); };
    w2(node);
    return JSON.stringify({ n: ts.length, texts: ts.slice(0, 90) });
  })()`);

  const scene = (await ev(`JSON.stringify({ s: cc.director.getScene() ? cc.director.getScene().name : null })`)).s;
  if (scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
    for (let i = 0; i < 40; i += 1) {
      await sleep(700);
      const sn = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
      if (sn === 'Campaign') break;
    }
    await sleep(2500);
  }
  const f1 = await evaluate('cc.director.getTotalFrames()');
  await sleep(600);
  const f2 = await evaluate('cc.director.getTotalFrames()');
  log('frames', f1, '->', f2);

  // ---- 1. 大地图 ----
  await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); if (comp && comp.cityPanel && comp.cityPanel.hide) comp.cityPanel.hide(); if (comp && comp.refresh) comp.refresh(); return JSON.stringify({ ok: 1 }); })()`);
  await sleep(1200);
  await grab('campaign');

  // ---- 2. 内政（清空 searchLog 以量空白带）----
  const root = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    if (!comp) return JSON.stringify({ err: 'no CampaignRoot' });
    const names = (comp.cities || []).map((k) => k.NAME || k.name);
    return JSON.stringify({ hasData: !!comp.data, cityCount: names.length, names: names.slice(0, 8), gold: comp.save && comp.save.gold, month: comp.save && comp.save.month });
  })()`);
  log('root: ' + JSON.stringify(root));
  const target = (root.names && root.names[0]) || '襄平';
  await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    comp.openCityPanel(${JSON.stringify(target)});
    return JSON.stringify({ ok: 1 });
  })()`);
  await sleep(2000);
  const cityPanel = await panelText('CityPanel');
  out.cityText = cityPanel.n;
  log('city texts: ' + cityPanel.n);
  const cleared = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'CityPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    if (!p) return JSON.stringify({ err: 'no CityPanel' });
    if (p.save) { p.save.searchLog = []; if (p.save.extras) p.save.extras.log = []; }
    if (p.refresh) p.refresh();
    return JSON.stringify({ ok: 1, name: p.cityName, logs: p.save && Array.isArray(p.save.searchLog) ? p.save.searchLog.length : -1 });
  })()`);
  log('clear log: ' + JSON.stringify(cleared));
  await sleep(900);
  await grab('city');

  // ---- 3. 内政 + 点第一个命令（有内容态）----
  const cmdRects = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'CityPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    if (!p) return JSON.stringify({ err: 'no CityPanel' });
    return JSON.stringify({ rects: p.cmdRects || [] });
  })()`);
  out.cmdRects = cmdRects;
  if (cmdRects && cmdRects.rects && cmdRects.rects.length) {
    const r = cmdRects.rects[0];
    await click(r.x + r.w / 2, r.y + r.h / 2);
    await sleep(1500);
    await grab('city_after_cmd');
  }

  // ---- 4. 物品 ----
  await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    let p = null;
    const w = (n) => { if (p) return; const k = (n.components || []).find((x) => (x.__classname__ || '') === 'CityPanel'); if (k) { p = k; return; } n.children.forEach(w); };
    w(c);
    if (p && p.hide) p.hide();
    try { comp.openItems(); } catch (e) { return JSON.stringify({ err: String(e) }); }
    return JSON.stringify({ ok: 1 });
  })()`);
  await sleep(2200);
  const itemsText = await panelText('ItemsPanel');
  out.itemsText = itemsText.n;
  log('items texts: ' + itemsText.n);
  await grab('items');

  // ---- 5. 编成 ----
  await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const n = c.getChildByName('ItemsPanel');
    if (n) { const p = n.components.find((x) => typeof x.hide === 'function'); if (p) p.hide(); }
    cc.director.loadScene('Deploy');
    return 'go';
  })()`);
  for (let i = 0; i < 40; i += 1) {
    await sleep(700);
    const sn = await evaluate(`(cc.director.getScene() && cc.director.getScene().name) || ''`);
    if (sn === 'Deploy') break;
  }
  await sleep(2500);
  const deployText = await panelText('DeployRoot');
  out.deployText = deployText.n;
  log('deploy texts: ' + deployText.n);
  await grab('deploy');

  return out;
}
