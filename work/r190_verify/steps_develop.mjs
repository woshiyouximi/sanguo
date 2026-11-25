// [F12] 大地图「開發」不再自己扣 400 金 / 加 3000 人口，而是跳城内同一个选将抽屉。
// 验四件事：①点按钮真的导航到 city.html?cmd=develop ②城内页弹出选将抽屉（execSheet 可见）
// ③执行后 金不变、人口/防御增加、逐将年令落 ④旧第三套口徑不再生效（金前后相等）。
export default async function ({ s, evaluate, sleep, shot, log }) {
  const BASE = 'http://127.0.0.1:5173/web/';
  const CAMP = BASE + 'campaign.html?dev=1&unlimited=1&armyui=1';
  const CITY = '代縣';

  const ev = async (expr) => {
    const v = await evaluate(expr);
    if (v && v.__throw) throw new Error(v.__throw);
    return v;
  };
  const js = async (expr) => JSON.parse(await ev(expr));
  const nav = async (url, ms = 3600) => { await s('Page.navigate', { url }); await sleep(ms); };
  const shotSafe = async (name) => { try { const r = await shot(name); return r && r.bytes; } catch (e) { return 'shot-fail:' + e.message; } };
  const out = {};

  // 1) 大地图：选中己方的城，点「開 發」按钮
  await nav(CAMP, 4200);
  const before = await js(`(() => {
    const s = window.__save || (window.Saves && window.Saves.load && window.Saves.load());
    const st = s && s.cities[${JSON.stringify(CITY)}];
    return JSON.stringify({ month: s && s.month, gold: s && s.gold, money: st && st.money,
      pop: st && st.pop, def: st && st.def, acted: s && s.acted });
  })()`);
  out.before = before;
  log('before', JSON.stringify(before));

  // 点城 + 点开发（先选中城）
  await ev(`(() => {
    const rows = Array.from(document.querySelectorAll('#list .city'));
    const row = rows.find((r) => (r.querySelector('.n') || {}).textContent && r.querySelector('.n').textContent.includes(${JSON.stringify(CITY)}));
    if (row) row.click();
    return 'clicked-city';
  })()`);
  await sleep(700);
  const clicked = await ev(`(() => {
    const btn = document.querySelector('.btn[data-act="develop"]');
    if (!btn) return 'no-develop-btn';
    btn.click();
    return 'clicked-develop';
  })()`);
  await sleep(2600);
  const afterNav = await js(`(() => {
    const c = window.__city;
    return JSON.stringify({ url: location.href, hasCity: !!c, cmd: new URLSearchParams(location.search).get('cmd'),
      sheetOpen: c ? !!document.querySelector('#sheet.show, #sheet.open, .sheet.show') : false,
      sheetTitle: c ? ((document.querySelector('#sheet .ttl, #sheet h3') || {}).textContent || '') : '' });
  })()`);
  out.afterNav = afterNav;
  log('afterNav', JSON.stringify(afterNav));
  out.shotSheet = await shotSafe('d01_city_develop_sheet.png');

  // 2) 城内执行一次开发（选一位今年还没行动的将）
  const dev = await js(`(() => {
    const c = window.__city;
    if (!c) return JSON.stringify({ ok: false, why: 'no-city' });
    const st = c.save.cities[${JSON.stringify(CITY)}];
    const exec = (c.freeExecs() || [])[0] || '';
    const before = { money: st.money, pop: st.pop, def: st.def, gold: c.save.gold };
    if (!exec) return JSON.stringify({ ok: false, why: 'no-free-exec', before });
    c.doDevelop(exec);
    return JSON.stringify({ ok: true, exec, before, after: { money: st.money, pop: st.pop, def: st.def, gold: c.save.gold },
      acted: c.M.actedNames(c.save) });
  })()`);
  out.dev = dev;
  log('dev', JSON.stringify(dev));
  out.shotAfter = await shotSafe('d02_city_develop_done.png');

  // 3) 回大地图：确认金没被扣（旧码会 gold-400）
  await nav(CAMP, 4000);
  const back = await js(`(() => {
    const s = window.__save || (window.Saves && window.Saves.load && window.Saves.load());
    const st = s && s.cities[${JSON.stringify(CITY)}];
    return JSON.stringify({ gold: s && s.gold, money: st && st.money, pop: st && st.pop, def: st && st.def });
  })()`);
  out.back = back;
  log('back', JSON.stringify(back));
  out.shotMap = await shotSafe('d03_map_after_develop.png');

  log('RESULT', JSON.stringify(out));
  return out;
}
