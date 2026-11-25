/**
 * 临时排查：在页面脚本执行前装上 `SG.audio.sfx` 的包裹层，记录"谁在播 defense"。
 * 用法：node work/sfx_dbg/probe_calls.mjs <url> [settleMs]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const settle = Number(process.argv[3] ?? 5000);
import { cleanupProfile, sweepStaleProfiles } from '../edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9900 + Math.floor(Math.random() * 90);
const profile = await mkdtemp(join(tmpdir(), 'edge-probe-'));

// [C盘防泄漏] 启动时清扫 1 小时以上的旧临时 profile（含杀不掉的僵尸浏览器）
sweepStaleProfiles();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--mute-audio',
  '--autoplay-policy=no-user-gesture-required', `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const WRAP = `(function(){
  window.__calls = {};
  var wrap = function(a){
    if (!a || a.__wrapped) return a;
    var o = a.sfx.bind(a);
    a.sfx = function(n, op){
      var k = String(n);
      var st = (new Error().stack || '').split('\\n').slice(1, 4).map(function(s){return s.trim();}).join(' <- ');
      var key = k + ' || ' + st;
      window.__calls[key] = (window.__calls[key] || 0) + 1;
      return o(n, op);
    };
    a.__wrapped = 1;
    return a;
  };
  var t = setInterval(function(){
    if (window.SG && window.SG.audio) { wrap(window.SG.audio); clearInterval(t); window.__patched = true; }
  }, 1);
})();`;

let seq = 0;
try {
  for (let i = 0; i < 120; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) break; } catch {}
    await sleep(150);
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(m.error.message)) : p.res(m.result); }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Page.enable');
  await send('Runtime.enable');
  await send('Page.addScriptToEvaluateOnNewDocument', { source: WRAP });
  await send('Page.navigate', { url });
  await sleep(settle);
  const r = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({patched: window.__patched===true, calls: window.__calls, plays: SG.audio.state().byName, bus: SG.audioBusStats()})',
    returnByValue: true,
  });
  console.log(JSON.stringify(JSON.parse(r.result.value), null, 1));
  ws.close(); // 不 close 的话 WebSocket 会吊住事件循环，进程不退出
} finally {
  // [C盘防泄漏] 整棵进程树都杀掉，再等一下删 profile，否则 Windows 上文件仍被占用
  const exited = new Promise((r) => proc.once('exit', r));
  // 掐掉以本 profile 为 --user-data-dir 的整组 msedge 进程，再删目录（有界，删不掉留给启动清扫）
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
  process.exit(process.exitCode ?? 0); // 清理完强制退出，防止句柄（WebSocket/Edge 子进程）吊住事件循环导致进程不退出
}
