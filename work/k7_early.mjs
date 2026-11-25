/**
 * work/k7_early.mjs - prove the 1209 fingerprint: call loadScene/preloadScene
 * while cc exists but game.init() has not resolved yet (bundles not loaded).
 * usage: node work/k7_early.mjs <url> [delayMs]
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9540 + Math.floor(Math.random() * 30);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const delay = Number(process.argv[3] || 250);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = `F:\\sanguo\\work\\_k7e_edge_${Date.now()}`;
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
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
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
    if (m.method === 'Runtime.consoleAPICalled') console_.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    if (m.method === 'Runtime.exceptionThrown') console_.push('EXC: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || '').slice(0, 400));
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });
  await sleep(delay);
  console.log('probe at +' + delay + 'ms:', JSON.stringify(await evalIn(`(function(){
    var cc=window.cc,o={hasCC:!!cc};
    if(cc&&cc.game){o.inited=cc.game._inited;o.engineInited=cc.game._engineInited;}
    if(cc&&cc.director){o.frames=cc.director.getTotalFrames();o.scene=cc.director.getScene()?cc.director.getScene().name:null;}
    try{o.bundleType=Object.prototype.toString.call(cc.assetManager.bundles);}catch(e){o.bundleType='ERR '+e;}
    try{o.bundleNames=cc.assetManager.bundles.map?cc.assetManager.bundles.map(function(b){return b&&b.name;}):'no-map';}catch(e){o.bundleNames='ERR '+e;}
    try{o.bundleLen=cc.assetManager.bundles.length;}catch(e){}
    return o;})()`)));
  console.log('loadScene:', JSON.stringify(await evalIn(
    `(function(){ try { return { ret: String(cc.director.loadScene('Battle')) }; } catch(e){ return { threw: String(e) }; } })()`,
  )));
  console.log('preloadScene:', JSON.stringify(await evalIn(
    `(function(){ try { cc.director.preloadScene('Battle'); return { ret: 'called' }; } catch(e){ return { threw: String(e) }; } })()`,
  )));
  await sleep(600);
  console.log('--- CONSOLE ---');
  for (const c of console_) console.log(' ', c.replace(/\s+/g, ' ').slice(0, 400));
} catch (err) {
  console.error('FATAL:', err);
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
