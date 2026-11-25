/**
 * work/k7_freeze.mjs - reproduce the "frames 0 / scene null / 1209" fingerprint
 * by backgrounding the tab mid-boot (Chromium stops rAF for non-rendered pages).
 * usage: node work/k7_freeze.mjs <url>
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9500 + Math.floor(Math.random() * 30);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = `F:\\sanguo\\work\\_k7f_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });

const child = spawn(EDGE, [
  '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=900,1500', 'about:blank',
], { stdio: 'ignore' });

let ws; let msgId = 0; const pending = new Map(); const console_ = [];
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};
const evalIn = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: false });
  return r.result ? r.result.value : { err: JSON.stringify(r.exceptionDetails || {}).slice(0, 300) };
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
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') {
      console_.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    }
    if (m.method === 'Runtime.exceptionThrown') {
      console_.push('EXC: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '').slice(0, 300));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });

  const probe = `(function(){
    var cc=window.cc,o={hidden:document.hidden,vis:document.visibilityState,hasCC:!!cc};
    if(cc&&cc.game){o.inited=cc.game._inited;o.shouldLoad=cc.game._shouldLoadLaunchScene;}
    if(cc&&cc.director){o.frames=cc.director.getTotalFrames();o.scene=cc.director.getScene()?cc.director.getScene().name:null;}
    try{o.bundles=(cc&&cc.assetManager&&cc.assetManager.bundles)?cc.assetManager.bundles.map(function(b){return b.name;}):null;}catch(e){o.bundles='ERR';}
    return o;})()`;

  const t0 = Date.now();
  const log = async (tag) => {
    const v = await evalIn(probe);
    console.log(`${String(Date.now() - t0).padStart(6)}ms ${tag}  ${JSON.stringify(v)}`);
  };

  await sleep(1200);           // mid-boot: splash showing
  await log('after 1.2s');
  // open a second tab -> first tab becomes hidden -> rAF stops
  await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  console.log('--- opened 2nd tab (1st is now background) ---');
  await sleep(1500); await log('hidden +1.5s');
  await sleep(3000); await log('hidden +4.5s');
  await sleep(3000); await log('hidden +7.5s');
  console.log('loadScene from hidden tab:', JSON.stringify(await evalIn(
    `(function(){ try { var r=cc.director.loadScene('Battle'); return { ret: String(r) }; } catch(e){ return { threw: String(e) }; } })()`,
  )));
  await sleep(800);
  await log('after loadScene attempt');
  // bring the tab back to the foreground
  await send('Page.bringToFront');
  console.log('--- brought tab to front ---');
  await sleep(1200); await log('visible +1.2s');
  await sleep(2000); await log('visible +3.2s');
  console.log('loadScene from visible tab:', JSON.stringify(await evalIn(
    `(function(){ try { var r=cc.director.loadScene('Battle'); return { ret: String(r) }; } catch(e){ return { threw: String(e) }; } })()`,
  )));
  await sleep(4000); await log('after loadScene +4s');
  console.log('--- CONSOLE ---');
  for (const c of console_) console.log(' ', c.replace(/\s+/g, ' ').slice(0, 300));
} catch (err) {
  console.error('FATAL:', err);
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
