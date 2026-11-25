// 收尾取證：①隱藏 SurrenderPanel 後截繼承人面板 ②完整跑一遍 標題→劇本→君主→大地圖
import { makeCtx } from './lib_accept.mjs';

export default async function (ctx0) {
  const { run, save, S, waitCampaignReady } = makeCtx(ctx0);
  const { log, sleep, send } = ctx0;
  const out = { at: new Date().toISOString() };

  try { await send('Page.bringToFront'); } catch (e) { out.front = String(e.message); }

  // ① 繼承人面板（把壓在上面的 SurrenderPanel 關掉）
  out.hide = await run(`
    const sp = __comp('SurrenderPanel');
    const mp = __comp('MonarchPanel');
    if (sp) sp.node.active = false;
    return JSON.stringify({ hidSurrender: !!sp, hasMonarch: !!mp, sheetKind: mp ? mp.sheetKind : null, isOpen: mp ? !!mp.isOpen : null });`);
  log('hide: ' + JSON.stringify(out.hide));
  await sleep(1200);
  await S('a10_01_succession');
  out.successionLabels = await run(`
    const mp = __comp('MonarchPanel');
    const v = mp && mp.successionView ? JSON.parse(JSON.stringify(mp.successionView)) : null;
    return JSON.stringify({ view: v, labels: __labels().slice(0, 18), hits: mp && mp.hits ? mp.hits.length : 0, successionState: mp && mp.successionState ? Object.keys(mp.successionState) : null });`);
  log('suc: ' + JSON.stringify(out.successionLabels).slice(0, 1200));

  // ② 回標題頁 → 新局 → 劇本 → 君主 → 大地圖
  await run(`cc.director.loadScene('Boot'); return JSON.stringify({ ok: 1 });`);
  for (let i = 0; i < 40; i += 1) {
    const st = await run(`return JSON.stringify({ title: !!__comp('TitlePanel'), scene: __scene() });`);
    if (st.title) { out.titleWait = i; break; }
    await sleep(500);
  }
  await sleep(1200);
  await S('a10_02_title');

  out.scenario = await run(`const t = __comp('TitlePanel'); return JSON.stringify(__tapAct(t, 'new'));`);
  log('tap new: ' + JSON.stringify(out.scenario));
  for (let i = 0; i < 60; i += 1) {
    const st = await run(`return JSON.stringify({ sc: !!__comp('ScenarioSelect') });`);
    if (st.sc) break;
    await sleep(500);
  }
  await sleep(1500);
  await S('a10_03_scenario');
  out.cards = await run(`
    const s = __comp('ScenarioSelect');
    const d = s.debug ? s.debug() : null;
    const labels = __labels();
    return JSON.stringify({
      page: s.page, debug: d,
      cards: (s.cards || []).map((c, i) => ({ i, name: c.name, year: c.year, opening: c.opening, stats: __lbl('ScCard_' + i + '_Stats'), openingText: __lbl('ScCard_' + i + '_Opening'), nameText: __lbl('ScCard_' + i + '_Name') })),
      summaryOpen: __lbl('ScSummaryOpen'),
      oldNameHits: labels.filter((x) => x.indexOf('開局三城') >= 0).length,
      newNameHits: labels.filter((x) => x.indexOf('地圖前三城') >= 0).length
    });`);
  log('cards: ' + JSON.stringify(out.cards).slice(0, 2000));

  out.next = await run(`const s = __comp('ScenarioSelect'); const c = __hits(s).find((h) => h.act === 'card' && (h.index === 0 || h.index === undefined)); if (c) s.tap(c.x + c.w / 2, c.y + c.h / 2); return JSON.stringify(__tapAct(s, 'next'));`);
  log('next: ' + JSON.stringify(out.next));
  for (let i = 0; i < 40; i += 1) {
    const st = await run(`const s = __comp('ScenarioSelect'); return JSON.stringify({ page: s ? s.page : null });`);
    if (st.page === 'force') break;
    await sleep(500);
  }
  await sleep(1500);
  await S('a10_04_force');
  out.force = await run(`const s = __comp('ScenarioSelect'); const d = s.debug ? s.debug() : null; const rows = __hits(s).filter((h) => h.act === 'force'); return JSON.stringify({ page: s.page, debug: d, rows: rows.slice(0, 4).map((r) => r.name || r.text || null), labels: __labels().slice(0, 10) });`);
  log('force: ' + JSON.stringify(out.force).slice(0, 900));

  out.start = await run(`const s = __comp('ScenarioSelect'); const rows = __hits(s).filter((h) => h.act === 'force'); const r0 = rows[0]; if (r0) s.tap(r0.x + r0.w / 2, r0.y + r0.h / 2); return JSON.stringify({ tapped: r0 ? (r0.name || 'row0') : null });`);
  await sleep(900);
  out.start2 = await run(`const s = __comp('ScenarioSelect'); return JSON.stringify(__tapAct(s, 'start'));`);
  log('start: ' + JSON.stringify(out.start) + ' ' + JSON.stringify(out.start2));

  const ready = await waitCampaignReady(60);
  out.ready = ready;
  log('ready: ' + JSON.stringify(ready));
  await sleep(1500);
  await S('a10_05_campaign');
  out.map = await run(`
    const c = __comp('CampaignRoot');
    const s = c && c.save;
    return JSON.stringify({ scene: __scene(), save: s ? { month: s.month, year: s.year, gold: s.gold, owned: s.owned, wins: s.wins, losses: s.losses } : null, monarch: c ? (c.monarchState || {}).monarch : null, seat: c ? c.monarchSeat : null, hints: __labels().filter((x) => x.indexOf('月') >= 0).slice(0, 6) });`);
  log('map: ' + JSON.stringify(out.map).slice(0, 800));

  await save('r10.json', out);
  return out;
}
