/** probe: does a fresh --user-data-dir really start with empty localStorage? */
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;
const url = 'http://127.0.0.1:5199/web/city.html?city=%E4%BB%A3%E7%B8%A3&gold=3000';
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\sanguo\\work\\_edge_probe_' + Date.now(),
  'about:blank',
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let id = 0; const pend = new Map();
function send(method, params = {}) {
  const i = ++id; ws.send(JSON.stringify({ id: i, method, params }));
  return new Promise((res, rej) => pend.set(i, { res, rej }));
}
async function ev(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  return r?.result?.value;
}
try {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.rej(new Error(JSON.stringify(m.error))) : p.res(m.result); }
  };
  for (let i = 0; i < 60; i += 1) {
    if (await ev('document.readyState') === 'complete' && await ev('!!window.__city')) break;
    await sleep(250);
  }
  console.log('keys =', await ev('JSON.stringify(Object.keys(localStorage))'));
  console.log('legacy =', await ev("(localStorage.getItem('sanguo_campaign_v1')||'').slice(0,160)"));
  console.log('save.gold =', await ev('window.__city.save.gold'));
  console.log('city troops =', await ev('window.__city.save.cities["代縣"].troops'));
  console.log('save.ts =', await ev('window.__city.save.ts'));
  console.log('now =', Date.now());
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
