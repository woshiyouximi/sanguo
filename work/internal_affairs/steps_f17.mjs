// F17 补证：大地图列表的「防」读的是城 state（CM.ensureCityState），不是剧本静态 DEFENSE。
// 做法：正月在城内开发一次（def 311 → 动态值），回大地图看列表行是否跟着变。
import fs from 'node:fs';

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
  const nav = async (url, ms = 3200) => { await s('Page.navigate', { url }); await sleep(ms); };
  const shotSafe = async (name) => { try { const r = await shot(name); return r && r.bytes; } catch (e) { return 'shot-fail:' + e.message; } };
  const out = {};

  // 1) 城内：开发前后 def
  await nav(BASE + 'city.html?city=' + encodeURIComponent(CITY) + '&dev=1&unlimited=1', 3200);
  const before = await js(`(() => {
    const c = window.__city;
    const st = c.save.cities[${JSON.stringify(CITY)}];
    return JSON.stringify({ month: c.save.month, def: st.def, pop: st.pop, major: c.M.majorOf(c.save, c.cityDef),
      acted: c.M.actedNames(c.save), free: c.freeExecs(), staticDef: c.cityDef.DEFENSE });
  })()`);
  out.before = before;
  log('before', JSON.stringify(before));

  // 2) 开发一次（带执行武将：劉備）→ def/pop 动态增长
  const dev = await js(`(() => {
    const c = window.__city;
    const exec = c.freeExecs().find((n) => n !== '關羽') || c.freeExecs()[0] || '';
    if (!exec) return JSON.stringify({ ok: false, why: 'no-free-exec' });
    c.doDevelop(exec);
    const st = c.save.cities[${JSON.stringify(CITY)}];
    return JSON.stringify({ ok: true, exec, def: st.def, pop: st.pop, money: st.money, acted: c.M.actedNames(c.save) });
  })()`);
  out.dev = dev;
  log('dev', JSON.stringify(dev));
  await shotSafe('s_17_city_dev_before_return.png');

  // 3) 回大地图：列表行「防」应等于 state def（≠ 剧本静态 311 则证明读的是 state）
  await nav(CAMP, 3600);
  const row = await js(`(() => {
    const el = [...document.querySelectorAll('#list [data-name]')].find((x) => x.dataset.name === ${JSON.stringify(CITY)});
    if (!el) return JSON.stringify({ found: false });
    const txt = el.innerText.replace(/\\s+/g, ' ').trim();
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1'));
    const e = raw.slots[(raw.last || 1) - 1] || raw.slots.find((x) => x && x.snapshot);
    const st = (e.snapshot.cities || {})[${JSON.stringify(CITY)}] || {};
    return JSON.stringify({ found: true, rowText: txt, slotDef: st.def, slotPop: st.pop,
      staticDef: 311, hasDef: txt.includes('防 ' + st.def) });
  })()`);
  out.row = row;
  log('row', JSON.stringify(row));
  await ev(`(() => {
    const el = [...document.querySelectorAll('#list [data-name]')].find((x) => x.dataset.name === ${JSON.stringify(CITY)});
    if (el) el.click(); return 'ok';
  })()`);
  await sleep(400);
  out.card = await ev(`(() => {
    const c = document.querySelector('#cityCard');
    return JSON.stringify({ hidden: c ? !!c.hidden : null, text: c && !c.hidden ? c.innerText.replace(/\\s+/g, ' ').trim() : '' });
  })()`);
  log('card', out.card);
  out.shot = await shotSafe('s_17_campaign_list_def.png');
  out.ok = !!(out.row && out.row.found && out.row.hasDef && out.row.slotDef !== out.row.staticDef);
  fs.writeFileSync('F:\\sanguo\\work\\internal_affairs\\cdp_f17.json', JSON.stringify(out, null, 2), 'utf8');
  return out;
}
