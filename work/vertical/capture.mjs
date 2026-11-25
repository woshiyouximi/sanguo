// 连接由 capture.ps1 用 Start-Process 启动的 Edge，逐页、逐尺寸截图并收集控制台/布局证据。
// 用法: node capture.mjs <port>
import { writeFileSync } from 'node:fs';

const PORT = Number(process.argv[2] || 9351);
const OUT = 'F:\\sanguo\\work\\vertical';
const PAGES = ['index', 'items', 'deploy', 'city'];
const SIZES = [[750, 1334], [1200, 900]];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('no page target');
}

const page = await target();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let seq = 0;
const pending = new Map();
let logs = [];
let netFail = [];
let httpBad = [];

ws.addEventListener('message', (ev) => {
  const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
  if (m.id && pending.has(m.id)) {
    const { res, rej } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) rej(new Error(m.error.message)); else res(m.result);
    return;
  }
  const p = m.params || {};
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = (p.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[console.${p.type}] ${text}`);
  } else if (m.method === 'Runtime.exceptionThrown') {
    const d = p.exceptionDetails || {};
    logs.push(`[exception] ${d.exception?.description || d.text || '?'}`);
  } else if (m.method === 'Log.entryAdded') {
    const e = p.entry || {};
    if (e.level === 'error' || e.level === 'warning') logs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
  } else if (m.method === 'Network.loadingFailed') {
    netFail.push(`${p.type || '?'} ${p.errorText || '?'} ${p.requestId || ''}`);
  } else if (m.method === 'Network.responseReceived') {
    const r = p.response || {};
    if (r.status >= 400) httpBad.push(`${r.status} ${r.url}`);
  }
});

const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { res, rej });
  ws.send(JSON.stringify({ id, method, params }));
});

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Network.enable');

const PROBE = `JSON.stringify((() => {
  const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), b: +r.bottom.toFixed(1) }; };
  const de = document.documentElement;
  const out = {
    vp: [innerWidth, innerHeight],
    doc: { sw: de.scrollWidth, sh: de.scrollHeight, bw: document.body.scrollWidth },
    overflowX: de.scrollWidth - innerWidth,
    stage: R(document.querySelector('#stage')),
    header: R(document.querySelector('header')),
    footer: R(document.querySelector('footer')),
  };
  const canvas = document.querySelector('canvas#stage');
  if (canvas) out.canvas = R(canvas);
  const eb = document.querySelector('#error .box');
  if (eb) out.errorBox = { maxWidth: getComputedStyle(eb).maxWidth, w: R(eb).w };
  const b = document.querySelector('.body');
  if (b) { out.body = { clientH: b.clientHeight, scrollH: b.scrollHeight, overflowY: getComputedStyle(b).overflowY }; }
  const secs = [...document.querySelectorAll('#stage .sec')];
  if (secs.length) {
    const ft = out.footer ? out.footer.y : innerHeight;
    out.sections = secs.map((s) => ({ h: +s.getBoundingClientRect().height.toFixed(1), b: +s.getBoundingClientRect().bottom.toFixed(1), ty: (s.querySelector('h2') || {}).textContent?.trim().slice(0, 10) || '' }));
    out.sectionsFullyVisible = secs.filter((s) => s.getBoundingClientRect().bottom <= ft + 0.5).length;
  }
  const vs = document.querySelector('#vs');
  if (vs) out.vs = R(vs);
  const ah = document.querySelector('.art-hall');
  if (ah) { const cs = getComputedStyle(ah); out.artHall = { rect: R(ah), bg: cs.backgroundImage.slice(0, 90) }; }
  const lc = document.querySelector('.listcol'), dc = document.querySelector('.detcol');
  if (lc) out.cols = { list: R(lc), det: R(dc) };
  return out;
})())`;

const report = [];
for (const p of PAGES) {
  for (const [w, h] of SIZES) {
    logs = []; netFail = []; httpBad = [];
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
    await send('Page.navigate', { url: `http://127.0.0.1:5173/web/${p}.html` });
    await sleep(5200);
    const ev = await send('Runtime.evaluate', { expression: PROBE, returnByValue: true });
    const probe = JSON.parse(ev.result.value);
    const errs = logs.filter((l) => /\[exception\]|\[console\.error\]|\[log\.error\]|Failed to load|Uncaught|ERR_/i.test(l));
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = `${OUT}\\${p}_${w}.png`;
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    const row = { page: p, size: `${w}x${h}`, file, probe, errors: errs, netFail, httpBad, ok: errs.length === 0 && netFail.length === 0 && httpBad.length === 0 && probe.overflowX <= 0 };
    report.push(row);
    console.log(`--- ${p} ${w}x${h} ---`);
    console.log(JSON.stringify({ probe, errors: errs, netFail, httpBad, ok: row.ok }));
  }
}
writeFileSync(`${OUT}\\capture_report.json`, JSON.stringify(report, null, 2));
console.log('WROTE', `${OUT}\\capture_report.json`);
ws.close();
process.exit(0);
