export default async function ({ evaluate, sleep, log, send }) {
  const ev = async (expr) => {
    try {
      const v = await evaluate(expr);
      return typeof v === 'string' ? JSON.parse(v) : v;
    } catch (err) {
      return { err: err.message };
    }
  };
  try {
    await send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await send('Page.bringToFront', {});
  } catch (err) { /* ignore */ }
  const H = `
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name) || '')).replace(/^cc\\./, '');
    const walk = (n, out) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
    const all = () => { const sc = cc.director.getScene(); return sc ? walk(sc, []) : []; };
    const comp = (name) => { for (const n of all()) { const c = (n.components || []).find((x) => cn(x) === name); if (c) return c; } return null; };
  `;
  const mods = await ev(`JSON.stringify({ UITransform: typeof cc.UITransform, Label: typeof cc.Label,
    UIOpacity: typeof cc.UIOpacity, Sprite: typeof cc.Sprite, Widget: typeof cc.Widget })`);
  log('cc mods ' + JSON.stringify(mods));

  // hook console.error 取栈
  await ev(`(() => { if (!window.__errHook) { window.__errHook = 1; window.__errs = [];
    const old = console.error.bind(console);
    console.error = function (...a) { try { if (window.__errs.length < 4) window.__errs.push({ msg: String(a[0]).slice(0, 120), stack: String(new Error().stack).split('\\n').slice(1, 12).join(' <- ') }); } catch (e) {} return old(...a); };
  } return JSON.stringify({ hooked: 1 }); })()`);

  await ev(`(() => { ${H} const r = comp('BattleRoot'); if (!r) return JSON.stringify({err:'no root'});
    r.input.setArmyMenuOpen(true); return JSON.stringify({ ok: 1 }); })()`);
  await sleep(500);

  const dump = await ev(`(() => { ${H} const r = comp('BattleRoot');
    const root = r.node.getChildByName('BattleCmdUi');
    if (!root) return JSON.stringify({ err: 'no cmdRoot' });
    const kids = root.children.map((n, i) => { const t = n.getComponent(cc.UITransform); const l = n.getComponent(cc.Label);
      return { i, name: n.name, act: n.active, x: +n.position.x.toFixed(1), y: +n.position.y.toFixed(1),
        w: t ? +t.width.toFixed(1) : null, h: t ? +t.height.toFixed(1) : null,
        ov: l ? l.overflow : null, al: l ? l.horizontalAlign : null, fs: l ? l.fontSize : null, s: l ? String(l.string).slice(0, 8) : null }; });
    return JSON.stringify({ menu: r.input.armyMenuNow, n: kids.length, kids, errs: window.__errs || [] }); })()`);
  log('dump ' + JSON.stringify(dump).slice(0, 6000));
  await sleep(200);
}
