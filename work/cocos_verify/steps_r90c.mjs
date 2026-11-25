// 第 5 轮验收 C：完整开局链 → 大地图 → 名冊 / 列表 / 勢力 三个新面板
export default async function ({ evaluate, sleep, shot, log }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };

  const HELPER = `
    const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
    const __find = (name) => {
      const sc = cc.director.getScene();
      if (!sc) return null;
      let hit = null;
      const walk = (n) => { if (!hit && (n.components || []).some((c) => __cn(c) === name)) hit = n; n.children.forEach(walk); };
      walk(sc);
      return hit;
    };
    const __comp = (name) => {
      const n = __find(name);
      if (!n) return null;
      return (n.components || []).find((c) => __cn(c) === name) || null;
    };
    const __hits = (c) => (c && c.hits ? c.hits : []);
    const __tapAct = (comp, act) => {
      const h = __hits(comp).find((x) => x.act === act);
      if (!h) return { ok: false, acts: [...new Set(__hits(comp).map((x) => x.act))] };
      comp.tap(h.x + h.w / 2, h.y + h.h / 2);
      return { ok: true, at: { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) } };
    };
    const __allComps = () => {
      const sc = cc.director.getScene(); const out = [];
      const walk = (n) => { (n.components || []).forEach((c) => out.push(__cn(c))); n.children.forEach(walk); };
      if (sc) walk(sc); return [...new Set(out)];
    };
    const __nodeCount = () => { const sc = cc.director.getScene(); const c = (n) => 1 + n.children.reduce((a, x) => a + c(x), 0); return sc ? c(sc) : 0; };
  `;

  const out = {};
  await sleep(6000);

  out.start = await ev(`(() => { ${HELPER}
    const t = __comp('TitlePanel'); if (!t) return JSON.stringify({ ok: false, why: 'no title' });
    return JSON.stringify(__tapAct(t, 'new'));
  })()`);
  await sleep(1500);

  out.pickScenario = await ev(`(() => { ${HELPER}
    const s = __comp('ScenarioSelect'); if (!s) return JSON.stringify({ ok: false, why: 'no scenario' });
    const card = __hits(s).find((h) => h.act === 'card');
    if (card) s.tap(card.x + card.w / 2, card.y + card.h / 2);
    return JSON.stringify({ ok: !!card, then: __tapAct(s, 'next') });
  })()`);
  await sleep(1500);

  out.pickForce = await ev(`(() => { ${HELPER}
    const s = __comp('ScenarioSelect'); if (!s) return JSON.stringify({ ok: false });
    const row = __hits(s).find((h) => h.act === 'force');
    if (row) s.tap(row.x + row.w / 2, row.y + row.h / 2);
    return JSON.stringify({ ok: !!row, then: __tapAct(s, 'start') });
  })()`);
  await sleep(4000);
  await shot('r90c_00_campaign');

  out.campaign = await ev(`(() => { ${HELPER}
    return JSON.stringify({ scene: cc.director.getScene().name, comps: __allComps().slice(0, 14), nodes: __nodeCount() });
  })()`);

  // 三个新入口：名冊 / 列表 / 勢力
  out.openBook = await ev(`(() => { ${HELPER}
    const c = __comp('CampaignRoot'); if (!c) return JSON.stringify({ ok: false });
    c.openGeneralBook();
    return JSON.stringify({ ok: true, nodes: __nodeCount() });
  })()`);
  await sleep(1200);
  await shot('r90c_01_book');

  out.bookInfo = await ev(`(() => { ${HELPER}
    const b = __comp('GeneralBookPanel');
    return JSON.stringify({ has: !!b, hits: __hits(b).length, nodes: __nodeCount() });
  })()`);

  out.closeBook = await ev(`(() => { ${HELPER}
    const b = __comp('GeneralBookPanel'); if (!b) return JSON.stringify({ ok: false });
    if (typeof b.close === 'function') b.close(); else if (b.node) b.node.active = false;
    return JSON.stringify({ ok: true });
  })()`);
  await sleep(800);

  out.openList = await ev(`(() => { ${HELPER}
    const c = __comp('CampaignRoot'); c.openCityList();
    return JSON.stringify({ ok: true, nodes: __nodeCount() });
  })()`);
  await sleep(1200);
  await shot('r90c_02_list');

  out.openForces = await ev(`(() => { ${HELPER}
    const l = __comp('CityListPanel'); if (l) { if (typeof l.close === 'function') l.close(); else if (l.node) l.node.active = false; }
    const c = __comp('CampaignRoot'); c.openForcesPanel();
    return JSON.stringify({ ok: true, nodes: __nodeCount() });
  })()`);
  await sleep(1200);
  await shot('r90c_03_forces');

  log(JSON.stringify(out, null, 2));
  return out;
}
