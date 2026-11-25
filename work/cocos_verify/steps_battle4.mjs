// 关键验证：只把「undefined 的组件类」替换成 window.cc.Mask，其它一律不动，看 Battle 是否就能正常渲染
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};
  out.shim = await ev(`(() => {
    if (!window.__acOrig) { window.__acOrig = cc.Node.prototype.addComponent; }
    window.__acHits = [];
    window.__acSubs = [];
    cc.Node.prototype.addComponent = function (cls) {
      let used = cls;
      if (!cls) {
        if (window.cc && typeof window.cc.Mask === 'function') { used = window.cc.Mask; window.__acSubs.push({ node: this && this.name, sub: 'cc.Mask' }); }
        else { window.__acHits.push({ node: this && this.name }); }
      }
      return window.__acOrig.call(this, used, ...Array.prototype.slice.call(arguments, 1));
    };
    return JSON.stringify({ ok: true, origRestored: typeof window.__acOrig === 'function' });
  })()`);
  out.loadBattle = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(6000);
  out.after = await ev(`(() => {
    const sc = cc.director.getScene();
    const count = (n) => 1 + n.children.reduce((a, c) => a + count(c), 0);
    const canvas = sc.children[0];
    const labels = [];
    const walk = (n) => { (n._components || []).forEach((c) => { if (c && typeof c.string === 'string' && c.string) labels.push(c.string); }); n.children.forEach(walk); };
    walk(sc);
    let battle = null;
    const find = (n) => { (n._components || []).forEach((c) => { if (c && c.constructor && Array.isArray(c.units)) battle = c; }); n.children.forEach(find); };
    find(sc);
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(),
      nodeCount: count(sc), canvasChildren: canvas.children.map((c) => ({ name: c.name, children: c.children.length })),
      labels: labels.slice(0, 25), subs: window.__acSubs.length, misses: window.__acHits.length,
      battleFields: battle ? Object.keys(battle).filter((k) => !k.startsWith('_')).slice(0, 30) : null });
  })()`);
  out.shot = await shot('battle_with_mask_shim');
  log('after', JSON.stringify(out.after).slice(0, 1200));
  return out;
}
