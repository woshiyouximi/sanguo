/**
 * work/_shot1.mjs —— 单张截图：node work/_shot1.mjs <url> <outfile.png> [waitMs] [simSeed]
 * 纯 CDP，不播种 localStorage（调用前页面自己读档）。
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9342;
const url = process.argv[2];
const out = process.argv[3];
const waitMs = Number(process.argv[4] || 2600);
if (!url || !out) { console.error('usage: node work/_shot1.mjs <url> <out.png> [waitMs]'); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\sanguo\\work\\_edge_one_' + Date.now(),
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });

let ws; let msgId = 0; const pending = new Map(); const errors = [];
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};
const evalP = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};

try {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') errors.push('EXC ' + (m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text));
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('ERR ' + (m.params.args || []).map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push('LOG ' + m.params.entry.text);
  };
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 2, mobile: false });
  try { await send('Page.bringToFront'); } catch { /* ignore */ }
  await send('Page.navigate', { url });
  for (let i = 0; i < 60; i += 1) {
    try { if ((await evalP('document.readyState', false)) === 'complete') break; } catch { /* nav */ }
    await sleep(200);
  }
  await sleep(waitMs);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(out, Buffer.from(r.data, 'base64'));
  console.log('shot ->', out, '| errors:', errors.length);
  errors.slice(0, 6).forEach((e) => console.log('   ', e.slice(0, 200)));
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
