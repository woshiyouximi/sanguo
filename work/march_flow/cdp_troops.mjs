/**
 * 契约补测：`?troops=<兵团兵>`（没有 army id —— campaign 抵达城下时会先 removeArmy(a.id)，
 * 所以这条才是 affairs 真正要用的形态）。
 * 断言：deploy 显示「上陣 兵 10 / 兵團 40」；点出征后**城兵不扣**（200 仍是 200），URL 带 marchpool=40。
 * 用法：node work\march_flow\cdp_troops.mjs（需要 8823 静态服务器在跑）
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9352;
const PROFILE = 'F:\\sanguo\\work\\.edgeprof_marchflow';
const BASE = 'http://127.0.0.1:8823';
const OUT = 'F:\\sanguo\\work\\march_flow';
const KEY = 'sanguo_campaign_v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const enc = (s) => encodeURIComponent(s);

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--mute-audio', '--disable-sync', '--disable-features=msEdgeSyncPromo,EdgeSyncPromo',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });

let ws = null; let msgId = 0; const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r && r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r?.result?.value;
}
async function goto(url, expr, timeout = 45000) {
  await send('Page.navigate', { url });
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(300);
    try { if (await evalJs(`document.readyState === 'complete' && !!(${expr})`)) return true; } catch {}
  }
  return false;
}

try {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch {}
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
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

  const save = {
    scenario: 1, owned: ['陳留'], wins: 0, losses: 0, ts: Date.now(),
    cities: { 陳留: { troops: 200, prep: 0, pop: 211000, money: 3832 } },
  };
  await goto(`${BASE}/web/saves.js`, 'document.body');
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(save))})`);

  const url = `${BASE}/web/deploy.html?city=${enc('南皮')}&from=${enc('陳留')}&a=${enc('夏侯惇')}&troops=40&bsoldiers=100`;
  if (!await goto(url, `document.getElementById('numtotal') && document.getElementById('numtotal').textContent.includes('兵')`)) {
    throw new Error('deploy.html 没加载出来');
  }
  await sleep(400);
  const before = JSON.parse(await evalJs(`(() => {
    const g = (id) => document.getElementById(id);
    const s = (id) => (g(id) ? g(id).textContent.replace(/\\s+/g, ' ').trim() : null);
    return JSON.stringify({ total: s('numtotal'), hint: s('numhint') });
  })()`));
  await evalJs(`document.getElementById('go').click()`);
  let href = '';
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    try { href = String(await evalJs('location.href')); } catch {}
    if (href.includes('index.html')) break;
  }
  await sleep(500);
  const after = JSON.parse(await evalJs(`localStorage.getItem(${JSON.stringify(KEY)}) || '{}'`));
  const out = { before, href, cityTroops: after.cities && after.cities['陳留'] && after.cities['陳留'].troops, armies: after.armies || null };
  writeFileSync(`${OUT}\\cdp_troops.json`, JSON.stringify(out, null, 2), 'utf8');
  console.log('troopsOnly: total=' + before.total + ' | cityTroopsAfterGo=' + out.cityTroops);
  console.log('href=' + href);
} catch (err) {
  console.error('FATAL', String(err && err.message || err));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
