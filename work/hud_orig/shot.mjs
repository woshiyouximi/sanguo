/**
 * work/hud_orig/shot.mjs —— 战斗 HUD 对齐（project/180）的截图工具
 *
 * 用法：
 *   node work/hud_orig/shot.mjs            # 截 after_battle.png
 *   node work/hud_orig/shot.mjs probe      # 只打印页面里的几个数（world.tick / 金牌文字）
 *
 * 做法抄 work/_shots.mjs：Edge --headless=new + CDP，750×1334 @2x。
 * 复现参数用 main.js 的调试口（只读，不改 main.js）：
 *   ?dev=1&terrain=7&auto=1&sim=270&freeze=1   → 270 tick / 30Hz = 开战 9 秒
 * freeze=1 必须带，否则 rAF 继续跑，截到的帧不可复现。
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9343;
const OUT = 'F:\\sanguo\\work\\hud_orig\\';
// 一组「不像空世界」的调试参数：主将有名有姓有武/智/等级/疲劳，两边士气不同值。
const Q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const URL_AFTER = 'http://127.0.0.1:5199/web/?' + Q({
  dev: 1, terrain: 7, auto: 1, sim: 270, freeze: 1, seed: 7,
  a: '張角', astr: 56, aint: 95, level: 45, atire: 12, amorale: 84,
  bgen: '關羽', bstr: 97, bint: 75, blevel: 40, bmorale: 73,
});
const mode = (process.argv[2] || 'shot').toLowerCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\sanguo\\work\\_edge_hud_' + Date.now(),
  '--window-size=750,1334',
  'about:blank',
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

async function waitWsUrl() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return (await r.json()).webSocketDebuggerUrl;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('CDP not up');
}

async function evalPage(expression, { awaitPromise = true } = {}) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result?.value;
}

async function go(url, { settle = 1500 } = {}) {
  await send('Page.navigate', { url });
  for (let i = 0; i < 90; i += 1) {
    try {
      const st = await evalPage('document.readyState', { awaitPromise: false });
      if (st === 'complete') break;
    } catch { /* navigating */ }
    await sleep(200);
  }
  await sleep(settle);
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(OUT + file, Buffer.from(r.data, 'base64'));
  console.log(`  shot -> work\\hud_orig\\${file}`);
}

try {
  const ver = await waitWsUrl();
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({ kind: 'exception', text: d?.exception?.description || d?.text || '?' });
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push({ kind: 'console.error', text: (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ') });
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 2, mobile: false });
  try { await send('Page.bringToFront'); } catch { /* older Edge */ }

  await go(URL_AFTER, { settle: 2500 });

  if (mode === 'probe') {
    const probe = await evalPage(`(async () => {
      const c = document.querySelector('canvas');
      const r = c.getBoundingClientRect();
      const st = window.__sanguo && window.__sanguo.state;
      const w = st && (st.world || st);
      const out = {
        canvas: [c.width, c.height], css: [Math.round(r.width), Math.round(r.height)],
        tick: w && w.tick,
        A: w && w.sides && { name: w.sides.A.general.name, str: w.sides.A.general.str, int: w.sides.A.general.int,
          tire: w.sides.A.general.tire, morale: w.sides.A.general.morale, alive: w.sides.A.aliveCount, start: w.sides.A.start,
          sm: w.sides.A.morale },
        B: w && w.sides && { name: w.sides.B.general.name, str: w.sides.B.general.str, int: w.sides.B.general.int,
          tire: w.sides.B.general.tire, morale: w.sides.B.general.morale, alive: w.sides.B.aliveCount, start: w.sides.B.start,
          sm: w.sides.B.morale },
      };
      try {
        const mod = await import('../dist/view/battleView.js');
        const cmds = mod.buildFrame(w, { skills: [], selectedSkill: -1, menuOpen: false, armyMenu: null, hint: '' });
        out.texts = cmds.filter((k) => k.kind === 'text').map((k) => [Math.round(k.x), Math.round(k.y), k.size, k.text]);
      } catch (e) { out.err = String(e); }
      return out;
    })()`);
    console.log('probe ->', JSON.stringify(probe, null, 1));
  }

  await shot(mode === 'probe' ? '_probe_battle.png' : 'after_battle.png');
  console.log('\n=== console errors: ' + errors.length + ' ===');
  for (const e of errors.slice(0, 20)) console.log(`  [${e.kind}] ${e.text.slice(0, 300)}`);
  void ver;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
