// 鏈路 1 重跑取證（容忍 Boot 22s 級慢載入）
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save, S, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep, send } = ctx0;
  const out = { at: new Date().toISOString() };
  try { await send('Page.bringToFront'); } catch (e) { out.front = String(e.message); }

  const waitFor = async (expr, secs, label) => {
    for (let i = 0; i < secs * 2; i += 1) {
      const st = await run(`return JSON.stringify({ v: (${expr}), scene: __scene() });`);
      if (st.v) return { ok: true, secs: i / 2, scene: st.scene };
      await sleep(500);
    }
    return { ok: false, secs, label };
  };

  // 確保在標題頁
  out.title = await waitFor(`!!__comp('TitlePanel')`, 90, 'title');
  if (!out.title.ok) {
    await run(`cc.director.loadScene('Boot'); return JSON.stringify({ ok: 1 });`);
    out.titleRetry = await waitFor(`!!__comp('TitlePanel')`, 90, 'title2');
  }
  log('title: ' + JSON.stringify(out.title) + ' ' + JSON.stringify(out.titleRetry || null));
  await sleep(2500);
  await S('a11_01_title');
  out.titleDbg = await run(`const t = __comp('TitlePanel'); const d = t.debug ? t.debug() : null; return JSON.stringify({ d, labels: __labels().slice(0, 12), acts: __hits(t).map((h) => h.act) });`);
  log('titleDbg: ' + JSON.stringify(out.titleDbg).slice(0, 900));

  out.tapNew = await run(`const t = __comp('TitlePanel'); return JSON.stringify(__tapAct(t, 'new'));`);
  log('tapNew: ' + JSON.stringify(out.tapNew));
  out.sc = await waitFor(`!!__comp('ScenarioSelect')`, 90, 'scenario');
  log('sc: ' + JSON.stringify(out.sc));
  await sleep(2500);
  await S('a11_02_scenario');
  out.cards = await run(`
    const s = __comp('ScenarioSelect');
    const d = s.debug ? s.debug() : null;
    const labels = __labels();
    return JSON.stringify({
      page: s.page, debug: d,
      cards: (s.cards || []).map((c, i) => ({ i, name: c.name, year: c.year, opening: c.opening, nameText: __lbl('ScCard_' + i + '_Name'), stats: __lbl('ScCard_' + i + '_Stats'), openingText: __lbl('ScCard_' + i + '_Opening') })),
      summaryOpen: __lbl('ScSummaryOpen'),
      oldNameHits: labels.filter((x) => x.indexOf('開局三城') >= 0).length,
      newNameHits: labels.filter((x) => x.indexOf('地圖前三城') >= 0).length
    });`);
  log('cards: ' + JSON.stringify(out.cards).slice(0, 2200));

  out.next = await run(`const s = __comp('ScenarioSelect'); const c = __hits(s).find((h) => h.act === 'card' && (h.index === 0 || h.index === undefined)); if (c) s.tap(c.x + c.w / 2, c.y + c.h / 2); return JSON.stringify(__tapAct(s, 'next'));`);
  log('next: ' + JSON.stringify(out.next));
  out.forcePage = await waitFor(`(__comp('ScenarioSelect')||{}).page === 'force'`, 40, 'force');
  await sleep(2500);
  await S('a11_03_force');
  out.force = await run(`const s = __comp('ScenarioSelect'); return JSON.stringify({ page: s.page, debug: s.debug ? s.debug() : null, rows: __hits(s).filter((h) => h.act === 'force').length, labels: __labels().slice(0, 8) });`);
  log('force: ' + JSON.stringify(out.force).slice(0, 900));

  out.pick = await run(`const s = __comp('ScenarioSelect'); const rows = __hits(s).filter((h) => h.act === 'force'); const r0 = rows[0]; if (r0) s.tap(r0.x + r0.w / 2, r0.y + r0.h / 2); return JSON.stringify({ tapped: r0 ? (r0.name || 'row0') : null });`);
  await sleep(1200);
  out.start = await run(`const s = __comp('ScenarioSelect'); return JSON.stringify(__tapAct(s, 'start'));`);
  log('pick/start: ' + JSON.stringify(out.pick) + ' ' + JSON.stringify(out.start));

  out.ready = await waitCampaignReady(120);
  log('ready: ' + JSON.stringify(out.ready));
  await sleep(3000);
  await S('a11_04_campaign');
  out.map = await run(`
    const c = __comp('CampaignRoot');
    const s = c && c.save;
    return JSON.stringify({ scene: __scene(), save: s ? { month: s.month, year: s.year, gold: s.gold, owned: s.owned, wins: s.wins, losses: s.losses } : null, monarch: c ? (c.monarchState || {}).monarch : null, seat: c ? c.monarchSeat : null, hint: c ? c.hintText : null, cities: c && c.cities ? c.cities.length : null });`);
  log('map: ' + JSON.stringify(out.map).slice(0, 900));

  await save('r11.json', out);
  return out;
}
