export default async ({ evaluate }) => {
  const HELPERS = `
    window.__H = 1334;
    window.__box = (n) => { const t = n.getComponent('cc.UITransform'); if (!t) return null; const b = t.getBoundingBoxToWorld(); return { n: n.name, x: +b.x.toFixed(2), y: +(__H - b.y - b.height).toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
  `;
  return await evaluate(`(() => {
    ${HELPERS}
    const canvas = cc.director.getScene().getChildByName('Canvas');
    const comp = canvas.components.find((x) => x && x.save && x.cities);
    if (comp.cityPanel && comp.cityPanel.hide) comp.cityPanel.hide();
    const out = [];
    const walk = (n, d) => {
      const b = __box(n);
      const sp = n.getComponent('cc.Sprite');
      out.push({ ...(b || { n: n.name }), d, sp: !!sp, act: n.active, kids: n.children.length });
      if (d < 2) for (const c of n.children) walk(c, d + 1);
    };
    walk(canvas, 0);
    return {
      total: out.length,
      big: out.filter((o) => (o.w || 0) > 100 && (o.h || 0) > 100),
      mapImageRect: comp.mapImageRect(),
      scene: cc.director.getScene().name,
    };
  })()`);
};
