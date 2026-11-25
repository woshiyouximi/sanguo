// 可复用 CDP 会话工具（有头 Edge，零依赖）。
//   node cdp.mjs launch            起有头浏览器并导航到 Cocos 页面，保持常驻
//   node cdp.mjs run <steps.mjs>   连上现有页面，跑一个步骤模块
//   node cdp.mjs close             关掉浏览器
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = process.env.PROFILE || 'F:\\sanguo\\work\\.edgeprof_cocos2';
const PORT = Number(process.env.PORT || 9222);
const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_verify';
const PAGE_URL = process.env.PAGE_URL || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const WINARG = process.env.WIN || '--window-size=900,1500';
const PORTARG = `--remote-debugging-port=${PORT}`;
const PROFARG = `--user-data-dir=${PROFILE}`;
const GPU_ARGS = (process.env.GPU_ARGS || '').trim() ? process.env.GPU_ARGS.trim().split(/\s+/) : [];

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
  const events = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    } else if (msg.method) events.push(msg);
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
  return { ws, send, ready, events };
}

async function launch() {
  const args = [PORTARG, PROFARG, WINARG, '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-device-scale-factor=1', ...GPU_ARGS, 'about:blank'];
  const child = spawn(EDGE, args, { detached: true, stdio: 'ignore' });
  child.unref();
  const v = await waitPort(30000);
  if (!v) throw new Error('devtools port not open');
  const t = await jget(`/json/new?${encodeURIComponent(PAGE_URL)}`, 'PUT');
  fs.writeFileSync(path.join(OUTDIR, 'session.json'), JSON.stringify({ targetId: t.id, pageUrl: PAGE_URL, browser: v.Browser, headed: true, args }, null, 2), 'utf8');
  // 等页面把 cc 挂上
  const { ws, send, ready } = connect(v.webSocketDebuggerUrl);
  await ready;
  const { sessionId } = await send('Target.attachToTarget', { targetId: t.id, flatten: true });
  await send('Runtime.enable', {}, sessionId);
  for (let i = 0; i < 60; i++) {
    const r = await send('Runtime.evaluate', { expression: 'typeof window.cc === "object" && !!(cc.director && cc.director.getScene())', returnByValue: true }, sessionId);
    if (r.result && r.result.value === true) break;
    await sleep(500);
  }
  const st = await send('Runtime.evaluate', { expression: 'JSON.stringify({scene:cc.director.getScene().name, frames:cc.director.getTotalFrames()})', returnByValue: true }, sessionId);
  console.log('launched', v.Browser, 'target', t.id, st.result.value);
  ws.close();
}

async function attachPage() {
  const v = await waitPort(8000);
  if (!v) throw new Error('browser not running on ' + PORT);
  const list = await jget('/json/list');
  const pages = list.filter((x) => x.type === 'page' && (x.url || '').includes((process.env.MATCH || 'cocos-build')));
  if (!pages.length) throw new Error('no cocos-build page target; have: ' + list.map((x) => x.type + ':' + (x.url || '').slice(0, 60)).join(' | '));
  const page = pages[0];
  const { ws, send, ready, events } = connect(page.webSocketDebuggerUrl);
  await ready;
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Log.enable');
  await send('Network.enable');
  return { ws, send, events, page, browserVersion: v.Browser };
}

async function run(stepsFile) {
  const { ws, send, events, page, browserVersion } = await attachPage();
  const s = (m, p = {}) => send(m, p);
  const shot = async (name) => {
    const r = await s('Page.captureScreenshot', { format: 'png' });
    const out = path.join(OUTDIR, name.endsWith('.png') ? name : name + '.png');
    fs.writeFileSync(out, Buffer.from(r.data, 'base64'));
    const size = fs.statSync(out).size;
    return { path: out, bytes: size };
  };
  const evaluate = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { __throw: r.exceptionDetails.exception ? r.exceptionDetails.exception.description : JSON.stringify(r.exceptionDetails) };
    return r.result.value;
  };
  const click = async (x, y) => {
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0, pointerType: 'mouse' });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1, pointerType: 'mouse' });
    await sleep(60);
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0, pointerType: 'mouse' });
  };
  const log = (...a) => console.log(...a);
  const mod = await import(pathToFileURL(path.resolve(stepsFile)).href);
  const result = await mod.default({ s, send, shot, evaluate, click, sleep, log, page, browserVersion, events, OUTDIR });
  // 汇总本步骤期间的控制台/异常
  const cons = events.filter((e) => e.method === 'Runtime.consoleAPICalled').map((e) => ({ type: e.params.type, text: (e.params.args || []).map((a) => (a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : a.description || a.type)).join(' ') }));
  const exc = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => ({ text: e.params.exceptionDetails.text, desc: (e.params.exceptionDetails.exception || {}).description || '' }));
  const fails = events.filter((e) => e.method === 'Network.loadingFailed' && e.params.errorText !== 'net::ERR_ABORTED').map((e) => e.params.errorText + ' ' + (e.params.type || ''));
  console.log('--- console during steps (' + cons.length + ') ---');
  cons.slice(0, 30).forEach((c, i) => console.log(i, '[' + c.type + ']', c.text.slice(0, 2000)));
  console.log('--- exceptions (' + exc.length + ') ---');
  exc.slice(0, 10).forEach((e, i) => console.log(i, e.text, '|', (e.desc || '').slice(0, 600)));
  console.log('--- netFails (' + fails.length + ') ---');
  fails.slice(0, 10).forEach((f, i) => console.log(i, f));
  // 完整（不截断）落盘，供报告引用
  try {
    const dump = path.join(OUTDIR, 'console_' + path.basename(stepsFile, '.mjs') + '.json');
    fs.writeFileSync(dump, JSON.stringify({ console: cons, exceptions: exc, netFails: fails }, null, 1), 'utf8');
    console.log('--- full console dump: ' + dump);
  } catch (e) { console.log('dump failed: ' + e.message); }
  if (result !== undefined) console.log('--- result ---\n' + JSON.stringify(result, null, 1));
  ws.close();
}

async function close() {
  const v = await waitPort(5000);
  if (!v) { console.log('no browser'); return; }
  const { ws, send, ready } = connect(v.webSocketDebuggerUrl);
  await ready;
  try { await send('Browser.close'); } catch {}
  ws.close();
  await sleep(500);
  console.log('closed');
}

const cmd = process.argv[2];
const p = cmd === 'launch' ? launch() : cmd === 'run' ? run(process.argv[3]) : cmd === 'close' ? close() : Promise.reject(new Error('usage: launch|run <steps>|close'));
p.then(() => process.exit(0)).catch((e) => { console.error('cdp fail:', e.message); process.exit(1); });
