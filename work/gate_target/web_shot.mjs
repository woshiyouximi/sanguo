/**
 * work/gate_target/web_shot.mjs — 163 出征關卡：web 端截圖證據
 *
 * 走**正式流程**（不偽造 DOM）：新遊戲 → 劇本 184 → 君主 公孫瓚 → 選中 北平 → 出征
 * ⇒ 出征清單應出現「易京（關）· 無主關卡 · 守軍 110 兵 · 道路 78」。
 *
 * 用法：node work/gate_target/web_shot.mjs
 * 產物：work/gate_target/web_campaign_before.png（北平選中·按鈕列）
 *      work/gate_target/web_march_gate.png  （出征清單全屏）
 *      work/gate_target/web_march_gate_sheet.png（出征清單裁剪）
 *      work/gate_target/web_march_gate.txt  （清單文字 dump）
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9431;                     // CDP（換過 9411/9412/9413：那些 port 被別的 agent 的瀏覽器占過）
const HTTP = 5199;                     // 靜態服務（root = F:\sanguo\game）
const ORIGIN = `http://127.0.0.1:${HTTP}`;
const OUT = 'work/gate_target';
const PROFILE = mkdtempSync(join(tmpdir(), 'sg-edge-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BJ = '\u5317\u5E73';             // 北平
const GONGSUN = '\u516C\u5B6B\u74DA';  // 公孫瓚

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
async function waitFor(expr, label, tries = 120) {
  for (let i = 0; i < tries; i += 1) {
    if (await evalJs(expr)) return true;
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

  // ① 首訪＝新遊戲浮層：劇本 184 → 君主 公孫瓚（正式流程，含 writeSlot）
  const pickerOpen = await evalJs('(() => { const s = document.getElementById("pickSheet"); return !!s && !s.hidden; })()');
  console.log('pickerOpen =', pickerOpen);
  if (pickerOpen) {
    await evalJs('(() => { const c = document.querySelector(\'[data-pick="0"]\'); c && c.click(); return !!c; })()');
    await sleep(250);
    await evalJs('document.getElementById("btnPickStart").click()');   // 選劇本 → 選君主
    await sleep(400);
    console.log('kingCardClicked =', await evalJs(`(() => { const c = document.querySelector('[data-king="${GONGSUN}"]'); c && c.click(); return !!c; })()`));
    await sleep(250);
    await evalJs('document.getElementById("btnPickStart").click()');   // 開始新遊戲
    await sleep(900);
  }
  console.log('kingName =', await evalJs('document.getElementById("kingName")?.textContent'));

  // ② 選中 北平：先試 ?sel=，不生效就退回「列表 → 點城」（都是真實 UI 路徑）
  await send('Page.navigate', { url: `${ORIGIN}/web/campaign.html?sel=${encodeURIComponent(BJ)}` });
  await waitFor('document.readyState === "complete"', 'readyState#2');
  await sleep(1800);
  let acts = await evalJs(ACTS);
  console.log('acts(?sel) =', acts);
  if (!acts.includes('dispatch')) {
    console.log('?sel 沒生效，改走列表點城；hint =', await evalJs('document.getElementById("hint")?.textContent'));
    await evalJs('(() => { const t = document.querySelector(\'.tab[data-tab="list"]\'); if (t) t.click(); return !!t; })()');
    await sleep(300);
    const clicked = await evalJs(`(() => { const c = document.querySelector('.city[data-name="${BJ}"]'); if (!c) return 'no-row'; c.click(); return 'clicked'; })()`);
    console.log('list click =', clicked, '| cityRows =', await evalJs('document.querySelectorAll(".city").length'));
    await sleep(500);
    acts = await evalJs(ACTS);
    console.log('acts(list) =', acts);
  }

  // ③ 出征 → 目標清單
  const opened = await evalJs('(() => { const b = document.querySelector(\'[data-act="dispatch"]\'); if (!b) return "no-dispatch-btn"; b.click(); return b.hasAttribute("disabled") ? "disabled" : "clicked"; })()');
  console.log('dispatch =', opened);
  await sleep(600);
  await shot(`${OUT}/web_campaign_before.png`);
  await waitFor('(() => { const s = document.getElementById("marchSheet"); return !!s && !s.hidden; })()', 'marchSheet 可見');
  await sleep(500);

  const dump = await evalJs(`(() => ({
    sub: document.getElementById('marchSub')?.textContent,
    foot: document.getElementById('marchFoot')?.textContent,
    cards: [...document.querySelectorAll('#marchTargets .scard')].map(c => ({
      name: c.querySelector('.scn')?.textContent?.trim(),
      lines: [...c.querySelectorAll('.scm')].map(x => x.textContent.trim()),
      badge: c.querySelector('.gcbadge')?.textContent || '',
    })),
    sheetText: document.getElementById('marchTargets')?.innerText,
  }))()`);
  console.log('marchSub =', dump.sub);
  console.log('marchFoot =', dump.foot);
  console.log('cards =', JSON.stringify(dump.cards));
  writeFileSync(`${OUT}/web_march_gate.txt`, [
    '# 北平 · 出征清單（campaign.html 真實流程：新遊戲 184 → 君主 公孫瓚 → 北平 → 出征）',
    dump.sub, dump.foot, '', dump.sheetText, '', 'JSON:', JSON.stringify(dump.cards, null, 2),
  ].join('\n'), 'utf8');

  // ④ 裁出出征清單，報告裡看得清「關」徽標與 110 兵
  const box = await evalJs(`(() => { const r = document.getElementById('marchSheet').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`);
  const clip = await send('Page.captureScreenshot', {
    format: 'png', clip: { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 },
  });
  writeFileSync(`${OUT}/web_march_gate_sheet.png`, Buffer.from(clip.data, 'base64'));
  console.log('shot ->', `${OUT}/web_march_gate_sheet.png`);
  await shot(`${OUT}/web_march_gate.png`);

  console.log('errors =', errors.length ? errors.slice(0, 5) : 'none');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
  try { server?.kill(); } catch { /* ignore */ }
}
