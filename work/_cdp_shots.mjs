/**
 * work/_cdp_shots.mjs - click each of the four bottom sheets (move/appoint/intel/deploy)
 * and screenshot it, collecting JS exceptions on the way.
 * usage: node work/_cdp_shots.mjs [cityName] [tag]
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const cityName = process.argv[2] || '\u4EE3\u7E23'; // 代縣
const tag = process.argv[3] || 'dai';
const base = 'http://127.0.0.1:5199/web/city.html?city=' + encodeURIComponent(cityName) + '&gold=3000';

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_cdp2',
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws; let msgId = 0; const pending = new Map(); const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  return r?.result?.value;
}
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('shot ->', file);
}

try {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(base)}`, { method: 'PUT' })).json();
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
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

  for (let i = 0; i < 80; i += 1) {
    if (await evalJs('document.readyState') === 'complete' && await evalJs('!!window.__city')) break;
    await sleep(250);
  }

  const cases = [
    ['\u60C5\u5831', `work/_shot_${tag}_intel.png`],   // 情報
    ['\u4EFB\u547D', `work/_shot_${tag}_appoint.png`], // 任命
    ['\u79FB\u52D5', `work/_shot_${tag}_move.png`],    // 移動
    ['\u51FA\u5F81', `work/_shot_${tag}_deploy.png`],  // 出征
  ];
  for (const [cmd, file] of cases) {
    await evalJs(`(() => { const b=[...document.querySelectorAll('.cmd')].find(x=>x.dataset.cmd==='${cmd}'); b && b.click(); return !!b; })()`);
    await sleep(350);
    await shot(file);
    await evalJs('document.getElementById("sheetCancel").click()');
    await sleep(200);
  }

  const appt = await evalJs(`(() => {
    const b=[...document.querySelectorAll('.cmd')].find(x=>x.dataset.cmd==='\u4EFB\u547D');
    b.click();
    const pick=[...document.querySelectorAll('#sheetBody .pick')].find(x=>x.dataset.role==='major');
    if (!pick) return 'no-pick';
    pick.click();
    document.getElementById('sheetOk').click();
    return JSON.stringify(window.__city.save.appointed);
  })()`);
  console.log('appointed after click =', appt);
  console.log('errors =', errors.length ? errors : 'none');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
