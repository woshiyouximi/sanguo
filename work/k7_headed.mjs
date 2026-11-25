/**
 * work/k7_headed.mjs - HEADED CDP probe that mimics the lead's harness
 * (msedge.exe, fixed-size window, attach-after-open), but installs an
 * unhandledrejection recorder + rAF counter BEFORE any page script runs.
 *
 * usage: node work/k7_headed.mjs <url> [waitMs] [evalFile] [shotPath]
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 40);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const waitMs = Number(process.argv[3] || 12000);
const evalFile = process.argv[4] || '';
const shotPath = process.argv[5] || `F:\\sanguo\\work\\k7_headed_${Date.now()}.png`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = process.env.K7_PROFILE || `F:\\sanguo\\work\\_k7h_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,msEdgeIdentityFeature',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=900,1500',
  'about:blank',
], { stdio: 'ignore' });

const events = [];
let ws;
let msgId = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params, sessionId }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

try {
  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) { version = await r.json(); break; }
    } catch { /* not up */ }
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
    if (m.method === 'Runtime.consoleAPICalled') {
      const args = (m.params.args || []).map((a) => {
        if (a.value !== undefined) return typeof a.value === 'object' ? JSON.stringify(a.value) : String(a.value);
        return a.description ?? a.unserializableValue ?? `[${a.type}]`;
      });
      events.push({ kind: 'console', type: m.params.type, text: args.join(' ') });
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails || {};
      events.push({
        kind: 'exception',
        text: d.exception?.description || d.text || 'exception',
        url: d.url, line: d.lineNumber, col: d.columnNumber,
      });
    } else if (m.method === 'Log.entryAdded') {
      const e = m.params.entry;
      events.push({ kind: 'log', level: e.level, text: `${e.text}${e.url ? ' @' + e.url : ''}`, source: e.source });
    } else if (m.method === 'Page.loadEventFired') {
      events.push({ kind: 'load' });
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');

  // install diagnostics before ANY page script
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__k7 = { rej: [], err: [], raf: 0, longtasks: [] };
      window.addEventListener('unhandledrejection', function (e) {
        var r = e.reason;
        window.__k7.rej.push(String((r && (r.stack || r.message)) || r).slice(0, 600));
      });
      window.addEventListener('error', function (e) {
        window.__k7.err.push(String(e.message || e.error).slice(0, 600) + ' @' + (e.filename || '') + ':' + e.lineno);
      });
      (function tick() { window.__k7.raf++; requestAnimationFrame(tick); })();
      try {
        new PerformanceObserver(function (l) {
          for (var i = 0; i < l.getEntries().length; i++) window.__k7.longtasks.push(Math.round(l.getEntries()[i].duration));
        }).observe({ entryTypes: ['longtask'] });
      } catch (e) {}
    `,
  });

  const t0 = Date.now();
  await send('Page.navigate', { url });
  await sleep(waitMs);

  const probe = `
(async () => {
  const out = {};
  out.href = location.href;
  out.readyState = document.readyState;
  out.hasCC = typeof window.cc;
  out.visibility = document.visibilityState;
  out.hidden = document.hidden;
  out.hasFocus = document.hasFocus();
  out.innerWH = [window.innerWidth, window.innerHeight];
  out.k7 = window.__k7 ? { raf: window.__k7.raf, rej: window.__k7.rej.slice(0, 6), err: window.__k7.err.slice(0, 6), longtasks: window.__k7.longtasks.slice(0, 10) } : null;
  const f0 = (window.cc && cc.director) ? cc.director.getTotalFrames() : null;
  const t0 = performance.now();
  let n = 0;
  await new Promise((res) => {
    const step = () => { n++; if (performance.now() - t0 < 800) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
  const f1 = (window.cc && cc.director) ? cc.director.getTotalFrames() : null;
  out.rafIn800ms = n;
  out.framesBefore = f0;
  out.framesAfter = f1;
  if (window.cc && window.cc.game) {
    out.inited = cc.game._inited;
    out.shouldLoadLaunchScene = cc.game._shouldLoadLaunchScene;
    out.paused = cc.game.isPaused();
    out.frameRate = cc.game.frameRate;
    out.engineInited = cc.game._engineInited;
    out.pacer = !!cc.game._pacer;
  }
  try { out.bundles = Array.from(cc.assetManager.bundles.keys()); } catch (e) { out.bundles = 'ERR ' + e; }
  try { out.scene = cc.director.getScene() ? cc.director.getScene().name : null; } catch (e) { out.scene = 'ERR ' + e; }
  try {
    const c = document.getElementById('GameCanvas');
    out.canvas = c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
  } catch (e) {}
  try { out.splashDom = !!document.getElementById('splash'); } catch (e) {}
  return out;
})()
`;
  const r = await send('Runtime.evaluate', { expression: probe, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) console.log('PROBE THREW:', JSON.stringify(r.exceptionDetails).slice(0, 2000));
  console.log('PROBE:', JSON.stringify(r.result?.value, null, 2));

  if (evalFile) {
    const code = readFileSync(evalFile, 'utf8');
    const r2 = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true, userGesture: true });
    console.log('EVAL:', JSON.stringify(r2.exceptionDetails ? r2.exceptionDetails : r2.result?.value, null, 2).slice(0, 8000));
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(shotPath, Buffer.from(shot.data, 'base64'));
  console.log('shot:', shotPath);

  console.log('elapsed ms:', Date.now() - t0);
  console.log('--- EVENTS (' + events.length + ') ---');
  for (const e of events) {
    if (e.kind === 'load') { console.log('[load]'); continue; }
    const loc = e.url ? ` @${e.url}:${e.line}` : '';
    console.log(`[${e.kind}${e.type ? ':' + e.type : ''}${e.level ? ':' + e.level : ''}] ${String(e.text).replace(/\s+/g, ' ').slice(0, 1200)}${loc}`);
  }
} catch (err) {
  console.error('FATAL:', err);
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
