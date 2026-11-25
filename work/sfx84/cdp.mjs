// 真浏览器验证（Edge headless + CDP，无第三方依赖，用 Node 全局 WebSocket）
// 目的：证明 SG.audio.magic(<技能号>) 请求的是**具体音效串**，不是目录名。
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const PORT = 9333;
const URL0 = process.argv[2] || 'http://127.0.0.1:5173/web/index.html?sfxdbg=1';
const PROFILE = path.join(os.tmpdir(), 'sg-edge-cdp-' + Date.now());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--no-first-run', '--no-default-browser-check', '--disable-extensions', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', '--window-size=480,900', 'about:blank',
], { stdio: 'ignore' });

async function targets() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const a = await r.json();
      const page = a.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* 还没起来 */ }
    await sleep(250);
  }
  throw new Error('CDP 没起来');
}

const page = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0;
const pending = new Map();
const logs = [];
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') {
    logs.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (m.method === 'Log.entryAdded') logs.push(m.params.entry.level + ': ' + m.params.entry.text);
};
function send(method, params = {}) {
  id += 1;
  return new Promise((res) => { pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.result?.exceptionDetails) return 'EXCEPTION: ' + JSON.stringify(r.result.exceptionDetails.exception?.description ?? r.result.exceptionDetails.text);
  return r.result?.result?.value;
}

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.navigate', { url: URL0 });
await sleep(2500);

const out = {};
out.title = await evalJs('document.title');
out.audioReady = await evalJs('!!(window.SG && SG.audio)');
out.table016 = await evalJs("SG.audio.magicTable()['016']");
out.resolve = await evalJs("['001','016','004','065','069','048','110'].map(function(k){return k+'='+SG.audio.magicKey(k)})");
// 逐个"放技"：这就是 main.js 的 sink 打的同一个 API
out.before = await evalJs('JSON.stringify(SG.audio.state().byName)');
for (const k of ['016', '004', '065', '069', '048', '110']) {
  await evalJs(`SG.audio.magic('${k}', {volume:0.7}) && 1`);
  await sleep(120);
}
await sleep(600);
out.after = await evalJs('JSON.stringify(SG.audio.state().byName)');
out.lastMagic = await evalJs('SG.audio.lastMagic()');
out.plays = await evalJs('SG.audio.state().plays');
out.unknown = await evalJs("String(SG.audio.magic('999'))");
out.dbgText = await evalJs("(document.getElementById('sg-audio-dbg')||{}).textContent || '(no dbg panel)'");
// 浏览器真实发起的网络请求：证明取的是具体 mp3 文件
out.netSfx = await evalJs("performance.getEntriesByType('resource').filter(function(e){return /\\/sfx\\//.test(e.name)}).map(function(e){return e.name.split('/').pop()}).sort()");
// 反证：main.js 现在仍在传 fx_dir_primary。'008' 在旧口径=虎咆目录，新表里是 8 号技能(火雷) -> m034snd01
out.dirPitfall = await evalJs("['008','016'].map(function(d){return d+' -> '+SG.audio.magicKey(d)})");

// 第二条：走 main.js 的真技能施放入口（?cast=16 虎咆震），看它当前请求的是什么
await send('Page.navigate', { url: URL0.split('?')[0] + '?cast=16,240,300&sfxdbg=1' });
await sleep(3000);
out.cast16 = {
  byName: await evalJs('JSON.stringify(SG.audio.state().byName)'),
  lastMagic: await evalJs('SG.audio.lastMagic()'),
  dbg: await evalJs("(document.getElementById('sg-audio-dbg')||{}).textContent || '(no dbg panel)'"),
};
// 播放器实际加载的 URL：证明请求了具体文件
out.srcList = await evalJs("Array.prototype.map.call(document.querySelectorAll('audio'),function(a){return a.src.split('/').pop()}).filter(Boolean)");

console.log(JSON.stringify(out, null, 1));
if (logs.length) console.log('--- console ---\n' + logs.slice(-20).join('\n'));
ws.close();
child.kill();
try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch { /* 浏览器还占着 */ }
process.exit(0);
