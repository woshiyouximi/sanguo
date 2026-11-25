/**
 * work/_campaign_flow_check.mjs —— campaign.html 侧的行为验证（R8 置灰/清月令 + R4 君主栏/老档补君主）
 * 用法: node work/_campaign_flow_check.mjs
 */
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9348;
const ROOT = 'http://127.0.0.1:5199/web/';

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_flow2',
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
  if (r?.exceptionDetails) return { __err: r.exceptionDetails.text, detail: r.exceptionDetails.exception?.description };
  return r?.result?.value;
}
async function go(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 150; i += 1) {
    await sleep(200);
    if (await evalJs('document.readyState') === 'complete') break;
  }
}

try {
  for (let i = 0; i < 60; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' })).json();
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
    }
  };
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

  // ---- A) 新档选君主（張角，6 城）→ 徵兵一次 → 置灰 → 推进一月解锁
  await go(ROOT + 'campaign.html?pick=king&sc=0');
  const r1 = await evalJs(`(async () => {
    localStorage.clear();
    return 'cleared';
  })()`);
  console.log('[A0]', r1);
  await go(ROOT + 'campaign.html?pick=king&sc=0');
  for (let i = 0; i < 80; i += 1) { if (await evalJs(`document.querySelectorAll('#pickCards [data-king]').length > 0`)) break; await sleep(200); }
  const r2 = await evalJs(`(async () => {
    const card = [...document.querySelectorAll('#pickCards [data-king]')].find((c) => c.dataset.king === '張角');
    card.click(); await new Promise((r) => setTimeout(r, 150));
    document.getElementById('btnPickStart').click();
    await new Promise((r) => setTimeout(r, 800));
    const save = window.__campaign ? null : null;
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((s) => s && s.snapshot);
    const snap = slot && slot.snapshot;
    return JSON.stringify({
      king: snap.king, ownedCount: snap.owned.length, owned: snap.owned,
      kingBar: document.getElementById('kingName').textContent + ' | ' + document.getElementById('kingdomName').textContent,
      kingEditHidden: document.getElementById('kingEdit').hidden,
      month: snap.month, lastActionMonth: snap.lastActionMonth,
    });
  })()`);
  console.log('[A1] new game 張角 ->', r2);
  const r3 = await evalJs(`(async () => {
    // 选我方第一座城，然后点徵兵
    const city = [...document.querySelectorAll('#list .city')].find((c) => c.classList.contains('mine'));
    city.click(); await new Promise((r) => setTimeout(r, 200));
    const btn = [...document.querySelectorAll('#actions .btn')].find((b) => b.dataset.act === 'recruit');
    const before = btn.disabled;
    btn.click(); await new Promise((r) => setTimeout(r, 300));
    const acts = [...document.querySelectorAll('#actions .btn')].map((b) => ({ act: b.dataset.act, disabled: !!b.disabled, sub: b.querySelector('small').textContent }));
    const raw = JSON.parse(localStorage.getItem('sanguo_campaign_v1') || '{}');
    const snap = raw;
    return JSON.stringify({ recruitDisabledBefore: before, acts, lastActionMonth: snap.lastActionMonth, gold: snap.gold, troops: snap.cities[city.dataset.name].troops });
  })()`);
  console.log('[A2] after recruit ->', r3);
  const r4 = await evalJs(`(async () => {
    const btn = [...document.querySelectorAll('#actions .btn')].find((b) => b.dataset.act === 'recruit');
    const before = JSON.parse(localStorage.getItem('sanguo_campaign_v1'));
    btn.click(); await new Promise((r) => setTimeout(r, 200));
    const after = JSON.parse(localStorage.getItem('sanguo_campaign_v1'));
    return JSON.stringify({ goldBefore: before.gold, goldAfter: after.gold, hint: document.getElementById('hint').textContent });
  })()`);
  console.log('[A3] second recruit ->', r4);
  const r5 = await evalJs(`(async () => {
    const adv = [...document.querySelectorAll('#actions .btn')].find((b) => b.dataset.act === 'advance');
    adv.click(); await new Promise((r) => setTimeout(r, 1200));
    const snap = JSON.parse(localStorage.getItem('sanguo_campaign_v1'));
    const btn = [...document.querySelectorAll('#actions .btn')].find((b) => b.dataset.act === 'recruit');
    return JSON.stringify({ month: snap.month, lastActionMonth: snap.lastActionMonth, recruitDisabled: btn ? btn.disabled : 'no-btn', ym: document.getElementById('ym').textContent });
  })()`);
  console.log('[A4] after advance ->', r5);

  // ---- B) 老档没有 king：按 owned[0] 的 KING 补
  await evalJs(`(() => {
    localStorage.clear();
    localStorage.setItem('sanguo_campaign_v1', JSON.stringify({
      seeded: true, scenario: 1, month: 3, gold: 900, owned: ['洛陽'],
      cities: { 洛陽: { troops: 200, pop: 300000, money: 500, def: 300 } }, log: [], ts: 1,
    }));
    return true;
  })()`);
  await go(ROOT + 'campaign.html');
  await sleep(1500);
  const r6 = await evalJs(`(() => {
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const snap = (raw.slots || []).find((s) => s && s.snapshot)?.snapshot;
    return JSON.stringify({
      kingBar: document.getElementById('kingName').textContent + ' | ' + document.getElementById('kingdomName').textContent,
      kingEditHidden: document.getElementById('kingEdit').hidden,
      saveKing: snap && snap.king, migrated: !!snap,
    });
  })()`);
  console.log('[B1] legacy save without king ->', r6);
  console.log('js errors =', errors.length ? errors : 'none');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}

