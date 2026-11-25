// 本目录专用的 CDP 小工具（零依赖）：起一个独立的 headless Edge，连到 5173 上的
// Cocos 构建产物，跑一个 steps 模块后退出。端口 / profile 都避开别人的 9222 会话。
//   node cdp.mjs run steps_items.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.PORT || 9400 + Math.floor(Math.random() * 300));
const PROFILE = process.env.PROFILE || `F:\\sanguo\\work\\.edgeprof_items_${PORT}`;
const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_items\\out';
const PAGE_URL = process.env.PAGE_URL || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function jget(p, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${p}`, { method });
  return res.json();
}
async function waitPort(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { return await jget('/json/version'); } catch { await sleep(300); }
  }
  return null;
}

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  const ready = new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });
  return { ws, send, ready };
}

async function run(stepsFile) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const args = [
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--headless=new', '--window-size=876,1368', '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', '--mute-audio', 'about:blank',
  ];
  const child = spawn(EDGE, args, { detached: true, stdio: 'ignore' });
  child.unref();
  const v = await waitPort(30000);
  if (!v) throw new Error('devtools port not open');
  const t = await jget(`/json/new?${encodeURIComponent(PAGE_URL)}`, 'PUT');
  const { ws, send, ready } = connect(v.webSocketDebuggerUrl);
  await ready;
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.id, flatten: true });
  const s = (m, p = {}) => send(m, p, sessionId);
  await s('Runtime.enable');
  await s('Page.enable');
  await s('Log.enable');
  await s('Network.enable');
  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __throw: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails) };
    return r.result.value;
  };
  const shot = async (name) => {
    const r = await s('Page.captureScreenshot', { format: 'png' });
    const out = path.join(OUTDIR, name.endsWith('.png') ? name : name + '.png');
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    return { path: out, bytes: fs.statSync(out).size };
  };
  const click = async (x, y) => {
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
    await sleep(60);
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  };
  for (let i = 0; i < 90; i++) {
    const ok = await evaluate('typeof window.cc === "object" && !!(cc.director && cc.director.getScene())');
    if (ok === true) break;
    await sleep(500);
  }
  const mod = await import(pathToFileURL(path.resolve(stepsFile)).href);
  const result = await mod.default({ s, send, shot, evaluate, click, sleep, log: console.log });
  console.log('--- result ---\n' + JSON.stringify(result, null, 1));
  try { await s('Browser.close'); } catch { /* ignore */ }
  ws.close();
  await sleep(400);
  try { child.kill(); } catch { /* ignore */ }
}

run(process.argv[3] || process.argv[2] || 'steps_items.mjs')
  .then(() => process.exit(0))
  .catch((e) => { console.error('cdp fail:', e && e.stack || e); process.exit(1); });
