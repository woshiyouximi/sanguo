export default async ({ evaluate, log }) => {
  const out = await evaluate(`(() => {
    const cv = cc.director.getScene().getChildByName('Canvas');
    return JSON.stringify(cv.children.map((n) => {
      const t = n.getComponent('cc.UITransform');
      const b = t ? t.getBoundingBoxToWorld() : null;
      return { name: n.name, active: n.active, kids: n.children.length, b: b ? [Math.round(b.x), Math.round(1334 - b.y - b.height), Math.round(b.width), Math.round(b.height)] : null };
    }));
  })()`);
  log('canvas children:', out);
  return out;
};
