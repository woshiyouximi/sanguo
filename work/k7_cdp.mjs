/**
 * work/k7_cdp.mjs - CDP probe for the cocos web-mobile build.
 * usage: node work/k7_cdp.mjs <url> [waitMs] [evalFile]
 * Boots headless Edge with a fresh profile, attaches BEFORE navigation so that
 * early console output / exceptions are captured, then prints diagnostics.
 */
import { spawn } from 'node:child_process';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9347 + Math.floor(Math.random() * 40);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const waitMs = Number(process.argv[3] || 12000);
const evalFile = process.argv[4] || '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const profile = `F:\\sanguo\\work\\_k7_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--headless=new',
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,msEdgeIdentityFeature',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--window-size=720,1280',
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
  for (let i = 0; i < 80; i += 1) {
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
    } else if (m.method === 'Page.javascriptDialogOpening') {
      events.push({ kind: 'dialog', text: m.params.message });
    } else if (m.method === 'Page.loadEventFired') {
      events.push({ kind: 'load' });
    }
  };

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');

  const t0 = Date.now();
  await send('Page.navigate', { url });
  await sleep(waitMs);

  const probe = `
(async () => {
  const out = {};
  out.href = location.href;
  out.readyState = document.readyState;
  out.hasCC = typeof window.cc;
  try { out.ccKeys = window.cc ? Object.keys(window.cc).length : 0; } catch (e) { out.ccKeys = 'ERR ' + e; }
  try { out.totalFrames = window.cc && cc.director ? cc.director.getTotalFrames() : null; } catch (e) { out.totalFrames = 'ERR ' + e; }
  try { out.scene = window.cc && cc.director && cc.director.getScene() ? cc.director.getScene().name : null; } catch (e) { out.scene = 'ERR ' + e; }
  try { out.sceneInfos = (cc.director._sceneInfos || []).map(s => s && (s.name || s.url)); } catch (e) { out.sceneInfos = 'ERR ' + e; }
  try { out.loadedBundles = Array.from(cc.assetManager.bundles.keys()); } catch (e) { out.loadedBundles = 'ERR ' + e; }
  try { out.mainBundle = !!cc.assetManager.getBundle('main'); } catch (e) { out.mainBundle = 'ERR ' + e; }
  try { out.gameInited = cc.game._inited; out.paused = cc.game.isPaused(); out.frameRate = cc.game.frameRate; } catch (e) { out.game = 'ERR ' + e; }
  try { out.sysInfo = { gl: !!cc.sys && cc.sys.isNative === undefined ? '?' : '?', we: cc.sys && cc.sys.__version }; } catch (e) {}
  try { out.systemEntries = Object.keys(System.entries ? System.entries() : {}).length; } catch (e) { out.systemEntries = 'ERR ' + e; }
  try { out.registered = Object.keys(System.entries()).filter(k => /chunks|_virtual/.test(k)).slice(0, 5); } catch (e) {}
  try {
    const c = document.getElementById('GameCanvas');
    out.canvas = c ? { w: c.width, h: c.height, cw: c.clientWidth, ch: c.clientHeight } : null;
  } catch (e) {}
  try { out.settings = cc.settings ? { launchScene: cc.settings.launch ? cc.settings.launch.launchScene : null } : null; } catch (e) {}
  try {
    const e = new Error('probe-stack');
    out.hasBootModule = !!System.entries()['chunks:///_virtual/main'];
  } catch (e) {}
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
  writeFileSync(`F:\\sanguo\\work\\k7_probe_${Date.now()}.png`, Buffer.from(shot.data, 'base64'));

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
