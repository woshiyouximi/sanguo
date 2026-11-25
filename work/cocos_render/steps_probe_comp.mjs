// 探针：描边/阴影/皮肤/渐变 组件级实况
export default async function ({ evaluate, sleep, log, s }) {
  await s('Emulation.setFocusEmulationEnabled', { enabled: true }).catch(() => {});
  await s('Page.bringToFront').catch(() => {});
  await s('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  await sleep(1200);
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const r = await ev(`(() => {
    const out = {};
    out.hasLabelOutlineClass = typeof cc.LabelOutline;
    out.hasLabelShadowClass = typeof cc.LabelShadow;
    const sc = cc.director.getScene();
    if (!sc) return JSON.stringify({ err: 'no scene' });
    const canvas = sc.getChildByName('Canvas');
    const comp = canvas.components.find((x) => x && x.save && x.cities);
    if (comp && comp.cityPanel && comp.cityPanel.open) {
      const names = (comp.cities || []).map((k) => k.NAME || k.name);
      comp.openCityPanel(names[0]);
    }
    const comps = {};
    let labels = 0, withOutline = 0, withShadow = 0, sliced = 0, simple = 0, tiled = 0;
    const samples = [];
    const walk = (n) => {
      (n._components || []).forEach((c) => {
        if (!c) return;
        const k = c.__classname__ || (c.constructor && c.constructor.name) || '?';
        comps[k] = (comps[k] || 0) + 1;
        if (k === 'cc.Label') {
          labels++;
          if (c.enableOutline) withOutline++;
          if (c.enableShadow) withShadow++;
          if (samples.length < 6) samples.push({ s: String(c.string).slice(0, 6), eo: c.enableOutline, ow: c.outlineWidth, es: c.enableShadow });
        }
        if (k === 'cc.Sprite') {
          const t = c.type;
          if (t === cc.Sprite.Type.SLICED) sliced++;
          else if (t === cc.Sprite.Type.TILED) tiled++;
          else simple++;
        }
      });
      n.children.forEach(walk);
    };
    walk(sc);
    out.comps = comps;
    out.labels = labels; out.withOutline = withOutline; out.withShadow = withShadow;
    out.sliced = sliced; out.tiled = tiled; out.simple = simple;
    out.samples = samples;
    return JSON.stringify(out);
  })()`);
  log(JSON.stringify(r, null, 1));
  return r;
}
