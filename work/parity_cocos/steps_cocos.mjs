// Cocos 侧取证：大地图 / 内政 / 物品 / 编成 / 战斗 各一屏 + 节点普查
const CENSUS = `(() => {
  const sc = cc.director.getScene();
  const comps = {};
  const fonts = {};
  let nodes = 0, labels = 0, labelsNonEmpty = 0, sprites = 0, graphics = 0, masks = 0, scrolls = 0, outlines = 0, tweens = 0;
  const sample = [];
  const walk = (n) => {
    nodes++;
    (n._components || []).forEach((c) => {
      if (!c) return;
      const k = c.__classname__ || (c.constructor && c.constructor.name) || '?';
      comps[k] = (comps[k] || 0) + 1;
      if (k === 'cc.Label' || k === 'Label') {
        labels++;
        const s = typeof c.string === 'string' ? c.string : '';
        if (s.trim()) {
          labelsNonEmpty++;
          const f = String(c.fontSize);
          fonts[f] = (fonts[f] || 0) + 1;
          if (sample.length < 400) sample.push([s, c.fontSize, n.name]);
        }
      }
      if (k === 'cc.Sprite' || k === 'Sprite') sprites++;
      if (k === 'cc.Graphics' || k === 'Graphics') graphics++;
      if (k === 'cc.Mask' || k === 'Mask') masks++;
      if ((k === 'cc.ScrollView' || k === 'ScrollView')) scrolls++;
      if ((k === 'cc.LabelOutline' || k === 'LabelOutline')) outlines++;
    });
    n.children.forEach(walk);
  };
  walk(sc);
  const vs = cc.view.getVisibleSize();
  const dr = cc.view.getDesignResolutionSize();
  return JSON.stringify({
    scene: sc.name, nodes, labels, labelsNonEmpty, sprites, graphics, masks, scrolls, outlines,
    fonts, comps, visible: [vs.width, vs.height], design: [dr.width, dr.height],
    frame: [cc.view.getFrameSize().width, cc.view.getFrameSize().height],
    sample,
  });
})()`;

export default async function ({ s, evaluate, sleep, shot, log }) {
  const out = {};
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);

  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const grab = async (tag) => {
    const c = await ev(CENSUS);
    c.shot = await shot('cocos_' + tag + '.png');
    out[tag] = c;
    log('### ' + tag + ' scene=' + c.scene + ' nodes=' + c.nodes + ' labels=' + c.labels + '/' + c.labelsNonEmpty + ' sprites=' + c.sprites + ' graphics=' + c.graphics + ' masks=' + c.masks + ' scrolls=' + c.scrolls + ' fonts=' + JSON.stringify(c.fonts) + ' visible=' + JSON.stringify(c.visible) + ' design=' + JSON.stringify(c.design));
    return c;
  };

  // 大地图
  let scene = (await ev(`JSON.stringify({ s: cc.director.getScene() ? cc.director.getScene().name : null })`)).s;
  if (scene !== 'Campaign') {
    await evaluate(`cc.director.loadScene('Campaign')`);
    await sleep(3500);
  }
  await sleep(1200);
  await grab('campaign');

  // 内政（襄平）
  const city = await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    if (!comp) return JSON.stringify({ err: 'no CampaignRoot' });
    try { comp.cityPanel && comp.cityPanel.close && comp.cityPanel.close(); } catch (e) {}
    try { comp.openCityPanel('襄平'); } catch (e) { return JSON.stringify({ err: String(e && e.message || e) }); }
    return JSON.stringify({ ok: true, owned: comp.owned || null });
  })()`);
  log('city open: ' + JSON.stringify(city));
  await sleep(1800);
  await grab('city');

  // 物品
  await ev(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const comp = c.components.find((x) => x && x.save && x.cities); try { comp.cityPanel && comp.cityPanel.close(); } catch (e) {} try { comp.openItems(); } catch (e) { return JSON.stringify({ err: String(e) }); } return JSON.stringify({ ok: 1 }); })()`);
  await sleep(1800);
  await grab('items');

  // 编成（直接 loadScene Deploy，让它走兜底）
  await evaluate(`cc.director.loadScene('Deploy')`);
  await sleep(3500);
  await grab('deploy');
  out.deployOk = await ev(`JSON.stringify({ scene: cc.director.getScene().name })`);

  // 战斗（无 launch 状态，看它抖出什么）
  await evaluate(`cc.director.loadScene('Battle')`);
  await sleep(3500);
  await grab('battle');

  // 回到大地图
  await evaluate(`cc.director.loadScene('Campaign')`);
  await sleep(2500);
  return out;
}
