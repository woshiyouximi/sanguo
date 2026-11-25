// 内政/经济 P0 实机取证（CDP，端口 9351 / profile .edgeprof_affairs）。
// 覆盖：F13 钱变兵 12 个月表、F14 守军不白涨、F1 七月进内政被拒、F2 逐将年令、
//      F8 搜索不选将被拒、F3 在路上的将不能内政、F17/F18 列表「防」与六项信息卡。
// 用法：MATCH=campaign PORT=9351 OUTDIR=F:\\sanguo\\work\\internal_affairs node work\\cocos_verify\\cdpweb.mjs run work\\internal_affairs\\steps_affairs.mjs
import fs from 'node:fs';
import nodePath from 'node:path';

export default async function ({ s, evaluate, sleep, shot, log }) {
  const BASE = 'http://127.0.0.1:5173/web/';
  const CAMP = BASE + 'campaign.html?dev=1&unlimited=1&armyui=1';
  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const js = async (expr) => JSON.parse(await ev(expr));
  const nav = async (url, ms = 3200) => { await s('Page.navigate', { url }); await sleep(ms); };
  const shotSafe = async (name) => { try { const r = await shot(name); return r && r.bytes; } catch (e) { return 'shot-fail:' + e.message; } };

  // ---------- 0. 造一个可复现的存档：第一剧本、玩家 3 城、预备兵清零（先「用掉」才看得到钱变兵） ----------
  await nav(CAMP, 3000);
  const seedRaw = await ev(`(async () => {
    const S = await import('/web/saves.js');
    const M = await import('/web/city_model.js');
    const SCEN = await fetch('/data/scenarios.json').then((r) => r.json());
    const GENS = await fetch('/data/generals.json').then((r) => r.json());
    const sc = SCEN[0];
    const save = S.newCampaign(sc, {});
    M.ensureExtras(save);
    for (const n of save.owned) { save.cities[n].prep = 0; save.cities[n].troops = Math.max(1, Math.floor(save.cities[n].troops / 2)); }
    const rosters = {};
    for (const n of save.owned) rosters[n] = M.rosterOf(save, n, { generals: GENS, scenIdx: 0 }).map((g) => g.NAME);
    const city = save.owned.slice().sort((a, b) => (rosters[b] || []).length - (rosters[a] || []).length)[0] || save.owned[0];
    const store = S.loadStore();
    S.writeSlotAuto(store, 0, S.prepareSnapshot(save, sc.cities, {}));
    const ok = S.saveStore(store);
    return JSON.stringify({
      ok, scenario: sc.name, owned: save.owned, city, rosters, month: save.month, gold: save.gold,
      cities: save.owned.map((n) => ({ n, prep: save.cities[n].prep, money: save.cities[n].money, def: save.cities[n].def, pop: save.cities[n].pop, troops: save.cities[n].troops })),
    });
  })()`);
  const seed = JSON.parse(seedRaw);
  log('seed', JSON.stringify(seed));
  const CITY = seed.city;

  await nav(CAMP, 3500);
  const bootOk = await ev(`(() => !!document.querySelector('[data-act="advance"]'))()`);

  const readState = async (city) => js(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1'));
    const e = raw.slots[(raw.last || 1) - 1] || raw.slots.find((x) => x && x.snapshot);
    const s = e.snapshot; const c = (s.cities && s.cities[${JSON.stringify(city)}]) || {};
    const btn = document.querySelector('[data-act="city"]');
    const card = document.querySelector('#cityCard');
    return JSON.stringify({
      month: s.month, gold: s.gold, money: c.money, prep: c.prep, prepCap: c.prepCap,
      def: c.def, pop: c.pop, troops: c.troops, owner: c.owner,
      slot: raw.last, slotsFilled: (raw.slots || []).filter(Boolean).length, snapV: s.v,
      cityKeys: Object.keys(s.cities || {}).length,
      ym: (document.querySelector('#ym') || {}).textContent || '',
      domGold: (document.querySelector('#gold') || {}).textContent || '',
      cityBtn: btn ? btn.innerText.replace(/\\s+/g, ' ') : '',
      cardHidden: card ? !!card.hidden : null,
      cardText: card && !card.hidden ? card.innerText.replace(/\\s+/g, ' ') : '',
    });
  })()`);
  const selectCity = async (city) => ev(`(() => {
    const city = ${JSON.stringify(city)};
    const el = [...document.querySelectorAll('#list [data-name]')].find((x) => x.dataset.name === city);
    if (!el) return 'no-row';
    el.click();
    return 'ok';
  })()`);
  const clickAdvance = async () => ev(`(() => {
    const cs = document.querySelector('#confirmSheet');
    if (cs && !cs.hidden) { const b = cs.querySelector('[data-close="1"]'); if (b) b.click(); }
    const a = document.querySelector('[data-act="advance"]');
    if (!a) return 'no-advance';
    a.click();
    return 'ok';
  })()`);

  // ---------- 1. 连推 12 个月，逐月记 {month,gold,prep,def,pop} ----------
  await selectCity(CITY);
  await sleep(300);
  const card0 = await readState(CITY);
  const f17row = await ev(`(() => {
    const el = [...document.querySelectorAll('#list [data-name]')].find((x) => x.dataset.name === ${JSON.stringify(CITY)});
    return el ? el.innerText.replace(/\\s+/g, ' ') : '';
  })()`);
  await shotSafe('s_00_campaign_m01_card.png');

  const rows = [card0];
  let month7 = null;
  for (let i = 0; i < 12; i++) {
    const clickRes = await clickAdvance();
    await sleep(650);
    let st = await readState(CITY);
    if (st.month === 7 && !month7) {
      // ---------- 2. 七月进「内政」应被拒（按钮变「查看」+ 城内只读） ----------
      await selectCity(CITY);
      await sleep(250);
      const btnLabel = await ev(`document.querySelector('[data-act="city"]').innerText.replace(/\\s+/g, ' ')`);
      await shotSafe('s_07_campaign_view_btn.png');
      await ev(`document.querySelector('[data-act="city"]').click(), 'ok'`);
      await sleep(3800);
      const viewInfo = await js(`(() => { const c = window.__city; return JSON.stringify({
        url: location.href, hasCity: !!c, readOnly: c && c.readOnly, inAffairs: c && c.inAffairs,
        view: c && c.view, month: c && c.save.month, monthOfYear: c && c.Saves.monthOfYear(c.save.month),
        cityName: c && c.cityDef && c.cityDef.NAME,
      }); })()`);
      await shotSafe('s_07_city_view_readonly.png');
      // 只读页点「搜索」：应被 readOnly 拒（连选将抽屉都不开）
      await ev(`window.__city.onCmd('搜索'), 'ok'`);
      await sleep(500);
      const viewLog = await ev(`(document.querySelector('#log') || {}).innerText || ''`);
      await shotSafe('s_07_city_view_search_rejected.png');
      month7 = { btnLabel, viewInfo, viewLog, sheetOn: await ev(`document.querySelector('#sheet').classList.contains('on')`) };
      // F15：非正月点「徵兵」应被 toast 拒绝，不扣金不加兵
      await nav(CAMP, 3500);
      await selectCity(CITY);
      await sleep(250);
      const goldBefore15 = await ev(`document.querySelector('#gold').textContent`);
      await ev(`document.querySelector('[data-act="recruit"]').click(), 'ok'`);
      await sleep(500);
      month7.f15 = {
        notice: await ev(`(document.querySelector('#hint')||{}).textContent || ''`),
        goldBefore: goldBefore15, goldAfter: await ev(`document.querySelector('#gold').textContent`),
        stillCampaign: await ev(`location.pathname.indexOf('campaign') >= 0`),
      };
      await shotSafe('s_07_recruit_rejected.png');
      log('month7', JSON.stringify(month7));
      await selectCity(CITY);
      await sleep(250);
      st = await readState(CITY);
    }
    rows.push(st);
    log('month ' + st.month, JSON.stringify({ g: st.gold, m: st.money, p: st.prep, cap: st.prepCap, d: st.def, pop: st.pop }));
  }
  await shotSafe('s_12_campaign_m13.png');

  // ---------- 3. 正月（月 13）城内：F1 开窗 / F8 不选将拒绝 / F2 逐将年令 ----------
  const ownedNow = rows[rows.length - 1].owner ? CITY : CITY;
  await nav(BASE + 'city.html?city=' + encodeURIComponent(ownedNow) + '&dev=1', 3800);
  const jan = await js(`(() => { const c = window.__city; const st = c && c.save.cities[c.cityDef.NAME]; return JSON.stringify({
    ok: !!c, city: c && c.cityDef && c.cityDef.NAME, month: c && c.save.month,
    monthOfYear: c && c.Saves.monthOfYear(c.save.month), readOnly: c && c.readOnly,
    inAffairs: c && c.inAffairs, view: c && c.view,
    stPrep: st && st.prep, stMoney: st && st.money, stDef: st && st.def, stPop: st && st.pop,
    prepState: c && c.M.prepStateOf(c.save, c.cityDef), gold: c && c.save.gold,
    free: c && c.freeExecs(), acted: c && c.acted(), away: c && c.away(),
    log: (document.querySelector('#log') || {}).innerText || '',
  }); })()`);
  await shotSafe('s_13_city_january.png');

  // 3a. 搜索不选将：开抽屉 → 直接按确定 → 应提示「沒選執行武將」且不扣钱、不记行动
  await ev(`window.__city.onCmd('搜索'), 'ok'`);
  await sleep(600);
  const sheetInfo = await js(`(() => { const sh = document.querySelector('#sheet'); const b = document.querySelector('#sheetBody');
    return JSON.stringify({ open: sh ? sh.classList.contains('on') : null, picks: b ? b.querySelectorAll('.pick[data-name]').length : 0,
      title: (document.querySelector('#sheetTitle') || {}).textContent || '' }); })()`);
  await shotSafe('s_13_search_sheet.png');
  await ev(`document.querySelector('#sheetOk').click(), 'ok'`);
  await sleep(600);
  const noPick = await js(`(() => { const c = window.__city; return JSON.stringify({
    log: (document.querySelector('#log') || {}).innerText || '',
    gold: c.save.gold, acted: c.acted(),
    sheetOn: document.querySelector('#sheet').classList.contains('on'),
  }); })()`);
  await shotSafe('s_13_search_noselect_rejected.png');

  // 3b. 选将后执行：记录 acted / freeExecs
  await ev(`window.__city.onCmd('搜索'), 'ok'`);
  await sleep(600);
  const pickName = await ev(`(() => { const b = document.querySelector('#sheetBody .pick[data-name]'); if (!b) return ''; b.click(); return b.dataset.name; })()`);
  await sleep(150);
  await ev(`document.querySelector('#sheetOk').click(), 'ok'`);
  await sleep(900);
  const afterPick = await js(`(() => { const c = window.__city; return JSON.stringify({
    pick: ${JSON.stringify(pickName)}, gold: c.save.gold, acted: c.acted(), free: c.freeExecs(),
    log: (document.querySelector('#log') || {}).innerText || '',
  }); })()`);
  await shotSafe('s_13_search_done.png');

  // 3c. 同一名将今年再搜：应被「今年已行動」拒
  const beforeDup = await ev(`window.__city.save.gold`);
  await ev(`window.__city.doSearch(${JSON.stringify(pickName)}), 'ok'`);
  await sleep(500);
  const dup = await js(`(() => { const c = window.__city; return JSON.stringify({
    log: (document.querySelector('#log') || {}).innerText || '', gold: c.save.gold,
    acted: c.acted(),
  }); })()`);

  // ---------- 4. F3：在路上的武将不能内政（用生产函数 syncAway/rosterOf 在真实存档上验） ----------
  const f3 = await js(`(() => {
    const c = window.__city; const M = c.M; const save = c.save; const city = c.cityDef.NAME;
    const before = M.rosterOf(save, city, c.ctx).map((g) => g.NAME);
    if (!before.length) return JSON.stringify({ ok: false, why: 'roster empty' });
    const name = before[0];
    const el = (c.ctx.generals || []).find((g) => g.NAME === name);
    save.armies = save.armies || [];
    save.armies.push({ id: 'probe-f3', side: 'A', from: city, to: '__probe__', pathIndex: 0, progress: 0.2,
      troops: 10, general: name, officers: [name], advisor: '', stationed: false });
    M.syncAway(save);
    const awayAfter = Object.keys(M.awayNameSet(save));
    const mid = M.rosterOf(save, city, c.ctx).map((g) => g.NAME);
    const freeMid = c.freeExecs();
    save.armies = save.armies.filter((a) => a.id !== 'probe-f3');
    M.syncAway(save);
    const back = M.rosterOf(save, city, c.ctx).map((g) => g.NAME);
    return JSON.stringify({
      ok: true, probe: name, str: el && el.STR, before: before.length, mid: mid.length, back: back.length,
      awayAfter, excludedOnRoad: !mid.includes(name), freeExcludes: !freeMid.includes(name),
      restoredAfterReturn: back.includes(name),
    });
  })()`);

  // ---------- 4b. F15：正月的「徵兵」应开城内同一个徵兵抽屉（不再有自己的 500 金/40 兵口径） ----------
  await nav(CAMP, 3500);
  await selectCity(CITY);
  await sleep(250);
  await ev(`document.querySelector('[data-act="recruit"]').click(), 'ok'`);
  await sleep(3800);
  const f15jan = await js(`(() => { const sh = document.querySelector('#sheet');
    return JSON.stringify({
      url: location.href, onCityPage: location.pathname.indexOf('city.html') >= 0,
      sheetOn: sh ? sh.classList.contains('on') : null,
      title: (document.querySelector('#sheetTitle') || {}).textContent || '',
      city: (window.__city && window.__city.cityDef && window.__city.cityDef.NAME) || '',
    }); })()`);
  await shotSafe('s_15_recruit_drawer.png');

  // ---------- 5. 落盘证据 ----------
  const table = rows.map((r) => ({ month: r.month, gold: r.gold, money: r.money, prep: r.prep, cap: r.prepCap, def: r.def, pop: r.pop, troops: r.troops, slot: r.slot, slots: r.slotsFilled, snapV: r.snapV, domGold: r.domGold, card: r.cardText }));
  const out = { seed, city: CITY, bootOk, f17row, card0: card0.cardText, month7, jan, sheetInfo, noPick, afterPick, dup, f3, f15jan, table, shotDir: process.env.OUTDIR || '' };
  const dir = process.env.OUTDIR || '.';
  fs.writeFileSync(nodePath.join(dir, 'cdp_result.json'), JSON.stringify(out, null, 2), 'utf8');
  return out;
}
