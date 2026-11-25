// 探针：当前场景 / canvas 与设计分辨率的映射 / BattleRoot 是否就绪
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const H = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
    const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  `;
  await sleep(5000);
  const out = {};
  out.env = await ev(`(() => {
    const c = document.querySelector('canvas');
    const r = c ? c.getBoundingClientRect() : null;
    return JSON.stringify({
      scene: cc.director.getScene() && cc.director.getScene().name,
      canvas: r ? { left: r.left, top: r.top, width: r.width, height: r.height, bufW: c.width, bufH: c.height } : null,
      visible: cc.view.getVisibleSize(),
      design: cc.view.getDesignResolutionSize(),
      scaleX: cc.view.getScaleX(),
      scaleY: cc.view.getScaleY(),
      frame: cc.view.getFrameSize(),
      dpr: cc.view.getDevicePixelRatio ? cc.view.getDevicePixelRatio() : null,
      win: { w: window.innerWidth, h: window.innerHeight },
    });
  })()`);

  out.battle = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    return JSON.stringify({ hasRoot: !!r, scene: cc.director.getScene().name, mode: r && r.input ? r.input.modeNow : null, world: !!(r && r.world), over: r && r.world ? r.world.over : null });
  })()`);

  if (!out.battle.hasRoot) {
    await ev(`(() => { cc.director.loadScene('Battle'); return JSON.stringify({ loading: true }); })()`);
    await sleep(9000);
  }
  out.after = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    return JSON.stringify({ scene: cc.director.getScene().name, hasRoot: !!r, world: !!(r && r.world), mode: r && r.input ? r.input.modeNow : null, selected: r && r.input ? r.input.selected : null, qi: r && r.world ? r.world.sides.A.general.qi : null, mp: r && r.world ? r.world.sides.A.general.mp : null, slots: r && r.input ? r.input.slots.map((s) => s.name) : null });
  })()`);
  await shot('probe_battle');
  log(JSON.stringify(out, null, 2));
  return out;
}
