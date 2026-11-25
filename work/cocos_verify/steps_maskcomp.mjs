// 判定 MaskComponent 是否就是 Mask 组件的等价类（能 addComponent 且带 Type.GRAPHICS_RECT）
export default async function (ctx) {
  const { evaluate, sleep, log } = ctx;
  await sleep(500);
  const r = await evaluate(`(async () => {
    const m = await System.import('cc');
    const out = {};
    const C = m.MaskComponent;
    out.name = C && C.name;
    out.kind = typeof C;
    out.isComponent = !!(C && C.prototype && C.prototype instanceof m.Component);
    out.hasType = !!(C && C.Type);
    out.typeKeys = C && C.Type ? Object.keys(C.Type) : null;
    out.typeGraphicsRect = C && C.Type ? C.Type.GRAPHICS_RECT : null;
    try {
      const n = new m.Node('probe');
      const c = n.addComponent(C);
      out.added = !!c;
      out.addedCtor = c && c.constructor && c.constructor.name;
      out.defaultType = c && c.type;
      out.sameAsCclegacyMask = C === (window.cc && window.cc.Mask);
    } catch (e) { out.error = String(e && e.message || e); }
    return JSON.stringify(out);
  })()`, { awaitPromise: true, returnByValue: true });
  const data = JSON.parse(r);
  log('MaskComponent probe =', r);
  return data;
}
