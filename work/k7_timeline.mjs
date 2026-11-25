/**
 * work/k7_timeline.mjs - headed CDP boot timeline: samples _inited / frames /
 * scene / raf every 250ms from navigation, prints the transition points.
 * usage: node work/k7_timeline.mjs <url> [totalMs]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9460 + Math.floor(Math.random() * 30);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const totalMs = Number(process.argv[3] || 10000);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = `F:\\sanguo\\work\\_k7t_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=900,1500', 'about:blank',
], { stdio: 'ignore' });

let ws; let msgId = 0; const pending = new Map();
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};

try {
  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
    await sleep(200);
  }
  if (!version) throw new Error('CDP not up');
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__k7={raf:0,ev:[],rej:[],err:[]};
      (function t(){window.__k7.raf++;requestAnimationFrame(t);})();
      window.addEventListener('unhandledrejection',function(e){window.__k7.rej.push(String((e.reason&&(e.reason.stack||e.reason.message))||e.reason).slice(0,400));});
      window.addEventListener('error',function(e){window.__k7.err.push(String(e.message).slice(0,400));});`,
  });
  await send('Page.navigate', { url });

  const expr = `(function(){
    var cc = window.cc, o = { raf: window.__k7 ? window.__k7.raf : -1, hasCC: !!cc };
    if (cc && cc.game) { o.inited = cc.game._inited; o.shouldLoad = cc.game._shouldLoadLaunchScene; o.paused = cc.game.isPaused(); }
    if (cc && cc.director) { o.frames = cc.director.getTotalFrames(); o.scene = cc.director.getScene() ? cc.director.getScene().name : null; }
    try { o.bundles = cc && cc.assetManager && cc.assetManager.bundles ? Object.keys(cc.assetManager.bundles) : null; } catch(e) { o.bundles = 'ERR'; }
    o.rej = window.__k7 ? window.__k7.rej : []; o.err = window.__k7 ? window.__k7.err : [];
    return o;
  })()`;

  const t0 = Date.now();
  let last = '';
  for (let i = 0; i < Math.ceil(totalMs / 250); i += 1) {
    await sleep(250);
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    const v = r.result && r.result.value;
    if (!v) { console.log(`${Date.now() - t0}ms  <no value>`); continue; }
    const line = `inited=${v.inited} shouldLoad=${v.shouldLoad} paused=${v.paused} frames=${v.frames} scene=${v.scene} raf=${v.raf} rej=${(v.rej || []).length} err=${(v.err || []).length}`;
    if (line !== last) { console.log(`${String(Date.now() - t0).padStart(6)}ms  ${line}`); last = line; }
    if ((v.rej || []).length) { console.log('  REJ:', v.rej.join(' | ').slice(0, 800)); v.rej.length = 0; }
    if ((v.err || []).length) { console.log('  ERR:', v.err.join(' | ').slice(0, 800)); v.err.length = 0; }
  }
} catch (err) {
  console.error('FATAL:', err);
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
