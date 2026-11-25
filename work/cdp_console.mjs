/**
 * 无头 Edge 抓 console：用 CDP 起一个临时 profile，导航到 url，收集
 * Runtime.consoleAPICalled / Runtime.exceptionThrown / Log.entryAdded /
 * Network.loadingFailed / 4xx-5xx 响应，打印后退出。
 *
 * 用法：node work/cdp_console.mjs <url> [seconds]
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const url = process.argv[2];
const seconds = Number(process.argv[3] ?? 8);
import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9400 + Math.floor(Math.random() * 300);
const profile = await mkdtemp(join(tmpdir(), 'edge-cdp-'));

// [C盘防泄漏] 启动时清扫 1 小时以上的旧临时 profile（含杀不掉的僵尸浏览器）
sweepStaleProfiles();

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitVersion() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch { /* 还没起来 */ }
    await sleep(150);
  }
  throw new Error('Edge 调试端口没起来');
}

const logs = [];
const netFail = [];
const http4xx = [];
let seq = 0;

function fmtArg(a) {
  if (!a) return '?';
  if ('value' in a) return String(a.value);
  if (a.description) return a.description;
  if (a.preview && a.preview.description) return a.preview.description;
  return a.type || '?';
}

try {
  await waitVersion();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();

  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.id && pending.has(msg.id)) {
      const { res, rej } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) rej(new Error(msg.error.message));
      else res(msg.result);
      return;
    }
    const p = msg.params ?? {};
    if (msg.method === 'Runtime.consoleAPICalled') {
      logs.push(`[console.${p.type}] ` + (p.args ?? []).map(fmtArg).join(' '));
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails ?? {};
      logs.push('[exception] ' + (d.exception?.description || d.text || '?'));
    } else if (msg.method === 'Log.entryAdded') {
      const e = p.entry ?? {};
      const line = `[log:${e.source}/${e.level}] ${e.text}` + (e.url ? ` (${e.url})` : '');
      logs.push(line);
    } else if (msg.method === 'Network.loadingFailed') {
      netFail.push(`${p.type || '?'} ${p.errorText} `);
    } else if (msg.method === 'Network.responseReceived') {
      const r = p.response ?? {};
      if (r.status >= 400) http4xx.push(`${r.status} ${r.url}`);
    }
  });

  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Page.navigate', { url });
  await sleep(seconds * 1000);

  const ev = process.env.EVAL;
  if (ev) {
    const r = await send('Runtime.evaluate', {
      expression: ev, returnByValue: true, awaitPromise: true,
    }).catch((e) => ({ error: String(e) }));
    console.log('--- EVAL 结果 ---');
    console.log(JSON.stringify(r?.result?.value ?? r?.error ?? r));
    await sleep(2500);
  }

  // 抓一下页面内部状态（有 window.SG.audio 的话）
  const st = await send('Runtime.evaluate', {
    expression: 'JSON.stringify(window.SG && SG.audio ? SG.audio.state() : null)',
    returnByValue: true,
  }).catch(() => null);

  console.log('=== URL ' + url + ' ===');
  console.log('--- console ---');
  console.log(logs.length ? logs.join('\n') : '(空，没有任何 console 输出)');
  console.log('--- 网络失败 (Network.loadingFailed) ---');
  console.log(netFail.length ? netFail.join('\n') : '(无)');
  console.log('--- HTTP >=400 ---');
  console.log(http4xx.length ? http4xx.join('\n') : '(无)');
  console.log('--- SG.audio.state() ---');
  console.log(st?.result?.value ?? '(页面没有 SG.audio)');

  const bad = logs.filter((l) => /Failed to load|NotSupportedError|Uncaught|ERR_/i.test(l));
  console.log('--- 判定 ---');
  console.log(bad.length ? 'FAIL 命中关键字:\n' + bad.join('\n') : 'PASS 没有 Failed to load / NotSupportedError');
  process.exitCode = bad.length ? 1 : 0;
  ws.close();
} finally {
  // [C盘防泄漏] 整棵进程树都杀掉，再等一下删 profile，否则 Windows 上文件仍被占用
  const exited = new Promise((r) => proc.once('exit', r));
  // 掐掉以本 profile 为 --user-data-dir 的整组 msedge 进程，再删目录（有界，删不掉留给启动清扫）
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
  process.exit(process.exitCode ?? 0); // 清理完强制退出，防止句柄（WebSocket/Edge 子进程）吊住事件循环导致进程不退出
}
