// 尝试把 Mask 注入到运行时的 'cc' 模块命名空间（若能写），再看 Battle 是否完整构建
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.nsState = await ev(`(() => {
    const m = window.__ccns;
    const d = Object.getOwnPropertyDescriptor(m, 'Mask');
    return JSON.stringify({ extensible: Object.isExtensible(m), sealed: Object.isSealed(m), frozen: Object.isFrozen(m),
      hasOwnMask: Object.prototype.hasOwnProperty.call(m, 'Mask'), desc: d ? String(d) : null,
      ownKeyCount: Object.getOwnPropertyNames(m).length,
      sampleDesc: String(Object.getOwnPropertyDescriptor(m, 'Label') || null) });
  })()`);
  out.inject = await ev(`(() => {
    const m = window.__ccns;
    try {
      Object.defineProperty(m, 'Mask', { value: window.cc.Mask, configurable: true, enumerable: true, writable: true });
      return JSON.stringify({ ok: true, now: typeof m.Mask, sameAsLegacy: m.Mask === window.cc.Mask });
    } catch (e) { return JSON.stringify({ ok: false, err: String(e) }); }
  })()`);
  out.loadBattle = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(6000);
  out.after = await ev(`(() => {
    const sc = cc.director.getScene();
    const count = (n) => 1 + n.children.reduce((a, c) => a + count(c), 0);
    const labels = [];
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && typeof c.string === 'string' && c.string) labels.push(c.string); }); n.children.forEach(walk); };
    walk(sc);
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodeCount: count(sc),
      canvasChildren: sc.children[0].children.map((c) => ({ name: c.name, kids: c.children.length })),
      labels: labels.slice(0, 20), subs: (window.__acSubs || []).length, misses: (window.__acHits || []).length });
  })()`);
  out.shot = await shot('battle_with_mask_export');
  log('nsState', JSON.stringify(out.nsState));
  log('inject', JSON.stringify(out.inject));
  log('after', JSON.stringify(out.after).slice(0, 900));
  return out;
}
