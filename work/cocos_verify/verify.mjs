// Cocos 构建产物运行时验证：有头 Edge + CDP，零依赖（node 内置 fetch/WebSocket）。
// 用法示例：
//   $env:TAG='default'; node verify.mjs
//   $env:TAG='d3d11'; $env:GPU_ARGS='--use-angle=d3d11'; node verify.mjs
// 环境变量：PORT TAG PAGE_URL GPU_ARGS WAIT_MS WIN PROFILE OUTDIR
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = process.env.PROFILE || 'F:\\sanguo\\work\\.edgeprof_cocos2';
const PORT = Number(process.env.PORT || 9222);
const TAG = process.env.TAG || 'default';
const OUTDIR = process.env.OUTDIR || 'F:\\sanguo\\work\\cocos_verify';
const PAGE_URL = process.env.PAGE_URL || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const WAIT_MS = Number(process.env.WAIT_MS || 22000);
const GPU_ARGS = (process.env.GPU_ARGS || '').trim() ? process.env.GPU_ARGS.trim().split(/\s+/) : [];
const WINARG = process.env.WIN || '--window-size=900,1500';
const PORTARG = `--remote-debugging-port=${PORT}`;
const PROFARG = `--user-data-dir=${PROFILE}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return res.json();
}
async function waitPort(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      await json('/json/version');
      return await json('/json/version');
    } catch {
      await sleep(250);
    }
  }
  return null;
}

const PROBE = `(() => {
  const out = {};
  const t0 = performance.now();
  out.href = location.href;
  out.title = document.title;
  out.readyState = document.readyState;
  out.innerWH = [innerWidth, innerHeight];
  out.dpr = devicePixelRatio;
  const gd = document.getElementById('GameDiv');
  const ct = document.getElementById('Cocos3dGameContainer');
  const c = document.querySelector('canvas') || document.getElementById('GameCanvas');
  const rect = (el) => (el ? [Math.round(el.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().height)] : null);
  out.gameDivWH = rect(gd);
  out.containerWH = rect(ct);
  out.canvasExists = !!c;
  if (c) {
    out.canvasId = c.id;
    out.canvasBitmapWH = [c.width, c.height];
    out.canvasCSSWH = rect(c);
    out.canvasParentWH = rect(c.parentElement);
    const cs = getComputedStyle(c);
    out.canvasStyle = { display: cs.display, visibility: cs.visibility, opacity: cs.opacity, w: cs.width, h: cs.height };
    out.canvasParentId = c.parentElement ? c.parentElement.id : null;
  }
  const glErr = {};
  try { out.gl2 = !!(c && c.getContext('webgl2')); } catch (e) { out.gl2 = 'throw:' + e; }
  try { out.gl1 = !!(c && (c.getContext('webgl') || c.getContext('experimental-webgl'))); } catch (e) { out.gl1 = 'throw:' + e; }
  try { const p = document.createElement('canvas').getContext('webgl2'); out.offscreenGL2 = !!p; if (p) { out.glVersion = p.getParameter(p.VERSION); out.glRenderer = p.getParameter(p.RENDERER); out.glVendor = p.getParameter(p.VENDOR); } } catch (e) { out.offscreenGL2 = 'throw:' + e; }
  out.hasCC = typeof window.cc;
  if (window.cc) {
    out.ccVersion = window.cc.ENGINE_VERSION || null;
    out.ccGame = window.cc.game ? !!window.cc.game.frameRate : 'no-game';
    try {
      const d = window.cc.director;
      out.director = !!d;
      if (d && d.getScene) {
        const sc = d.getScene();
        out.sceneName = sc ? sc.name : null;
        out.sceneUuid = sc ? sc.uuid : null;
        out.rootChildren = sc ? sc.children.length : null;
        out.rootChildNames = sc ? sc.children.map((n) => n.name) : null;
      }
      if (d) { out.totalFrames = d.getTotalFrames ? d.getTotalFrames() : null; out.deltaTime = d.getDeltaTime ? d.getDeltaTime() : null; }
    } catch (e) { out.directorErr = String(e); }
  }
  out.winErrHook = window.__errs || null;
  out.winError = window.__error === undefined ? 'undefined' : String(window.__error);
  out.bodyText = (document.body && document.body.innerText ? document.body.innerText : '').slice(0, 400);
  out.elapsedMs = Math.round(performance.now());
  return out;
})()`;

const HOOK = `window.__errs = [];
window.addEventListener('error', (e) => { try { window.__errs.push('error: ' + String((e && (e.message || (e.error && e.error.stack))) || e)); } catch (x) { window.__errs.push('error: <unstringifiable>'); } });
window.addEventListener('unhandledrejection', (e) => { try { const r = e && e.reason; window.__errs.push('unhandledrejection: ' + String((r && (r.stack || r.message)) || r)); } catch (x) { window.__errs.push('unhandledrejection: <unstringifiable>'); } });
true;`;

function argText(a) {
  if (!a) return 'undefined';
  if ('value' in a) return typeof a.value === 'string' ? a.value : JSON.stringify(a.value);
  if (a.unserializableValue) return a.unserializableValue;
  if (a.description) return a.description;
  return a.type;
}

async function main() {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const HEADLESS = (process.env.HEADLESS || '').trim();
  const args = [
    PORTARG,
    PROFARG,
    WINARG,
    ...(HEADLESS ? [HEADLESS === '1' ? '--headless=new' : HEADLESS] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--disable-features=Translate,TranslateUI',
    ...GPU_ARGS,
    'about:blank',
  ];
  const child = spawn(EDGE, args, { detached: true, stdio: 'ignore' });
  child.unref();
  const version = await waitPort(30000);
  if (!version) throw new Error('devtools port never opened on ' + PORT);
  const wsUrl = version.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  let T0 = Date.now();
  const consoleLog = [];
  const exceptions = [];
  const logs = [];
  const netFails = [];
  let attached = false;
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      return;
    }
    const m = msg.method;
    if (m === 'Runtime.consoleAPICalled') {
      consoleLog.push({ t: Date.now() - T0, type: msg.params.type, text: (msg.params.args || []).map(argText).join(' ') });
    } else if (m === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails || {};
      exceptions.push({
        t: Date.now() - T0,
        text: d.text || '',
        desc: (d.exception && (d.exception.description || d.exception.value)) || '',
        url: d.url,
        line: d.lineNumber,
        col: d.columnNumber,
      });
    } else if (m === 'Log.entryAdded') {
      const e = msg.params.entry || {};
      logs.push({ t: Date.now() - T0, level: e.level, source: e.source, text: e.text, url: e.url });
    } else if (m === 'Network.responseReceived') {
      const r = msg.params.response || {};
      if (r.status >= 400) netFails.push({ t: Date.now() - T0, kind: 'http' + r.status, url: r.url });
    } else if (m === 'Network.loadingFailed') {
      const p = msg.params;
      if (!p.blockedReason && p.errorText !== 'net::ERR_ABORTED') {
        netFails.push({ t: Date.now() - T0, kind: p.errorText, url: p.url || '', type: p.type });
      }
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  T0 = Date.now();
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });

  const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  const s = (m, p = {}) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Log.enable');
  await s('Network.enable');
  await s('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });
  const nav = await s('Page.navigate', { url: PAGE_URL });

  const probe = async () => {
    const r = await s('Runtime.evaluate', { expression: PROBE, returnByValue: true, awaitPromise: false });
    if (r.exceptionDetails) return { __probeThrew: JSON.stringify(r.exceptionDetails).slice(0, 500) };
    return r.result.value;
  };

  let last = null;
  const timeline = [];
  const tNav = Date.now();
  while (Date.now() - tNav < WAIT_MS) {
    last = await probe();
    const st = last && !last.__probeThrew
      ? { t: Date.now() - tNav, ready: last.readyState, hasCC: last.hasCC, scene: last.sceneName || null, frames: last.totalFrames, canvas: last.canvasBitmapWH, text: (last.bodyText || '').slice(0, 60) }
      : { t: Date.now() - tNav, err: String((last || {}).__probeThrew).slice(0, 120) };
    timeline.push(st);
    await sleep(500);
  }
  await sleep(2500); // 越过 splash totalTime=2000
  const settle = await probe();
  const shot1 = await s('Page.captureScreenshot', { format: 'png' });
  const png1 = `${OUTDIR}\\${TAG}_t1.png`;
  fs.writeFileSync(png1, Buffer.from(shot1.data, 'base64'));
  await sleep(3000);
  const settle2 = await probe();
  const shot2 = await s('Page.captureScreenshot', { format: 'png' });
  const png2 = `${OUTDIR}\\${TAG}_t2.png`;
  fs.writeFileSync(png2, Buffer.from(shot2.data, 'base64'));

  const report = {
    tag: TAG,
    at: new Date().toISOString(),
    browser: { product: version.Browser, protocolVersion: version['Protocol-Version'], ws: wsUrl },
    args: { pageUrl: PAGE_URL, browserArgs: args, profile: PROFILE, port: PORT, headed: !args.includes('--headless') && !args.includes('--headless=new') },
    nav,
    probeAfterSettle: settle,
    probeFinal: settle2,
    timeline,
    screenshotBytes: { t1: fs.statSync(png1).size, t2: fs.statSync(png2).size },
    screenshots: [png1, png2],
    consoleCount: consoleLog.length,
    console: consoleLog.slice(0, 30),
    consoleAll: consoleLog,
    exceptionCount: exceptions.length,
    exceptions,
    logs,
    netFails,
  };
  const outJson = `${OUTDIR}\\run_${TAG}.json`;
  fs.writeFileSync(outJson, JSON.stringify(report, null, 2), 'utf8');
  console.log('=== TAG ' + TAG + ' ===');
  console.log('browser', version.Browser, '| headed', report.args.headed, '| gpuArgs', JSON.stringify(GPU_ARGS));
  console.log('probe@settle', JSON.stringify(settle, null, 1));
  console.log('consoleCount', consoleLog.length, 'exceptionCount', exceptions.length, 'netFails', netFails.length);
  console.log('--- first 30 console ---');
  consoleLog.slice(0, 30).forEach((c, i) => console.log(i, '[' + c.type + ']', c.text.slice(0, 400)));
  console.log('--- exceptions ---');
  exceptions.slice(0, 10).forEach((e, i) => console.log(i, e.text, '|', (e.desc || '').slice(0, 600), '|', e.url, e.line));
  console.log('--- netFails ---');
  netFails.slice(0, 15).forEach((n, i) => console.log(i, n.kind, n.url));
  console.log('--- timeline ---');
  timeline.forEach((t) => console.log(JSON.stringify(t)));
  const byMsg = new Map();
  for (const c of consoleLog) {
    const k = c.type + ' :: ' + c.text.replace(/Error (\d+), please go to .*/g, 'Error $1');
    byMsg.set(k, (byMsg.get(k) || 0) + 1);
  }
  console.log('--- console summary (type :: text => count) ---');
  [...byMsg.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(v, 'x', k.slice(0, 200)));
  console.log('screenshots', png1, fs.statSync(png1).size, '|', png2, fs.statSync(png2).size);
  console.log('json', outJson);
  try { await s('Page.close'); } catch {}
  try { await send('Browser.close'); } catch {}
  ws.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('verify failed:', e && e.message);
    process.exit(1);
  });
