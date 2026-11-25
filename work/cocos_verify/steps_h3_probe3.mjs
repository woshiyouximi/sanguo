export default async function ({ evaluate, sleep, log, click, send }) {
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
  } catch (err) { /* ignore */ }
  const H = `
    const cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name) || '')).replace(/^cc\\./, '');
    const walk = (n, out) => { out.push(n); for (const c of n.children) walk(c, out); return out; };
    const all = () => { const sc = cc.director.getScene(); return sc ? walk(sc, []) : []; };
    const comp = (name) => { for (const n of all()) { const c = (n.components || []).find((x) => cn(x) === name); if (c) return c; } return null; };
  `;
  // 展开第二层
  await ev(`(() => { ${H} const r = comp('BattleRoot'); if (!r) return JSON.stringify({err:'no root'});
    r.input.setArmyMenuOpen(true); return JSON.stringify({ ok: 1 }); })()`);
  await sleep(400);
  const dump = await ev(`(() => { ${H} const r = comp('BattleRoot');
    const root = r.node.getChildByName('BattleCmdUi');
    if (!root) return JSON.stringify({ err: 'no cmdRoot' });
    const kids = root.children.map((n, i) => ({ i, name: n.name, active: n.active,
      x: +(n.position.x).toFixed(1), y: +(n.position.y).toFixed(1),
      w: n.getComponent(cc.UITransform) ? n.getComponent(cc.UITransform).width : null,
      h: n.getComponent(cc.UITransform) ? n.getComponent(cc.UITransform).height : null }));
    const lbl = (name) => { const n = root.getChildByName('Cmd_' + name);
      if (!n) return null; const l = n.getComponent(cc.Label);
      return { text: l ? l.string : null, overflow: l ? l.overflow : null,
        align: l ? l.horizontalAlign : null, size: l ? l.fontSize : null,
        nodeW: n.getComponent(cc.UITransform).width, nodeX: +n.position.x.toFixed(1) }; };
    return JSON.stringify({ menu: r.input.armyMenuNow, kids,
      rowLabel: lbl('army.0.label'), rowNo: lbl('army.0.no'), rowRight: lbl('army.0.right'),
      cmd6Label: lbl('cmd6.0.label'), key: lbl('cmd6.0.key'),
      hp: lbl('gen.hp'), stats: lbl('gen.stats') }); })()`);
  log('dump ' + JSON.stringify(dump, null, 0).slice(0, 4000));
  await sleep(200);
}
