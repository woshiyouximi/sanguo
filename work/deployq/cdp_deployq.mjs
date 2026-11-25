/**
 * work/deployq/cdp_deployq.mjs —— 出陣隊列瀏覽器實測（R94 / project/162 驗收⑤）
 *
 * 驗的四件事：
 *   1. deploy.html 真的畫出「出 陣 順 序 5 行」，且舊檔（沒有 deployQueue）能自動生成；
 *   2. 第 3 槽「上移」兩次能變成第 1 槽；
 *   3. 寫回的是 legacy 鍵 `sanguo_campaign_v1` 的 deployQueue，值順序正確；
 *   4. 刷新（Page.reload）後順序仍在。
 *
 * 用法：先起 `node game/web/serve.mjs 5301`，再 `node work/deployq/cdp_deployq.mjs`
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9421;
const BASE = 'http://127.0.0.1:5301/web/deploy.html?city=%E5%8D%97%E7%9A%AE'; // 南皮
const OUT = 'F:\\sanguo\\work\\deployq';
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${OUT}\\edgeprof`,
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
async function shot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const file = `${OUT}\\${name}.png`;
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('shot ->', file);
  return file;
}
const rows = `[...document.querySelectorAll('#qlist .qrow')].map(r => r.querySelector('.qn').textContent.replace(/主將/g, '').trim())`;

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

  // 清掉殘留存檔，確保走「舊檔沒有 deployQueue」的自動生成分支
  await sleep(600);
  await evalJs(`localStorage.removeItem('sanguo_campaign_v1'); localStorage.removeItem('sanguo_campaign_v1'); 1`);
  await send('Page.reload', { ignoreCache: true });

  for (let i = 0; i < 120; i += 1) {
    const ok = await evalJs(`document.readyState === 'complete' && document.querySelectorAll('#qlist .qrow').length > 0`);
    if (ok) break;
    await sleep(250);
  }

  const before = await evalJs(rows);
  console.log('before  =', JSON.stringify(before));
  await shot('01_before');

  // 第 3 槽上移到第 1 槽：先 2→1，再 1→0
  const order = [
    await evalJs(`(() => { const b = document.querySelector('[data-qmove="2:-1"]'); if (!b) return 'no-btn-2up'; b.click(); return 'ok'; })()`),
    await sleep(200),
    await evalJs(`(() => { const b = document.querySelector('[data-qmove="1:-1"]'); if (!b) return 'no-btn-1up'; b.click(); return 'ok'; })()`),
    await sleep(250),
  ];
  console.log('moves   =', JSON.stringify(order));

  const after = await evalJs(rows);
  console.log('after   =', JSON.stringify(after));
  await shot('02_after_move');

  const saved = await evalJs(`(() => {
    const raw = localStorage.getItem('sanguo_campaign_v1');
    if (!raw) return 'no-legacy';
    const save = JSON.parse(raw);
    return JSON.stringify(save.deployQueue || null);
  })()`);
  console.log('legacy.deployQueue =', saved);

  // 刷新後順序仍在
  await send('Page.reload', { ignoreCache: true });
  for (let i = 0; i < 120; i += 1) {
    const ok = await evalJs(`document.readyState === 'complete' && document.querySelectorAll('#qlist .qrow').length > 0`);
    if (ok) break;
    await sleep(250);
  }
  const reloaded = await evalJs(rows);
  console.log('reload  =', JSON.stringify(reloaded));
  await shot('03_after_reload');

  const first = Array.isArray(after) ? after[0] : '';
  const kept = Array.isArray(reloaded) && JSON.stringify(reloaded) === JSON.stringify(after);
  console.log('RESULT  =', JSON.stringify({
    autoGenerated: Array.isArray(before) && before.length === 5,
    moved: Array.isArray(after) && after[0] === before[2] && after[1] === before[0] && after[2] === before[1],
    persisted: typeof saved === 'string' && saved.includes(before[2]),
    firstAfterReload: first,
    reloadKept: kept,
    errors: errors.slice(0, 5),
  }));
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
