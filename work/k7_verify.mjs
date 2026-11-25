/**
 * work/k7_verify.mjs - acceptance harness for the cocos web-mobile build.
 * Attaches BEFORE navigation (captures early console/exceptions), waits for the
 * launch scene instead of guessing a sleep, then walks Boot -> Campaign -> Battle.
 *
 * usage: node work/k7_verify.mjs <url> <outDir>
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9580 + Math.floor(Math.random() * 30);
const url = process.argv[2] || 'http://127.0.0.1:5173/cocos-build/web-mobile/index.html';
const outDir = process.argv[3] || 'F:\\sanguo\\work\\cocos_boot';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = `F:\\sanguo\\work\\_k7v_edge_${Date.now()}`;
mkdirSync(profile, { recursive: true });
mkdirSync(outDir, { recursive: true });

const child = spawn(EDGE, [
  '--no-first-run', '--no-default-browser-check',
  '--disable-features=Translate,msEdgeIdentityFeature',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--window-size=900,1500', 'about:blank',
], { stdio: 'ignore' });

let ws; let msgId = 0; const pending = new Map(); const logs = [];
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { resolve: res, reject: rej }));
};
const evaluate = async (expression, awaitPromise = true) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise, userGesture: true });
  if (r.exceptionDetails) return { __throw: (r.exceptionDetails.exception || {}).description || r.exceptionDetails.text };
  return r.result ? r.result.value : null;
};
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  const p = `${outDir}\\${name}.png`;
  writeFileSync(p, Buffer.from(s.data, 'base64'));
  console.log('  shot ->', p);
  return p;
};

const STATE = `(function(){
  var cc=window.cc,o={hasCC:!!cc};
  if(!cc) return o;
  if(cc.game){o.inited=cc.game._inited;o.shouldLoad=cc.game._shouldLoadLaunchScene;o.paused=cc.game.isPaused();}
  if(cc.director){o.frames=cc.director.getTotalFrames();o.scene=cc.director.getScene()?cc.director.getScene().name:null;}
  o.k7=window.__k7?{raf:window.__k7.raf,rej:window.__k7.rej.length,err:window.__k7.err.length}:null;
  return o;})()`;

try {
  let version = null;
  for (let i = 0; i < 100; i += 1) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) { version = await r.json(); break; } } catch {}
    await sleep(200);
  }
  if (!version) throw new Error('CDP not up');
  console.log('browser:', version.Browser);

  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); return; }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(m.params.type + ': ' + (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' '));
    else if (m.method === 'Runtime.exceptionThrown') logs.push('EXC: ' + ((m.params.exceptionDetails.exception || {}).description || m.params.exceptionDetails.text || ''));
    else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') logs.push('LOG-ERR: ' + m.params.entry.text);
  };
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__k7={raf:0,rej:[],err:[]};
      (function t(){window.__k7.raf++;requestAnimationFrame(t);})();
      window.addEventListener('unhandledrejection',function(e){window.__k7.rej.push(String((e.reason&&(e.reason.stack||e.reason.message))||e.reason).slice(0,400));});
      window.addEventListener('error',function(e){window.__k7.err.push(String(e.message).slice(0,400));});`,
  });

  const t0 = Date.now();
  await send('Page.navigate', { url });

  // wait for real boot completion (launch scene loaded => _shouldLoadLaunchScene false)
  let booted = null;
  for (let i = 0; i < 160; i += 1) {
    await sleep(250);
    const s = await evaluate(STATE, false);
    if (s && s.scene) { booted = { at: Date.now() - t0, state: s }; break; }
  }
  if (!booted) throw new Error('boot never reached a scene');
  console.log(`[1] booted in ${booted.at}ms -> scene=${booted.state.scene} frames=${booted.state.frames} inited=${booted.state.inited} shouldLoad=${booted.state.shouldLoad}`);
  console.log('  raw:', JSON.stringify(booted.state));

  // frames must keep rising
  const a = await evaluate(STATE, false);
  await sleep(1000);
  const b = await evaluate(STATE, false);
  console.log(`[2] frames ${a.frames} -> ${b.frames} over 1000ms (delta=${b.frames - a.frames}); scene=${b.scene}`);
  await shot('01_boot');

  // ---- Campaign
  const camp = await evaluate(`new Promise(function(res){
    var done=false;
    cc.director.loadScene('Campaign', function(err){
      done=true;
      res({err: err?String(err):null, scene: cc.director.getScene()?cc.director.getScene().name:null});
    });
    setTimeout(function(){ if(!done) res({timeout:true, scene: cc.director.getScene()?cc.director.getScene().name:null}); }, 20000);
  })`);
  console.log('[3] loadScene(Campaign):', JSON.stringify(camp));
  await sleep(2500);
  const campState = await evaluate(STATE, false);
  console.log('  state:', JSON.stringify(campState));
  await shot('02_campaign');

  // ---- Battle
  const battle = await evaluate(`new Promise(function(res){
    var done=false;
    cc.director.loadScene('Battle', function(err){
      done=true;
      res({err: err?String(err):null, scene: cc.director.getScene()?cc.director.getScene().name:null});
    });
    setTimeout(function(){ if(!done) res({timeout:true, scene: cc.director.getScene()?cc.director.getScene().name:null}); }, 30000);
  })`);
  console.log('[4] loadScene(Battle):', JSON.stringify(battle));
  await sleep(4000);
  const battleState = await evaluate(STATE, false);
  console.log('  state:', JSON.stringify(battleState));

  const audit = await evaluate(`(function(){
    var cc=window.cc, sc=cc.director.getScene(), out={scene:sc?sc.name:null,nodes:0,sprites:0,buttons:0,labels:[],topChildren:[]};
    if(!sc) return out;
    var walk=function(n){ out.nodes++; var c=n.components||[]; for(var i=0;i<c.length;i++){ var k=c[i];
      if(k instanceof cc.Sprite) out.sprites++;
      else if(k instanceof cc.Button) out.buttons++;
      else if(k instanceof cc.Label && k.string && out.labels.length<80) out.labels.push(k.string);
      }
      var ch=n.children||[]; for(var j=0;j<ch.length;j++) walk(ch[j]); };
    walk(sc);
    out.topChildren=(sc.children||[]).map(function(n){return n.name;});
    return out;})()`, false);
  console.log('[5] battle scene audit:', JSON.stringify(audit).slice(0, 4000));
  await shot('03_battle');

  const fin = await evaluate(STATE, false);
  console.log('[6] final state:', JSON.stringify(fin));
  console.log('--- CONSOLE/EXC (' + logs.length + ') ---');
  for (const l of logs) console.log('  ', l.replace(/\s+/g, ' ').slice(0, 400));
  console.log('TOTAL MS:', Date.now() - t0);
} catch (err) {
  console.error('FATAL:', err);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  try { child.kill(); } catch {}
}
