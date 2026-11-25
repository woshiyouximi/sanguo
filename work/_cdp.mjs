/**
 * work/_cdp.mjs - run city.html's ?do= sequence in headless Edge and print the
 * <pre id="dump"> JSON (the before/after save diff).
 * usage: node work/_cdp.mjs [url]
 */
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9336;
const url = process.argv[2]
  || 'http://127.0.0.1:5199/web/city.html?city=%E4%BB%A3%E7%B8%A3&gold=3000&do=develop,develop,recruit,search,search&dump=1';

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\sanguo\\work\\_edge_cdp_' + Date.now(),
  'about:blank',
], { stdio: 'ignore', detached: false });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitVersion() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('CDP not up');
}

let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  await waitVersion();
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const target = tab.webSocketDebuggerUrl || tab.targetId;

  ws = new WebSocket(target);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };

  // wait until the page finished the ?do= sequence (window.__city is set last)
  let ready = false;
  for (let i = 0; i < 80; i += 1) {
    const r = await send('Runtime.evaluate', { expression: 'document.readyState + "|" + (!!window.__city)', returnByValue: true });
    if (String(r?.result?.value) === 'complete|true') { ready = true; break; }
    await sleep(250);
  }
  if (!ready) throw new Error('page did not finish (window.__city missing)');

  const dump = await send('Runtime.evaluate', {
    expression: '(document.getElementById("dump")||{}).textContent || ""',
    returnByValue: true,
  });
  const text = String(dump?.result?.value || '');
  const i = text.indexOf('<<<DUMP');
  const j = text.indexOf('DUMP>>>');
  if (i < 0 || j < 0) throw new Error('no dump content: ' + text.slice(0, 200));
  console.log(text.slice(i + 8, j).trim());
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
