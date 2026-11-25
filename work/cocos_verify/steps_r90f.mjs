// 诊断 + 验收：新开 Battle → world 形状 → tapSkill(0) → 气力/战果变化
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
  const out = {};
  await sleep(5000);

  await ev(`(() => { cc.director.loadScene('Battle'); return JSON.stringify({ ok: true }); })()`);
  await sleep(4000);

  out.shape = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    if (!r) return JSON.stringify({ ok: false });
    const w = r.world;
    if (!w) return JSON.stringify({ ok: false, why: 'no world', keys: Object.keys(r).slice(0, 30) });
    const side = w.sides.A;
    return JSON.stringify({
      worldKeys: Object.keys(w).slice(0, 40),
      sideKeys: Object.keys(side).slice(0, 20),
      generalKeys: side.general ? Object.keys(side.general).slice(0, 24) : null,
      qi: side.qi ?? side.general?.qi ?? null,
      over: w.over, tick: w.tick,
      inputKeys: r.input ? Object.keys(r.input) : null,
      skills: r.input && r.input.slots ? r.input.slots.map((s) => ({ name: s.name, cost: s.cost, why: s.block })) : null,
    });
  })()`);

  out.tap = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const w = r.world;
    const before = { tick: w.tick, qi: w.sides.A.qi ?? w.sides.A.general?.qi ?? null, marks: (w.skillMarks || []).length, aliveB: (w.units || []).filter((u) => u.side === 'B' && u.alive).length };
    r.input.tapSkill(0);
    return JSON.stringify({ before, sel: r.input.selected ?? null });
  })()`);
  await sleep(2500);
  await shot('r90e_10_cast');
  out.after = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const w = r.world;
    return JSON.stringify({ tick: w.tick, qi: w.sides.A.qi ?? w.sides.A.general?.qi ?? null, marks: (w.skillMarks || []).length, aliveB: (w.units || []).filter((u) => u.side === 'B' && u.alive).length, msg: r.lastMessage, over: w.over });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}
