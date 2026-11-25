// V1 letterbox 自检：等宽高比 fit 后 60 城命中率、滚动条、画布几何。
// 用法：node v1_check.mjs [port] [urlSubstr]
const port = process.argv[2] || '9350';
const want = process.argv[3] || 'campaign.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function list() {
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const arr = await res.json();
      const t = arr.find((x) => x.type === 'page' && String(x.url).includes(want));
      if (t) return t;
    } catch { /* not up yet */ }
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
      url: d.url, line: d.lineNumber,
      stack: (d.stackTrace && d.stackTrace.callFrames || []).slice(0, 3).map((f) => `${f.url}:${f.lineNumber + 1}`),
    });
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    if (msg.params.type === 'error' || msg.params.type === 'warning') {
      events.push({ kind: msg.params.type, args: msg.params.args.map((a) => a.value ?? a.description ?? a.type).slice(0, 4) });
    }
  } else if (msg.method === 'Log.entryAdded') {
    if (msg.params.entry.level === 'error') events.push({ kind: 'log', text: msg.params.entry.text, url: msg.params.entry.url });
  }
});

await new Promise((res, rej) => {
  ws.addEventListener('open', res);
  ws.addEventListener('error', rej);
});
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await sleep(6500);

const expr = `(() => {
  const v1 = window.__v1;
  const q = (s) => document.querySelector(s);
  const rect = (el) => { const b = el.getBoundingClientRect(); return { x: +b.x.toFixed(2), y: +b.y.toFixed(2), w: +b.width.toFixed(2), h: +b.height.toFixed(2) }; };
  const de = document.documentElement;
  const pr = v1 ? v1.plotRect() : null;
  const view = v1 ? v1.view() : null;
  const cityInfo = { n: 0, hits: 0, misses: [], inside: 0 };
  if (v1) {
    const cs = v1.cities();
    cityInfo.n = cs.length;
    for (const c of cs) {
      const [sx, sy] = v1.toScreen(c.xy[0], c.xy[1]);
      if (sx >= 0 && sx <= view.w && sy >= 0 && sy <= view.h) cityInfo.inside++;
      const hit = v1.hit(sx, sy);
      if (hit === c.name) cityInfo.hits++;
      else cityInfo.misses.push({ want: c.name, got: hit, sx: +sx.toFixed(1), sy: +sy.toFixed(1) });
    }
    cityInfo.misses = cityInfo.misses.slice(0, 6);
  }
  const band = pr ? { top: +pr.y.toFixed(2), bottom: +(view.h - pr.y - pr.h).toFixed(2), imgW: +pr.w.toFixed(2), imgH: +pr.h.toFixed(2), s: +pr.s.toFixed(5) } : null;
  // 取样：看上下带是不是纯黑/纯透明（画布像素在带中央与角落各取一点）
  let px = null;
  try {
    const cv = q('#map') || q('canvas');
    const g = cv.getContext('2d');
    const at = (x, y) => { const d = g.getImageData(Math.round(x), Math.round(y), 1, 1).data; return [d[0], d[1], d[2], d[3]]; };
    px = { topMid: at(view.w / 2, Math.max(2, pr.y / 2)), topCorner: at(4, 4), botMid: at(view.w / 2, Math.min(view.h - 3, pr.y + pr.h + (view.h - pr.y - pr.h) / 2)), botCorner: at(4, view.h - 4) };
  } catch (e) { px = String(e); }
  return JSON.stringify({
    title: document.title,
    vp: { innerW: innerWidth, innerH: innerHeight, dpr: devicePixelRatio },
    doc: { sw: de.scrollWidth, sh: de.scrollHeight, cw: de.clientWidth, ch: de.clientHeight },
    bodyOverflowX: getComputedStyle(document.body).overflowX,
    stage: q('#stage') ? rect(q('#stage')) : null,
    mapwrap: q('#mapwrap') ? rect(q('#mapwrap')) : null,
    canvas: q('#map') ? rect(q('#map')) : null,
    canvasPx: q('#map') ? { w: q('#map').width, h: q('#map').height } : null,
    view, plotRect: pr ? { x: +pr.x.toFixed(2), y: +pr.y.toFixed(2), w: +pr.w.toFixed(2), h: +pr.h.toFixed(2), s: +pr.s.toFixed(5) } : null,
    band, cityInfo, px,
    hasBgMap: !!q('#bgmap') && getComputedStyle(q('#bgmap')).display !== 'none',
    bgMapRect: q('#bgmap') ? rect(q('#bgmap')) : null,
  });
})()`;

const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
const val = r.result && r.result.result && r.result.result.value;
console.log(JSON.stringify({ events, state: val ? JSON.parse(val) : null, raw: val ? null : r.result }, null, 1));
ws.close();
setTimeout(() => process.exit(0), 200);
