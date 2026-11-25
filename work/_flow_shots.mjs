/**
 * work/_flow_shots.mjs —— 三条流程缺口的验收截图（R8 一月一令 / R4 选君主 / R28 亂陣相克表）
 * 用法: node work/_flow_shots.mjs
 * 产出: work/flow_onelaw.png, work/flow_king_select.png, work/flow_luanzhen.png
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9347;
const ROOT = 'http://127.0.0.1:5199/web/';
const OUT = 'F:\\sanguo\\work\\';

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_flow',
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
  if (r?.exceptionDetails) return { __err: r.exceptionDetails.text };
  return r?.result?.value;
}
async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('shot ->', file);
}
async function metrics(w, h) {
  await send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false });
}
async function go(url) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 120; i += 1) {
    await sleep(200);
    if (await evalJs('document.readyState') === 'complete') break;
  }
}
const waitFor = async (expr, tries = 100) => {
  for (let i = 0; i < tries; i += 1) {
    if (await evalJs(expr)) return true;
    await sleep(200);
  }
  return false;
};

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
  await metrics(750, 1334);

  // ---------------------------------------------------------------- 1) R8 一月一令
  await go(ROOT + 'city.html?gold=3000&do=develop');
  await waitFor('!!window.__city');
  await sleep(600);
  const lockA = await evalJs(`(() => {
    const c = window.__city;
    const cmds = [...document.querySelectorAll('#grid .cmd')].map((b) => ({ cmd: b.dataset.cmd, disabled: !!b.disabled }));
    return JSON.stringify({
      city: c.cityDef && c.cityDef.NAME,
      month: c.save.month,
      lastActionMonth: c.save.lastActionMonth,
      locked: c.locked,
      vLock: (document.getElementById('vLock') || {}).textContent,
      gold: c.save.gold,
      cmds,
    });
  })()`);
  console.log('[R8] after ?do=develop ->', lockA);
  await shot(OUT + 'flow_onelaw.png');
  // 再点一次：应当被拦下（金不变、月令状态不变）
  const again = await evalJs(`(() => {
    const c = window.__city;
    const before = c.save.gold;
    const b = [...document.querySelectorAll('#grid .cmd')].find((x) => x.dataset.cmd === '開發');
    if (!b) return 'no-button';
    b.click();
    return JSON.stringify({ goldBefore: before, goldAfter: c.save.gold, disabled: !!b.disabled, locked: c.M.monthLocked(c.save, false) });
  })()`);
  console.log('[R8] second click ->', again);
  // 推进一月后应当解锁
  const unlocked = await evalJs(`(() => {
    const c = window.__city;
    c.M.clearMonthLock(c.save);
    const locked = c.M.monthLocked(c.save, false);
    return JSON.stringify({ afterAdvanceMonth_clearMonthLock: locked, lastActionMonth: c.save.lastActionMonth });
  })()`);
  console.log('[R8] clearMonthLock ->', unlocked);

  // ---------------------------------------------------------------- 2) R4 开局选君主
  await go(ROOT + 'campaign.html?pick=king&sc=0');
  const okB = await waitFor(`(() => { const s = document.getElementById('pickSheet'); return s && !s.hidden && document.querySelectorAll('#pickCards [data-king]').length > 0; })()`);
  await sleep(500);
  const sheetH = await evalJs(`(() => { const s = document.getElementById('pickSheet'); return s ? Math.max(0, Math.min(2300, s.getBoundingClientRect().height + s.getBoundingClientRect().top + 20)) : 0; })()`);
  await metrics(750, Math.max(1334, Math.round(sheetH || 1334)));
  await sleep(400);
  const kingB = await evalJs(`(() => {
    const cards = [...document.querySelectorAll('#pickCards [data-king]')];
    return JSON.stringify({
      ready: ${okB ? 'true' : 'false'},
      title: document.getElementById('pickTtl').textContent,
      sub: document.getElementById('pickSub').textContent,
      count: cards.length,
      first: cards.slice(0, 3).map((c) => c.dataset.king + ' | ' + c.querySelector('.scm').textContent),
      startText: document.getElementById('btnPickStart').textContent,
      warn: document.getElementById('pickWarn').textContent,
    });
  })()`);
  console.log('[R4] picker ->', kingB);
  await shot(OUT + 'flow_king_select.png');
  // 选何進（3 城）并开局，验证 owned = 名下所有城 + save.king
  const picked = await evalJs(`(async () => {
    const card = [...document.querySelectorAll('#pickCards [data-king]')].find((c) => c.dataset.king === '何進');
    if (!card) return 'no-card';
    card.click();
    await new Promise((r) => setTimeout(r, 200));
    document.getElementById('btnPickStart').click();
    await new Promise((r) => setTimeout(r, 600));
    const raw = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const slot = (raw.slots || []).find((s) => s && s.snapshot);
    const snap = slot && slot.snapshot;
    return JSON.stringify({ king: snap && snap.king, owned: snap && snap.owned, kingBar: document.getElementById('kingName').textContent + ' / ' + document.getElementById('kingdomName').textContent });
  })()`);
  console.log('[R4] after start ->', picked);

  // ---------------------------------------------------------------- 3) R28 陣形相克（亂陣）
  await go(ROOT + 'deploy.html?city=' + encodeURIComponent('南皮'));
  await waitFor(`document.querySelectorAll('#formgrid .it').length > 0`);
  await sleep(500);
  const formInfo = await evalJs(`(async () => {
    const f = await (await fetch('../data/formations.json')).json();
    return JSON.stringify({
      names: f.names,
      playable: f.playable,
      rows: f.matrix.length,
      cols: (f.matrix[0] || {}).vs.length,
      matrixNames: f.matrix.map((r) => r.name),
      luanRow: f.matrix[10].vs,
      luanCol: f.matrix.map((r) => r.vs[10]),
      grid: [...document.querySelectorAll('#formgrid .it')].map((e) => e.textContent.trim()),
    });
  })()`);
  console.log('[R28] formations ->', formInfo);
  const fi = JSON.parse(formInfo);
  const rowTxt = fi.names.map((n, i) => `${n} ${fi.luanRow[i]}`).join(' · ');
  const colTxt = fi.names.map((n, i) => `${n} +${fi.luanCol[i]}`).join(' · ');
  const panel = `
    <div id="r28panel" style="position:fixed;left:0;right:0;bottom:0;z-index:99999;background:#0E0C09;border-top:2px solid #D8B36A;
      color:#E9E4D6;font:12px/1.6 Consolas,monospace;padding:8px 12px 10px">
      <div style="color:#D8B36A;font-size:13px;margin-bottom:4px">R28 驗收證據 · 陣形相克 ${fi.rows}×${fi.cols}</div>
      <div>matrix 列名：${fi.matrixNames.join(' / ')}</div>
      <div>亂陣行 idx10：formationBonus(亂陣, f) → ${rowTxt}</div>
      <div>反向：formationBonus(f, 亂陣) → ${colTxt}</div>
      <div>deploy 列表 forms.playable=${fi.playable}：${fi.grid.join(' ')}</div>
      <div style="color:#9FD08F">亂陣出現在 deploy 列表：${fi.grid.includes('乱阵') || fi.grid.includes('亂陣') ? '是（錯）' : '否 ✓（只進相克表）'}</div>
      <div style="color:#8C8474">battle.ts formationBonus 原樣未改；越界回 0（matrix[a]?.vs[b] ?? 0）</div>
    </div>`;
  await evalJs(`(() => {
    const g = document.getElementById('formgrid');
    if (g) g.scrollIntoView({ block: 'center' });
    const old = document.getElementById('r28panel');
    if (old) old.remove();
    document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(panel)});
    return true;
  })()`);
  await sleep(500);
  await shot(OUT + 'flow_luanzhen.png');

  console.log('js errors =', errors.length ? errors : 'none');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
