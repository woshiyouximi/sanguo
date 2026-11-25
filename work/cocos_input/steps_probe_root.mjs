export default async function ({ evaluate, sleep, log, shot }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const H = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
    const __comps = (name) => { const out = []; for (const n of __all()) for (const c of n.components || []) if (__cn(c) === name) out.push(c); return out; };
  `;
  const a = await ev(`(() => { ${H}
    const rs = __comps('BattleRoot');
    const r = rs[0];
    return JSON.stringify({ count: rs.length, keys: r ? Object.keys(r) : [], world: !!(r && r.world),
      booted: r && r.booted, loading: r && r.loading, ready: r && r.ready, launch: r && r.launch,
      hud: !!(r && r.hud), input: r && r.input ? r.input.phase : null,
      nodeName: r && r.node && r.node.name, scene: cc.director.getScene().name });
  })()`);
  log(JSON.stringify(a));
  await shot('probe_root.png');
  return a;
}
