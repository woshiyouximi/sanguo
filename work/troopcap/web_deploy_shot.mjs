/**
 * work/troopcap/web_deploy_shot.mjs — 170：web 編成頁「步/騎兩欄」證據截圖
 *
 * 走正式流程：新遊戲 184 → 君主 公孫瓚 → 選中關卡 易京 → 出征(march) → deploy.html
 * 進頁後把 `?lv=26`（帶兵上限 100 步 + 30 騎 = 130）插進 URL 重載，
 * 再把騎兵滑桿拖到上限，拍「步/騎兩欄 + 目標城兵力」。
 *
 * 用法：node work/troopcap/web_deploy_shot.mjs
 * 產物：work/troopcap/web_deploy_twocol.png / web_deploy_twocol.txt
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
// 每次換 port + 臨時 profile：上一次若沒殺乾淨，會連到舊瀏覽器（帶著上一次的存檔）——
// 症狀是「pickerOpen=false 但 localStorage 已有存檔」。見本檔 git 之前的 170 記錄。
const PORT = 9460 + (Date.now() % 40);
const HTTP = 5199;
const ORIGIN = `http://127.0.0.1:${HTTP}`;
const OUT = 'work/troopcap';
const PROFILE = mkdtempSync(join(tmpdir(), 'sg-edge-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const YIJING = '\u6613\u4EAC';          // 易京
const GONGSUN = '\u516C\u5B6B\u74DA';   // 公孫瓚

let server = null;
try {
  if (!(await fetch(`${ORIGIN}/web/campaign.html`, { method: 'HEAD' })).ok) throw new Error('bad');
  console.log('[serve] 已在跑', ORIGIN);
} catch {
  server = spawn(process.execPath, ['work/serve.mjs', String(HTTP), 'F:\\sanguo\\game'], { stdio: 'ignore' });
  for (let i = 0; i < 40; i += 1) {
    try { if ((await fetch(`${ORIGIN}/web/campaign.html`, { method: 'HEAD' })).ok) break; } catch { /* wait */ }
    await sleep(200);
  }
  console.log('[serve] 已啟動', ORIGIN);
}

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });
child.on('exit', (c) => console.log('[edge] exit', c));

let ws; let msgId = 0;
const pending = new Map();
const errors = [];
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}
async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
  return r?.result?.value;
}
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('shot ->', file);
}
async function waitFor(expr, label, tries = 160) {
  for (let i = 0; i < tries; i += 1) {
    try { if (await evalJs(expr)) return true; } catch { /* mid-navigation */ }
    await sleep(250);
  }
  throw new Error(`等不到：${label}`);
}
const ACTS = '[...document.querySelectorAll("[data-act]")].map(b=>b.dataset.act).join(",")';

try {
  for (let i = 0; i < 120; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(
    `http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`${ORIGIN}/web/campaign.html`)}`,
    { method: 'PUT' },
  )).json();
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

  await waitFor('document.readyState === "complete"', 'readyState');
  await sleep(1500);

  // ① 新遊戲浮層：劇本 184 → 君主 公孫瓚
  await sleep(800);
  const pickerOpen = await evalJs('(() => { const s = document.getElementById("pickSheet"); return !!s && !s.hidden; })()');
  console.log('pickerOpen =', pickerOpen, '| localStorage keys =', await evalJs('Object.keys(localStorage).join(",")'));
  if (pickerOpen) {
    await evalJs('(() => { const c = document.querySelector(\'[data-pick="0"]\'); c && c.click(); return !!c; })()');
    await sleep(250);
    await evalJs('document.getElementById("btnPickStart").click()');
    await sleep(400);
    console.log('kingCardClicked =', await evalJs(`(() => { const c = document.querySelector('[data-king="${GONGSUN}"]'); c && c.click(); return !!c; })()`));
    await sleep(250);
    await evalJs('document.getElementById("btnPickStart").click()');
    await sleep(900);
  }
  console.log('kingName =', await evalJs('document.getElementById("kingName")?.textContent'));

  // ② 選中關卡 易京
  await send('Page.navigate', { url: `${ORIGIN}/web/campaign.html` });
  await waitFor('document.readyState === "complete"', 'readyState#2');
  await sleep(1800);
  await evalJs('(() => { const t = document.querySelector(\'.tab[data-tab="list"]\'); if (t) t.click(); return !!t; })()');
  await sleep(300);
  console.log('list click =', await evalJs(`(() => { const c = document.querySelector('.city[data-name="${YIJING}"]'); if (!c) return 'no-row'; c.click(); return 'clicked'; })()`));
  await sleep(600);
  console.log('acts(易京) =', await evalJs(ACTS), '| hint =', await evalJs('document.getElementById("hint")?.textContent'));

  // ③ 出征(march) → deploy.html
  const clicked = await evalJs('(() => { const b = document.querySelector(\'[data-act="march"]\'); if (!b) return "no-march-btn"; b.click(); return b.hasAttribute("disabled") ? "disabled" : "clicked"; })()');
  console.log('march =', clicked);
  await waitFor('location.pathname.indexOf("/web/deploy.html") >= 0 && !!document.getElementById("bs")', 'deploy.html ready');
  await sleep(1200);

  // ④ 把 URL 的 lv 改成 26 重載：兩欄上限 = 100 步 + 30 騎（原作兩欄相加，總上限 130）
  const url26 = await evalJs(`(() => { const u = new URL(location.href); u.searchParams.set('lv', '26'); return u.href; })()`);
  await send('Page.navigate', { url: url26 });
  await waitFor('document.readyState === "complete" && !!document.getElementById("numtotal")', 'deploy.html lv=26');
  await sleep(1200);
  // 騎兵欄拉到上限（模擬玩家把兩欄都拉滿）
  await evalJs(`(() => {
    const r = document.getElementById('cavrange');
    r.value = r.max;
    r.dispatchEvent(new Event('input', { bubbles: true }));
    return r.value + '/' + r.max;
  })()`);
  await sleep(400);
  console.log('url =', await evalJs('location.href'));

  const dep = await evalJs(`(() => ({
    numnow: document.getElementById('numnow')?.textContent,
    numcap: document.getElementById('numcap')?.textContent,
    cavnow: document.getElementById('cavnow')?.textContent,
    cavcap: document.getElementById('cavcap')?.textContent,
    numtotal: document.getElementById('numtotal')?.textContent,
    gosub: document.getElementById('gosub')?.textContent,
    target: document.getElementById('target')?.textContent,
    gar: document.getElementById('gar')?.textContent,
    bs: document.getElementById('bs')?.textContent,
    def: document.getElementById('def')?.textContent,
    intel: document.getElementById('intel')?.innerText,
    goHref: document.getElementById('go')?.tagName,
  }))()`);
  console.log('deploy =', JSON.stringify(dep, null, 1));
  writeFileSync(`${OUT}/web_deploy_twocol.txt`, [
    '# web deploy.html?lv=26（campaign 選關卡易京 → 出征 march 進入，再把騎兵欄拉滿）',
    'url=' + (await evalJs('location.href')),
    `步欄 ${dep.numnow}/${dep.numcap} · 騎欄 ${dep.cavnow}/${dep.cavcap}`,
    'numtotal=' + dep.numtotal,
    'gosub=' + dep.gosub,
    'target=' + dep.target + ' | gar=' + dep.gar + ' | bs=' + dep.bs + ' | def=' + dep.def,
    '', 'intel:', dep.intel || '',
  ].join('\n'), 'utf8');
  // 頁面本體在 `.body` 裡滾動：滾到底，讓「頁頭目標城兵力」+「步/騎兩欄」+「出征按鈕」同框
  const scrolled = await evalJs(`(() => {
    const b = document.querySelector('.body');
    b.scrollTop = b.scrollHeight;
    return { top: b.scrollTop, h: b.scrollHeight, client: b.clientHeight };
  })()`);
  console.log('scroll =', JSON.stringify(scrolled));
  await sleep(400);
  await shot(`${OUT}/web_deploy_twocol.png`);
  // 加一張整頁長圖：頁頭「目標 易京 · 守軍 110 兵 · 上陣 110 兵」與下方「步/騎」兩條滑桿同框
  const fullH = await evalJs('Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)');
  const full = await send('Page.captureScreenshot', {
    format: 'png', captureBeyondViewport: true,
    clip: { x: 0, y: 0, width: 750, height: Math.min(fullH, 2400), scale: 1 },
  });
  writeFileSync(`${OUT}/web_deploy_twocol_full.png`, Buffer.from(full.data, 'base64'));
  console.log('shot ->', `${OUT}/web_deploy_twocol_full.png`, 'h=', fullH);
  console.log('errors =', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  try { await send('Browser.close'); } catch { /* ignore */ }
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
  try { server?.kill(); } catch { /* ignore */ }
}
