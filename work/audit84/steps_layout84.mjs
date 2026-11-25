// R84：Cocos 大地图版式实测（紧凑输出）+ 截图
export default async function (ctx) {
  const { evaluate, shot, sleep, log } = ctx;
  const J = (s) => JSON.parse(s);

  const out = J(await evaluate(`JSON.stringify((() => {
    const ui = (n) => { try { return n.getComponent('cc.UITransform'); } catch (e) { return null; } };
    const scene = cc.director.getScene();
    const canvas = scene.getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities);
    const vis = cc.view.getVisibleSize();
    const fr = cc.view.getFrameSize();
    const node = (nm) => {
      const st = [];
      const walk = (n, d) => { if (d > 3) return; if (n.name === nm) st.push(n); for (const c of n.children) walk(c, d + 1); };
      walk(canvas, 0);
      if (!st.length) return null;
      const n = st[0];
      const t = ui(n);
      const sp = n.getComponent('cc.Sprite');
      const frame = sp && sp.spriteFrame;
      return { name: n.name, active: n.activeInHierarchy,
        w: t ? Math.round(t.width) : null, h: t ? Math.round(t.height) : null,
        x: Math.round(n.position.x), y: Math.round(n.position.y),
        spriteOn: !!(sp && sp.enabled),
        frameSize: frame ? [Math.round(frame.originalSize.width), Math.round(frame.originalSize.height)] : null };
    };
    const r = {
      vis: [Math.round(vis.width), Math.round(vis.height)],
      frame: [Math.round(fr.width), Math.round(fr.height)],
      scale: [+cc.view.getScaleX().toFixed(4), +cc.view.getScaleY().toFixed(4)],
      canvas: (() => { const t = ui(canvas); return t ? [Math.round(t.width), Math.round(t.height)] : null; })(),
      artBg: node('CampaignBg'), artMap: node('CampaignMapImage'), mapGfx: node('CampaignMap'),
      selected: comp ? comp.selected : null, owned: comp && comp.save ? comp.save.owned : null,
      cities: comp && comp.cityScreen ? comp.cityScreen.size : null,
    };
    const cs = comp && comp.cityScreen ? Array.from(comp.cityScreen.entries()) : [];
    r.cityY = cs.map(([k, v]) => Math.round(v.y));
    r.cityYRange = r.cityY.length ? [Math.min(...r.cityY), Math.max(...r.cityY)] : null;
    r.cityXRange = cs.length ? [Math.min(...cs.map(([k, v]) => Math.round(v.x))), Math.max(...cs.map(([k, v]) => Math.round(v.x)))] : null;
    return r;
  })())`));

  const shot1 = await shot('r84_campaign_layout.png');
  log('LAYWOUT=' + JSON.stringify(out));
  return { out, shot1 };
}
