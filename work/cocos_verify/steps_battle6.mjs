// 验 2048 单页士兵图集：Battle 直开，数主将三层 / 士兵池 / 兵种帧来源 / 截图
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = {};

  out.consoleTail = await ev(`(() => {
    const e = (window.__errs || window.__consoleErrs || []);
    return JSON.stringify({ count: Array.isArray(e) ? e.length : -1, last: Array.isArray(e) ? e.slice(-3) : null });
  })()`).catch(() => null);

  out.load = await ev(`(() => { try { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); } catch (e) { return JSON.stringify({ err: String(e) }); } })()`);
  await sleep(7000);

  out.tree = await ev(`(() => {
    const sc = cc.director.getScene();
    if (!sc) return JSON.stringify({ scene: null });
    const count = (n) => 1 + n.children.reduce((a, c) => a + count(c), 0);
    const names = [];
    const walk = (n, d) => { names.push('  '.repeat(d) + n.name + (n.active ? '' : '(off)')); n.children.forEach((c) => walk(c, d + 1)); };
    walk(sc, 0);
    const labels = [];
    const lw = (n) => { (n._components || []).forEach((c) => { if (c && typeof c.string === 'string' && c.string) labels.push(c.string); }); n.children.forEach(lw); };
    lw(sc);
    const sprites = [];
    const sw = (n) => {
      (n._components || []).forEach((c) => {
        if (c && c.spriteFrame) {
          const sf = c.spriteFrame;
          const tex = sf.texture || (sf._texture);
          const w = tex && (tex.width || (tex._width));
          const h = tex && (tex.height || (tex._height));
          sprites.push({ node: n.name, w: w || null, h: h || null });
        }
      });
      n.children.forEach(sw);
    };
    sw(sc);
    const tex = {};
    sprites.forEach((s) => { const k = s.w + 'x' + s.h; tex[k] = (tex[k] || 0) + 1; });
    return JSON.stringify({ scene: sc.name, frames: cc.director.getTotalFrames(), nodeCount: count(sc),
      names: names.slice(0, 40), labels: labels.slice(0, 14), spriteTexSizes: tex, spriteCount: sprites.length });
  })()`);

  out.general = await ev(`(() => {
    const sc = cc.director.getScene();
    const found = [];
    const walk = (n) => { if (/^Gen[AB]/.test(n.name)) { const t = n._components && n._components.find((c) => c && c.spriteFrame); const sf = t && t.spriteFrame; const tex = sf && (sf.texture || sf._texture); found.push({ name: n.name, active: n.active, w: n._uiProps && n._uiProps.uiTransformComp ? n._uiProps.uiTransformComp.width : null, tex: tex ? (tex.width + 'x' + tex.height) : null }); } n.children.forEach(walk); };
    walk(sc);
    return JSON.stringify({ count: found.length, list: found });
  })()`);

  out.shot = await shot('battle6_units2048');
  await sleep(4000);
  out.shot2 = await shot('battle6_units2048_t2');
  log('tree', JSON.stringify(out.tree).slice(0, 1200));
  log('general', JSON.stringify(out.general).slice(0, 700));
  return out;
}
