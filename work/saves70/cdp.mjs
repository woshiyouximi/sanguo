// CDP probe: capture console/exception + evaluate page state.
// Usage: node cdp.mjs [port] [urlSubstr]
const port = process.argv[2] || '9333';
const want = process.argv[3] || 'campaign.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function list() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const arr = await res.json();
      const t = arr.find((x) => x.type === 'page' && String(x.url).includes(want));
      if (t) return t;
      if (i === 79) return arr.find((x) => x.type === 'page') || null;
    } catch (e) { /* not up yet */ }
    await sleep(250);
  }
  return null;
}

const target = await list();
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
  let msg;
  try { msg = JSON.parse(String(ev.data)); } catch { return; }
  if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); return; }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    events.push({
      kind: 'exception',
      text: d.text || '',
      desc: (d.exception && (d.exception.description || d.exception.value)) || '',
      url: d.url, line: d.lineNumber, col: d.columnNumber,
      stack: (d.stackTrace && d.stackTrace.callFrames || []).slice(0, 4).map((f) => `${f.url}:${f.lineNumber + 1}`),
    });
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    events.push({ kind: msg.params.type, args: msg.params.args.map((a) => a.value ?? a.description ?? a.type).slice(0, 4) });
  } else if (msg.method === 'Log.entryAdded') {
    events.push({ kind: 'log', level: msg.params.entry.level, text: msg.params.entry.text, url: msg.params.entry.url });
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
// reload so we capture boot-time errors
await send('Page.reload', { ignoreCache: true });
await sleep(7000);

const expr = `(() => {
  const q = (s) => document.querySelector(s);
  const ls = [];
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); ls.push([k, (localStorage.getItem(k) || '').length]); } } catch (e) {}
  let saves = null;
  try {
    const raw = localStorage.getItem('sanguo_saves_v1');
    const st = raw ? JSON.parse(raw) : null;
    saves = st ? {
      v: st.v, last: st.last,
      filled: (st.slots || []).filter(Boolean).length,
      metas: (st.slots || []).map((e) => e ? { id: e.id, name: e.name, monarch: e.monarch, forceCount: e.forceCount, cityCount: e.cityCount, generalCount: e.generalCount, month: e.month, scenario: e.scenario } : null),
    } : null;
  } catch (e) { saves = String(e); }
  return JSON.stringify({
    title: document.title,
    badge: q('#slotBadge') ? q('#slotBadge').textContent : null,
    cityRows: document.querySelectorAll('.city').length,
    cityNames: [...document.querySelectorAll('.city .n')].slice(0, 4).map((x) => x.textContent),
    slotRows: q('#slotRows') ? q('#slotRows').children.length : null,
    sheetOpen: q('#saveSheet') ? getComputedStyle(q('#saveSheet')).display : null,
    saveSub: q('#saveSub') ? q('#saveSub').textContent : null,
    dbg: q('#marchdbg') ? (q('#marchdbg').textContent || '').slice(-1200) : null,
    ls, saves,
  });
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
console.log(JSON.stringify({ events, state: r.result && r.result.result && r.result.result.value }, null, 1));
ws.close();
setTimeout(() => process.exit(0), 200);
