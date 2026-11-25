// 老檔遷移自證：寫一份「無版本」的舊存檔到 localStorage，重載頁面，檢查槽 1 + 提示 + 無例外。
// 用法：node cdp_legacy.mjs [port]
const port = process.argv[2] || '9340';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const arr = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const t = arr.find((x) => x.type === 'page' && String(x.url).includes('campaign.html'));
      if (t) return t;
    } catch { /* not up */ }
    await sleep(250);
  }
  return null;
}

const target = await findTarget();
if (!target) { console.log(JSON.stringify({ error: 'no target' })); process.exit(2); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
const events = [];
let id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res) => {
  const mid = ++id;
  pending.set(mid, res);
  ws.send(JSON.stringify({ id: mid, method, params }));
});

ws.addEventListener('message', (ev) => {
  let m;
  try { m = JSON.parse(String(ev.data)); } catch { return; }
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Runtime.exceptionThrown') {
    const d = m.params.exceptionDetails;
    events.push({ kind: 'exception', desc: (d.exception && (d.exception.description || d.exception.value)) || d.text, line: d.lineNumber + 1 });
  } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    events.push({ kind: 'log', text: m.params.entry.text });
  }
});

await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');

// 舊格式：沒有 v、沒有 60 城摘要、沒有 forces/generalLevel，只有 campaign 老鍵
const legacy = {
  seeded: true,
  scenario: 1,
  month: 7,
  gold: 2222,
  wins: 3,
  losses: 1,
  defWins: 1,
  owned: ['襄平', '北平', '代縣'],
  cities: { 襄平: { troops: 100, pop: 40000, money: 900 } },
  ts: 1700000000000,
  king: '公孫瓚',
};
const setup = await send('Runtime.evaluate', {
  expression: `(() => {
    localStorage.clear();
    localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(JSON.stringify(legacy))});
    return Object.keys(localStorage);
  })()`,
  returnByValue: true,
});

await send('Page.reload', { ignoreCache: true });
await sleep(6500);

const expr = `(() => {
  const q = (s) => document.querySelector(s);
  let st = null;
  try { st = JSON.parse(localStorage.getItem('sanguo_saves_v1') || 'null'); } catch (e) { st = 'bad-json'; }
  const s1 = st && st.slots ? st.slots[0] : null;
  return JSON.stringify({
    badge: q('#slotBadge') ? q('#slotBadge').textContent : null,
    notice: q('#notice') ? { hidden: q('#notice').hidden, text: q('#notice').textContent } : null,
    headerYm: q('#ym') ? q('#ym').textContent : null,
    headerGold: q('#gold') ? q('#gold').textContent : null,
    cityRows: document.querySelectorAll('.city').length,
    store: st ? { v: st.v, last: st.last, filled: (st.slots || []).filter(Boolean).length } : null,
    slot1: s1 ? {
      v: s1.snapshot && s1.snapshot.v,
      month: s1.snapshot && s1.snapshot.month,
      gold: s1.snapshot && s1.snapshot.gold,
      monarch: s1.snapshot && (s1.snapshot.monarch || s1.snapshot.king),
      cities: s1.snapshot && Object.keys(s1.snapshot.cities || {}).length,
      cityKeys: s1.snapshot && Object.keys(s1.snapshot.cities || {}).slice(0, 3),
      firstCity: s1.snapshot && Object.values(s1.snapshot.cities || {})[0],
      generals: s1.snapshot && Object.keys(s1.snapshot.generalLevel || {}).length,
      forces: s1.snapshot && Object.keys(s1.snapshot.forces || {}).length,
      meta: { monarch: s1.monarch, cityCount: s1.cityCount, forceCount: s1.forceCount, generalCount: s1.generalCount },
      parts: s1.name,
    } : null,
  });
})()`;
const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify({ setup: setup.result && setup.result.result && setup.result.result.value, events, state: JSON.parse(r.result.result.value) }, null, 1));
ws.close();
setTimeout(() => process.exit(0), 200);
