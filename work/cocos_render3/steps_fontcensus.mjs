// 同屏字号普查（w9-render3 目标3）：只数**真的在屏上**的 Label ——
// `activeInHierarchy` 为假的（未打开的面板、收起的区块）不算。
//
// 用法（cd work\cocos_verify）：
//   $env:PORT=9401; ...; $env:PHASE=b3f; node cdp.mjs run F:\sanguo\work\cocos_render3\steps_fontcensus.mjs
const PREFIX = process.env.PHASE || 'b3f';

const CENSUS = `(() => {
  const sc = cc.director.getScene();
  if (!sc) return JSON.stringify({ err: 'no scene' });
  const fonts = {};
  let onScreen = 0;
  const walk = (n) => {
    if (!n.activeInHierarchy) return;
    (n._components || []).forEach((c) => {
      if (!c) return;
      const k = c.__classname__ || (c.constructor && c.constructor.name) || '?';
      if (k !== 'cc.Label' && k !== 'Label') return;
      const s = typeof c.string === 'string' ? c.string.trim() : '';
      if (!s) return;
      onScreen++;
      const f = String(c.fontSize);
      fonts[f] = (fonts[f] || 0) + 1;
    });
    n.children.forEach(walk);
  };
  walk(sc);
  return JSON.stringify({ scene: sc.name, onScreen, sizes: Object.keys(fonts).length, fonts });
})()`;

export default async function ({ s, evaluate, sleep, shot, log }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.setWebLifecycleState', { state: 'active' }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1000);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  const goCampaign = async () => {
    if ((await evaluate(`cc.director.getScene() && cc.director.getScene().name`)) !== 'Campaign') {
      await evaluate(`cc.director.loadScene('Campaign'); 'go'`);
      for (let i = 0; i < 40; i += 1) {
        await sleep(400);
        if ((await evaluate(`cc.director.getScene() && cc.director.getScene().name`)) === 'Campaign') break;
      }
      await sleep(2200);
    }
  };

  await goCampaign();
  out.campaign = await ev(CENSUS);
  log('#fonts campaign ' + JSON.stringify(out.campaign));

  // 内政：打开第一座城
  await ev(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    comp.openCityPanel(comp.cities[0].name);
    return JSON.stringify({ ok: 1 });
  })()`);
  await sleep(1200);
  out.city = await ev(CENSUS);
  log('#fonts city ' + JSON.stringify(out.city));

  // 物品
  await evaluate(`(() => {
    const c = cc.director.getScene().getChildByName('Canvas');
    const comp = c.components.find((x) => x && x.save && x.cities);
    if (comp.cityPanel && comp.cityPanel.node.active) comp.cityPanel.hide();
    comp.openItems();
    return 1;
  })()`);
  await sleep(1500);
  out.items = await ev(CENSUS);
  log('#fonts items ' + JSON.stringify(out.items));

  // 編成
  await evaluate(`cc.director.loadScene('Deploy'); 'go'`);
  for (let i = 0; i < 40; i += 1) {
    await sleep(400);
    if ((await evaluate(`cc.director.getScene() && cc.director.getScene().name`)) === 'Deploy') break;
  }
  await sleep(2500);
  out.deploy = await ev(CENSUS);
  log('#fonts deploy ' + JSON.stringify(out.deploy));
  return out;
}
