// 第 5 轮验收 F：大地图推进一月（doAction('advance')）→ 月份/金/战报
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
  await ev(`(() => { cc.director.loadScene('Campaign'); return JSON.stringify({ ok: true }); })()`);
  await sleep(5000);

  out.before = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, cities: c.cities ? c.cities.length : null, logs: (s.log || []).length });
  })()`);

  out.advance = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    c.doAction('advance');
    return JSON.stringify({ ok: true, hint: c.hintText || null });
  })()`);
  await sleep(3000);
  await shot('r90f_00_month');
  out.after = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    const s = c.save || {};
    return JSON.stringify({ month: s.month, year: s.year, gold: s.gold, logs: (s.log || []).length, tail: (s.log || []).slice(-4), hint: c.hintText || null });
  })()`);

  log(JSON.stringify(out, null, 2));
  return out;
}
