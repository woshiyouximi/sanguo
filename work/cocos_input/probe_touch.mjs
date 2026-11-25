// 探针 v2：包裹 BattleRoot.prototype.toScreen，记录真点击的 getUILocation → 设计坐标
export default async function ({ evaluate, sleep, click, log }) {
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
  const info = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const proto = Object.getPrototypeOf(r);
    return JSON.stringify({
      methods: Object.getOwnPropertyNames(proto).filter((k) => typeof proto[k] === 'function'),
      fields: Object.getOwnPropertyNames(r),
    });
  })()`);
  log('proto:', JSON.stringify(info));

  const ok = await ev(`(() => { ${H}
    const r = __comp('BattleRoot');
    const proto = Object.getPrototypeOf(r);
    if (!proto.toScreen || proto.__wrapped) return JSON.stringify({ wrap: false, has: !!proto.toScreen });
    const orig = proto.toScreen;
    proto.toScreen = function (e) {
      const p = e.getUILocation();
      const out = orig.call(this, e);
      window.__probe.push({ ui: { x: p.x, y: p.y }, out });
      return out;
    };
    proto.__wrapped = true;
    window.__probe = window.__probe || [];
    return JSON.stringify({ wrap: true });
  })()`);
  log('wrap:', JSON.stringify(ok));
  if (!ok.wrap) return { info, ok };

  const pts = [
    { name: 'field', x: 438, y: 564 },
    { name: 'slot1', x: 318.02, y: 1197.77 },
    { name: 'slot3', x: 518.92, y: 1197.77 },
    { name: 'retreat', x: 699.5, y: 1294.16 },
    { name: 'top', x: 438, y: 100 },
  ];
  for (const p of pts) {
    await click(p.x, p.y);
    await sleep(350);
  }
  const got = await ev(`JSON.stringify({ probe: window.__probe, comp: (() => { ${H} const r = __comp('BattleRoot'); return r ? { selected: r.input.selected, msg: r.input.message } : null; })() })`);
  log(JSON.stringify(got, null, 2));
  return { info, got };
}
