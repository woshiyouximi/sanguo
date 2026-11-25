/**
 * 兵力区截图（F23 的 UI 验收点：「上陣 兵 X / 城中有 Y」在页面底部，首屏看不到，要滚过去）。
 * 输出：deploy_city_200_troops.png / deploy_city_4_troops.png / deploy_army_40_troops.png
 * 用法：node work\march_flow\cdp_scroll.mjs（需要 8823 静态服务器在跑）
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
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}\\${file}`, Buffer.from(r.data, 'base64'));
  console.log('shot -> ' + file);
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
async function seed(save) {
  await goto(`${BASE}/web/saves.js`, 'document.body');
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(save))})`);
}
async function shoot(troops, armies, url, file) {
  const save = {
    scenario: 1, owned: ['陳留'], wins: 0, losses: 0, ts: Date.now(),
    cities: { 陳留: { troops, prep: 0, pop: 211000, money: 3832 } },
  };
  if (armies) save.armies = armies;
  await seed(save);
  if (!await goto(url, `document.getElementById('numtotal') && document.getElementById('numtotal').textContent.includes('兵')`)) {
    throw new Error('deploy.html 没加载出来: ' + file);
  }
  await sleep(400);
  await evalJs(`(() => { const el = document.getElementById('numtotal'); el.scrollIntoView({ block: 'center' }); return el.textContent; })()`);
  await sleep(400);
  await shot(file);
  return JSON.parse(await evalJs(`(() => {
    const g = (id) => document.getElementById(id);
    const s = (id) => (g(id) ? g(id).textContent.replace(/\\s+/g, ' ').trim() : null);
    return JSON.stringify({ total: s('numtotal'), hint: s('numhint'), cap: s('numcap'), cavcap: s('cavcap') });
  })()`));
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

  const cityUrl = `${BASE}/web/deploy.html?city=${enc('南皮')}&from=${enc('陳留')}&a=${enc('夏侯惇')}&bsoldiers=100`;
  const armyUrl = `${BASE}/web/deploy.html?city=${enc('南皮')}&from=${enc('陳留')}&a=${enc('夏侯惇')}&army=a1&bsoldiers=100`;
  const army = [{
    id: 'a1', side: 'A', from: '陳留', to: '南皮', pathIndex: 0, progress: 1,
    troops: 40, general: '夏侯惇', officers: ['夏侯惇'], advisor: '', stationed: false,
  }];
  const out = {
    city200: await shoot(200, null, cityUrl, 'deploy_city_200_troops.png'),
    city4: await shoot(4, null, cityUrl, 'deploy_city_4_troops.png'),
    army40: await shoot(200, army, armyUrl, 'deploy_army_40_troops.png'),
  };
  writeFileSync(`${OUT}\\cdp_scroll.json`, JSON.stringify(out, null, 2), 'utf8');
  console.log('OK');
} catch (err) {
  console.error('FATAL', String(err && err.message || err));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
