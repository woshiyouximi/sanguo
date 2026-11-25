/**
 * work/deployq/cdp_campaign_smoke.mjs —— campaign.html 冒煙（我加了 DQ import 與 march 落盤）
 * 只驗「能載入、無 JS 例外、出征按鈕仍在」，不模擬整場行軍（那需要 2 座相鄰城）。
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9422;
const BASE = 'http://127.0.0.1:5301/web/campaign.html';
const OUT = 'F:\\sanguo\\work\\deployq';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}\\edgeprof_campaign`,
  '--window-size=750,1400', 'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r?.result?.value;
}

try {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(BASE)}`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
    } else if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params?.exceptionDetails?.exception?.description || m.params?.exceptionDetails?.text || 'exception');
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1400, deviceScaleFactor: 1, mobile: false });

  await sleep(4000);
  const state = await evalJs(`(() => {
    const keys = Object.keys(localStorage);
    const save = JSON.parse(localStorage.getItem('sanguo_campaign_v1') || '{}');
    return JSON.stringify({
      ready: document.readyState,
      title: document.title,
      canvas: document.querySelectorAll('canvas').length,
      owned: (save.owned || []).length,
      hasQueue: Array.isArray(save.deployQueue),
    });
  })()`);
  console.log('state =', state);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}\\04_campaign_smoke.png`, Buffer.from(r.data, 'base64'));
  console.log('RESULT =', JSON.stringify({ errors: errors.slice(0, 6) }));
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
