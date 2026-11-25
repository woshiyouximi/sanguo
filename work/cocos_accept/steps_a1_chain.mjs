// A1：標題頁 → 劇本（5 張卡 + 「地圖前三城」文案）→ 君主 → 大地圖
import fs from 'node:fs';
import path from 'node:path';

const H = `
  const __cn = (c) => (c && (c.__classname__ || (c.constructor && c.constructor.name))) || '?';
  const __all = () => { const sc = cc.director.getScene(); const a = []; const w = (n) => { a.push(n); n.children.forEach(w); }; if (sc) w(sc); return a; };
  const __comp = (name) => { const n = __all().find((x) => (x.components || []).some((c) => __cn(c) === name)); if (!n) return null; return (n.components || []).find((c) => __cn(c) === name) || null; };
  const __node = (name) => __all().find((x) => x.name === name) || null;
  const __lbl = (name) => { const n = __node(name); if (!n) return null; const l = n.getComponent(cc.Label); return l ? l.string : null; };
  const __hits = (c) => (c && c.hits ? c.hits : []);
  const __tapAct = (comp, act) => {
    const h = __hits(comp).find((x) => x.act === act);
    if (!h) return { ok: false, acts: [...new Set(__hits(comp).map((x) => x.act))] };
    comp.tap(h.x + h.w / 2, h.y + h.h / 2);
    return { ok: true, at: { x: Math.round(h.x + h.w / 2), y: Math.round(h.y + h.h / 2) } };
  };
  const __scene = () => (cc.director.getScene() ? cc.director.getScene().name : '?');
  const __comps = () => { const s = new Set(); __all().forEach((n) => (n.components || []).forEach((c) => s.add(__cn(c)))); return [...s]; };
`;

export default async function ({ evaluate, sleep, shot, log, OUTDIR }) {
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error('eval threw: ' + v.__throw);
    return typeof v === 'string' ? JSON.parse(v) : v;
  };
  const out = { at: new Date().toISOString() };
  const sh = [];
  // 連拍兩張：若瀏覽器回舊合成幀，兩張會與前一張位元組完全相同，可據此發現
  const S = async (n) => {
    const a = await shot(n + '_a');
    await sleep(700);
    const b = await shot(n);
    sh.push({ name: n, a: a.bytes, b: b.bytes, same: a.bytes === b.bytes });
  };

  await sleep(6500);
  await S('a1_00_boot');
  out.sceneStart = await ev(`(() => { ${H} return JSON.stringify({ scene: __scene(), comps: __comps() }); })()`);

  // 標題頁
  out.title = await ev(`(() => { ${H}
    const t = __comp('TitlePanel');
    if (!t) return JSON.stringify({ ok: false, why: 'no TitlePanel' });
    const acts = [...new Set(__hits(t).map((h) => h.act))];
    const labels = __all().map((n) => { const l = n.getComponent && n.getComponent(cc.Label); return l ? l.string : null; }).filter(Boolean);
    return JSON.stringify({ ok: true, acts, debug: typeof t.debug === 'function' ? t.debug() : null, labels });
  })()`);

  out.tapNew = await ev(`(() => { ${H} return JSON.stringify(__tapAct(__comp('TitlePanel'), 'new')); })()`);
  await sleep(2400);
  await S('a1_01_scenario');
  out.afterNew = await ev(`(() => { ${H} return JSON.stringify({ scene: __scene(), comps: __comps() }); })()`);

  // 5 張劇本卡：資料 + 畫面文字
  out.cards = await ev(`(() => { ${H}
    const s = __comp('ScenarioSelect');
    if (!s) return JSON.stringify({ ok: false, why: 'no ScenarioSelect' });
    const data = (s.cards || []).map((c) => ({ name: c.name, year: c.year, forces: c.forceCount, cities: c.cityCount, paths: c.pathCount, opening: c.opening }));
    const rendered = [];
    for (let i = 0; i < data.length; i += 1) {
      rendered.push({ i, name: __lbl('ScCard_' + i + '_Name'), stats: __lbl('ScCard_' + i + '_Stats'), opening: __lbl('ScCard_' + i + '_Opening') });
    }
    const allText = __all().map((n) => { const l = n.getComponent && n.getComponent(cc.Label); return l ? l.string : null; }).filter(Boolean);
    return JSON.stringify({
      ok: true, count: data.length, data, rendered,
      summaryOpen: __lbl('ScSummaryOpen'), summaryTitle: __lbl('ScSummaryTitle'), summaryStats: __lbl('ScSummaryStats'),
      oldTextHits: allText.filter((t) => t.indexOf('開局三城') >= 0).length,
      newTextHits: allText.filter((t) => t.indexOf('地圖前三城') >= 0).length,
    });
  })()`);

  // 選第 1 張卡 → 下一步 → 君主頁
  out.pickCard = await ev(`(() => { ${H}
    const s = __comp('ScenarioSelect');
    const card = __hits(s).find((h) => h.act === 'card');
    if (card) s.tap(card.x + card.w / 2, card.y + card.h / 2);
    const next = __tapAct(s, 'next');
    return JSON.stringify({ cardClicked: !!card, next, page: s.page });
  })()`);
  await sleep(1800);
  await S('a1_02_force');

  out.forcePage = await ev(`(() => { ${H}
    const s = __comp('ScenarioSelect');
    return JSON.stringify({ page: s.page, forcePage: s.forcePage, debug: s.debug ? s.debug() : null });
  })()`);

  out.startRun = await ev(`(() => { ${H}
    const s = __comp('ScenarioSelect');
    const row = __hits(s).find((h) => h.act === 'force');
    if (row) s.tap(row.x + row.w / 2, row.y + row.h / 2);
    const r = __tapAct(s, 'start');
    return JSON.stringify({ rowClicked: !!row, start: r });
  })()`);
  await sleep(6500);
  await S('a1_03_campaign');

  out.campaign = await ev(`(() => { ${H}
    const c = __comp('CampaignRoot');
    if (!c) return JSON.stringify({ ok: false, scene: __scene() });
    const s = c.save || {};
    const m = c.monarchState || {};
    return JSON.stringify({
      ok: true, scene: __scene(), comps: __comps(),
      month: s.month, year: s.year, gold: s.gold, owned: s.owned,
      cities: c.cities ? c.cities.length : null,
      selected: c.selected, hint: c.hintText,
      monarch: m.monarch, force: m.force, king: m.king,
      wins: s.wins, losses: s.losses,
      seat: c.monarchSeat, extinct: c.monarchExtinct,
    });
  })()`);

  out.shots = sh;
  fs.writeFileSync(path.join(OUTDIR, 'r1.json'), JSON.stringify(out, null, 1), 'utf8');
  log('wrote r1.json');
  return out;
}
