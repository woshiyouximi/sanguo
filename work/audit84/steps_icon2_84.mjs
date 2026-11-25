// 隐藏底图后截图：确认「城点图元」到底是我们的 sprite 还是底图上画的
export default async function (ctx) {
  const { evaluate, shot, sleep, log } = ctx;
  const J = (s) => JSON.parse(s);

  const before = J(await evaluate(`JSON.stringify((() => {
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const comp = canvas.components.find(c => c && c.save && c.cities);
    const icons = [];
    const walk = (n, d) => { if (d > 4) return; if (n.name && n.name.indexOf('CityIcon') === 0) icons.push(n); for (const c of n.children) walk(c, d + 1); };
    walk(canvas, 0);
    const rows = icons.slice(0, 8).map(n => {
      const sp = n.getComponent('cc.Sprite');
      const t = n.getComponent('cc.UITransform');
      return { name: n.name, x: Math.round(n.position.x), y: Math.round(n.position.y), active: n.active,
        spriteEnabled: sp ? sp.enabled : 'nosp', hasFrame: !!(sp && sp.spriteFrame), col: sp ? sp.color.toHEX() : null,
        w: t ? Math.round(t.width) : null, h: t ? Math.round(t.height) : null };
    });
    return { count: icons.length, rows,
      spriteEnabledCount: icons.filter(n => { const s = n.getComponent('cc.Sprite'); return s && s.enabled; }).length };
  })())`));
  log('BEFORE=' + JSON.stringify(before));

  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const m = c.getChildByName('CampaignMapImage'); m.active = false; return 'hid'; })()`);
  await sleep(600);
  const s1 = await shot('r84_no_basemap.png');
  await evaluate(`(() => { const c = cc.director.getScene().getChildByName('Canvas'); const m = c.getChildByName('CampaignMapImage'); m.active = true; return 'restore'; })()`);
  await sleep(300);
  return { before, s1 };
}
