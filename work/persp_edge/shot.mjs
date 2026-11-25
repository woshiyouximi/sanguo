/**
 * work/persp_edge/shot.mjs —— 透视边界截图（CDP，headless Edge）。
 *
 * 为什么这么拍：web 端 `main.js` 的 `frame()` 在 `freeze=1` 时**每帧只 draw、不步进、也不平滑跟镜头**
 * （main.js:1500-1504），所以 `__sanguo.state.camX = X` 一旦写进去就定死，画面与数字都可复现。
 * 单位位置直接改 `world.units[i].x/y`：battleView 就是拿 `u.x/u.y` 去 `projectUnit()` 的（battleView.ts:1143）。
 *
 * 用法：node work/persp_edge/shot.mjs
 * 产出：work/persp_edge/{cam_max,cam_min,cam_max_clamp,cam_old_endpoint}.png + shots.json
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9411 + Math.floor(Math.random() * 40);
const BASE = 'http://127.0.0.1:5173/web/index.html?terrain=7&dev=1&auto=1&sim=30&freeze=1&seed=7';
const OUT = 'F:\\sanguo\\work\\persp_edge';
const CAM_MAX = 64.487665;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const profile = `F:\\sanguo\\work\\_persp_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--headless=new', '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,msEdgeIdentityFeature',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=820,1560',
  'about:blank',
], { stdio: 'ignore' });

const events = [];
let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

/** 一页脚本：等 booted → 摆兵 → 钉 camX → 等两帧 */
function setupExpr(camX, aRows, bRows) {
  return `(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 400 && !(window.__sanguo && window.__sanguo.booted); i += 1) await sleep(50);
    if (!window.__sanguo || !window.__sanguo.booted) throw new Error('page not booted');
    const st = window.__sanguo.state;
    if (!st.world) throw new Error('no world');
    const w = st.world;
    const put = (side, rows) => {
      const us = w.units.filter((u) => u.side === side);
      us.forEach((u, i) => {
        if (i < rows.length) { u.alive = true; u.x = rows[i]; u.y = (i * 3) % 14; }
        else u.alive = false;
      });
    };
    put('A', ${JSON.stringify(aRows)});
    put('B', ${JSON.stringify(bRows)});
    st.camX = ${camX};
    await sleep(250);
    const r = document.getElementById('stage').getBoundingClientRect();
    return {
      camX: st.camX, mode: st.mode, tick: w.tick,
      alive: w.units.filter((u) => u.alive).map((u) => [u.side, u.x, u.y]),
      canvas: { w: document.getElementById('stage').width, h: document.getElementById('stage').height, cw: r.width, ch: r.height },
      rect: { x: r.x, y: r.y, width: r.width, height: r.height },
      dpr: window.devicePixelRatio,
    };
  })()`;
}

const shots = [
  // ① 父代理点名的 camX=63.7（旧夹取端点）：我方 62..69，最近可见行 69 的脚应留在带内
  { name: 'cam_max', camX: 63.7, a: [62, 63, 64, 65, 66, 67, 68, 69], b: [0, 1, 2] },
  // ② 父代理点名的 camX=6.3（旧夹取端点）：我方压到 0..6，最远行 0 的头顶应留在带内
  { name: 'cam_min', camX: 6.3, a: [0, 1, 2, 3, 4, 5, 6], b: [66, 67, 68, 69, 70] },
  // ③ 新端点 CAM_MAX=64.487665：我方占满 66..70，最后一排（70）的脚底 998.35 仍露在控制台上方
  { name: 'cam_max_clamp', camX: CAM_MAX, a: [66, 67, 68, 69, 70], b: [0, 1, 2] },
  // ④ 对照：同一布局、镜头停在旧端点 63.7 —— 第 70 排的脚（1065.79）被控制台切掉，这就是缺陷本体
  { name: 'cam_old_endpoint', camX: 63.7, a: [66, 67, 68, 69, 70], b: [0, 1, 2] },
];

try {
  let version = null;
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up yet */ }
    await sleep(200);
  }
  if (!version) throw new Error('CDP not up');
  console.log('browser:', version.Browser);

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
      const d = m.params.exceptionDetails || {};
      events.push(`[exception] ${d.exception?.description || d.text}`);
    } else if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      const args = (m.params.args || []).map((a) => a.value ?? a.description ?? `[${a.type}]`);
      events.push(`[console:${m.params.type}] ${args.join(' ')}`);
    }
  };

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: BASE });
  await sleep(6000);

  const report = [];
  for (const s of shots) {
    const r = await send('Runtime.evaluate', { expression: setupExpr(s.camX, s.a, s.b), awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`${s.name}: ${JSON.stringify(r.exceptionDetails).slice(0, 800)}`);
    const v = r.result.value;
    const clip = { x: v.rect.x, y: v.rect.y, width: v.rect.width, height: v.rect.height, scale: 750 / v.rect.width };
    const shot = await send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: true });
    const file = `${OUT}\\${s.name}.png`;
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    report.push({ name: s.name, file, requestedCamX: s.camX, camX: v.camX, mode: v.mode, tick: v.tick, alive: v.alive, canvas: v.canvas, rect: v.rect, clip });
    console.log(`shot ${s.name}: camX=${v.camX} mode=${v.mode} canvas=${v.canvas.w}x${v.canvas.h} rect=${v.rect.width.toFixed(1)}x${v.rect.height.toFixed(1)} aliveA=${v.alive.filter((u) => u[0] === 'A').length} aliveB=${v.alive.filter((u) => u[0] === 'B').length}`);
  }
  writeFileSync(`${OUT}\\shots.json`, JSON.stringify({ url: BASE, camMax: CAM_MAX, shots: report, events }, null, 2), 'utf8');
  if (events.length) {
    console.log('--- page events ---');
    for (const e of events.slice(0, 20)) console.log(e.slice(0, 400));
  }
} catch (err) {
  console.error('FATAL:', err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
