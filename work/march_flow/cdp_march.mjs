/**
 * F23/F24 实机取证（Edge headless + CDP，端口 9352，profile work\.edgeprof_marchflow）。
 *
 * 三轮：
 *   A. 城兵 200：deploy 显示「上陣 兵 10 / 城中有 200」→ 出征后陈留 190 → end=win 战后 195
 *   B. 城兵 4  ：deploy 显示「上陣 兵 4 / 城中有 4」  → 出征后 0      → end=lose 战后 0
 *   C. 兵团 40 ：deploy 显示「上陣 兵 10 / 兵团 40」（不扣城）→ end=win 战后 200+20=220
 *
 * 输出：work\march_flow\cdp_result.json + *.png。截图目录 = OUT。
 * 用法：node work\march_flow\cdp_march.mjs
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
  '--mute-audio', '--autoplay-policy=no-user-gesture-required',
  '--disable-sync', '--disable-features=msEdgeSyncPromo,EdgeSyncPromo',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });

let ws = null;
let msgId = 0;
const pending = new Map();
const errors = [];
const results = [];

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
  return file;
}
async function tabUrl() {
  // 用執行上下文裡的 location.href 讀「我們這一頁」的 URL：/json/list 的第一個 page 可能是
  // Edge 自己開的 edge:// 對話框（第一次跑 headless 就會冒出 sync-confirmation），不能用它判導航。
  try { return String(await evalJs('location.href')); } catch { /* 導航中上下文被銷毀 */ }
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    return list.find((t) => t.type === 'page' && t.url.includes('127.0.0.1'))?.url || '';
  } catch { return ''; }
}
async function waitReady(expr, timeout = 45000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    await sleep(300);
    try {
      if (await evalJs(`document.readyState === 'complete' && !!(${expr})`)) return true;
    } catch { /* 导航中：执行上下文被销毁，继续等 */ }
  }
  return false;
}
async function goto(url, expr) {
  await send('Page.navigate', { url });
  return waitReady(expr);
}
async function seed(save) {
  await goto(`${BASE}/web/saves.js`, 'document.body');
  await evalJs(`localStorage.setItem(${JSON.stringify(KEY)}, ${JSON.stringify(JSON.stringify(save))})`);
}
async function readSave() {
  return JSON.parse(await evalJs(`localStorage.getItem(${JSON.stringify(KEY)}) || '{}'`));
}
const deploySnap = `(() => {
  const g = (id) => document.getElementById(id);
  const s = (id) => (g(id) ? g(id).textContent.replace(/\\s+/g, ' ').trim() : null);
  let save = {};
  try { save = JSON.parse(localStorage.getItem('${KEY}') || '{}'); } catch {}
  return JSON.stringify({
    cap: s('numcap'), now: s('numnow'), cavcap: s('cavcap'), cavnow: s('cavnow'),
    total: s('numtotal'), hint: s('numhint'), gosub: s('gosub'), intel: s('intel'),
    cities: save.cities || null,
  });
})()`;

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
    if (m.method === 'Runtime.exceptionThrown') {
      errors.push(m.params?.exceptionDetails?.exception?.description
        || m.params?.exceptionDetails?.text || 'exception');
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

  // ---------------------------------------------------------------- A：城兵 200（等级上限 10 才是瓶颈）
  const seedA = {
    scenario: 1, owned: ['陳留'], wins: 0, losses: 0, ts: Date.now(),
    cities: { 陳留: { troops: 200, prep: 0, pop: 211000, money: 3832 } },
  };
  await seed(seedA);
  const urlA = `${BASE}/web/deploy.html?city=${enc('南皮')}&from=${enc('陳留')}&a=${enc('夏侯惇')}&bsoldiers=100`;
  if (!await goto(urlA, `document.getElementById('numtotal') && document.getElementById('numtotal').textContent.includes('兵')`)) {
    throw new Error('deploy.html（A 轮）没加载出来');
  }
  await sleep(500);
  const a1 = JSON.parse(await evalJs(deploySnap));
  await shot('deploy_city_200.png');
  await evalJs(`document.getElementById('go').click()`);
  let urlA2 = '';
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    urlA2 = await tabUrl();
    if (urlA2.includes('index.html')) break;
  }
  await sleep(600);
  const a2 = await readSave();
  results.push({ round: 'A', seed: seedA, deploy: a1, outUrl: urlA2, afterDeduct: a2.cities });

  // 战后：?dev=1&sim=5&end=win（main.js 的 forceEnd → endBattle → writeBackCampaign）
  const winUrl = urlA2 + '&dev=1&sim=5&end=win';
  await goto(winUrl, `true`);
  let a3 = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(300);
    try {
      const s = await readSave();
      if (s.lastBattle && s.lastBattle.ts) { a3 = s; break; }
    } catch { /* 导航中 */ }
  }
  if (!a3) throw new Error('A 轮战后写回没发生');
  await sleep(800);
  await shot('battle_win_settle.png');
  results.push({
    round: 'A-win', battleUrl: winUrl,
    troops: a3.cities['陳留'].troops,
    lastBattle: a3.lastBattle, wins: a3.wins, log: a3.log,
  });

  // ---------------------------------------------------------------- B：城兵 4（城兵才是瓶颈）
  const seedB = {
    scenario: 1, owned: ['陳留'], wins: 0, losses: 0, ts: Date.now(),
    cities: { 陳留: { troops: 4, prep: 0, pop: 211000, money: 3832 } },
  };
  await seed(seedB);
  if (!await goto(urlA, `document.getElementById('numtotal') && document.getElementById('numtotal').textContent.includes('兵')`)) {
    throw new Error('deploy.html（B 轮）没加载出来');
  }
  await sleep(500);
  const b1 = JSON.parse(await evalJs(deploySnap));
  await shot('deploy_city_4.png');
  await evalJs(`document.getElementById('go').click()`);
  let urlB2 = '';
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    urlB2 = await tabUrl();
    if (urlB2.includes('index.html')) break;
  }
  await sleep(600);
  const b2 = await readSave();
  results.push({ round: 'B', seed: seedB, deploy: b1, outUrl: urlB2, afterDeduct: b2.cities });

  await goto(urlB2 + '&dev=1&sim=5&end=lose', `true`);
  let b3 = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(300);
    try {
      const s = await readSave();
      if (s.lastBattle && s.lastBattle.ts) { b3 = s; break; }
    } catch { /* 导航中 */ }
  }
  if (!b3) throw new Error('B 轮战后写回没发生');
  await sleep(800);
  await shot('battle_lose_settle.png');
  results.push({ round: 'B-lose', troops: b3.cities['陳留'].troops, lastBattle: b3.lastBattle, losses: b3.losses, log: b3.log });

  // ---------------------------------------------------------------- C：兵团 40（dispatchArmy 已扣城兵，deploy 不能再扣）
  const seedC = {
    scenario: 1, owned: ['陳留'], wins: 0, losses: 0, ts: Date.now(),
    cities: { 陳留: { troops: 200, prep: 0, pop: 211000, money: 3832 } },
    armies: [{
      id: 'a1', side: 'A', from: '陳留', to: '南皮', pathIndex: 0, progress: 1,
      troops: 40, general: '夏侯惇', officers: ['夏侯惇'], advisor: '', stationed: false,
    }],
  };
  await seed(seedC);
  const urlC = `${BASE}/web/deploy.html?city=${enc('南皮')}&from=${enc('陳留')}&a=${enc('夏侯惇')}&army=a1&bsoldiers=100`;
  if (!await goto(urlC, `document.getElementById('numtotal') && document.getElementById('numtotal').textContent.includes('兵')`)) {
    throw new Error('deploy.html（C 轮）没加载出来');
  }
  await sleep(500);
  const c1 = JSON.parse(await evalJs(deploySnap));
  await shot('deploy_army_40.png');
  await evalJs(`document.getElementById('go').click()`);
  let urlC2 = '';
  for (let i = 0; i < 40; i += 1) {
    await sleep(250);
    urlC2 = await tabUrl();
    if (urlC2.includes('index.html')) break;
  }
  await sleep(600);
  const c2 = await readSave();
  results.push({ round: 'C', deploy: c1, outUrl: urlC2, afterDeduct: { cities: c2.cities, armies: c2.armies } });

  await goto(urlC2 + '&dev=1&sim=5&end=win', `true`);
  let c3 = null;
  for (let i = 0; i < 80; i += 1) {
    await sleep(300);
    try {
      const s = await readSave();
      if (s.lastBattle && s.lastBattle.ts) { c3 = s; break; }
    } catch { /* 导航中 */ }
  }
  if (!c3) throw new Error('C 轮战后写回没发生');
  await sleep(800);
  await shot('battle_army_settle.png');
  results.push({
    round: 'C-win', troops: c3.cities['陳留'].troops, armies: c3.armies || [],
    lastBattle: c3.lastBattle, wins: c3.wins, log: c3.log,
  });

  writeFileSync(`${OUT}\\cdp_result.json`, JSON.stringify({ results, errors }, null, 2), 'utf8');
  console.log('OK rounds=' + results.map((r) => r.round).join(','));
  console.log('errors=' + errors.length);
} catch (err) {
  writeFileSync(`${OUT}\\cdp_result.json`, JSON.stringify({ results, errors, fatal: String(err && err.stack || err) }, null, 2), 'utf8');
  console.error('FATAL', String(err && err.message || err));
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
