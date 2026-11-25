/**
 * 无头 Edge 截图 + 取页面内状态：给 R52/R80 的验收取证。
 *
 * 用法：node work/sfx_dbg/shot.mjs <name> <url> [settleMs] [evalJS] [extraEvalJS]
 * 产物：work/sfx_dbg/<name>.png + 控制台打印的 JSON（SG.audio.state / audioBusStats / 事件摘要）。
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const name = process.argv[2] ?? 'shot';
const url = process.argv[3];
const settle = Number(process.argv[4] ?? 3000);
// PowerShell 会把空字符串参数吃掉，用 '-' 当占位
const argOf = (i) => {
  const v = process.argv[i];
  return !v || v === '-' ? '' : v;
};
const evalJs = argOf(5);
const evalJs2 = argOf(6);
import { cleanupProfile, sweepStaleProfiles } from '../edge_temp_guard.mjs';
const EDGE = process.env.EDGE || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9500 + Math.floor(Math.random() * 400);
const profile = await mkdtemp(join(tmpdir(), 'edge-shot-'));

// [C盘防泄漏] 启动时清扫 1 小时以上的旧临时 profile（含杀不掉的僵尸浏览器）
sweepStaleProfiles();
const OUT = 'F:\\sanguo\\work\\sfx_dbg';

await mkdir(OUT, { recursive: true });

const proc = spawn(EDGE, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--mute-audio',
  '--autoplay-policy=no-user-gesture-required',
  '--window-size=1280,720',
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
    } catch { /* not yet */ }
    await sleep(150);
  }
  throw new Error('Edge 调试端口没起来');
}

const logs = [];
let seq = 0;

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
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ');
      logs.push(`[console.${msg.params.type}] ${args}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('[exception] ' + (msg.params.exceptionDetails?.exception?.description || msg.params.exceptionDetails?.text));
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res);
    ws.addEventListener('error', rej);
  });

  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url });
  await sleep(settle);

  if (evalJs) {
    const r = await send('Runtime.evaluate', { expression: evalJs, returnByValue: true, awaitPromise: true })
      .catch((e) => ({ error: String(e) }));
    console.log('--- EVAL 1 ---');
    console.log(JSON.stringify(r?.result?.value ?? r?.error ?? r));
    await sleep(900);
  }
  if (evalJs2) {
    const r = await send('Runtime.evaluate', { expression: evalJs2, returnByValue: true, awaitPromise: true })
      .catch((e) => ({ error: String(e) }));
    console.log('--- EVAL 2 ---');
    console.log(JSON.stringify(r?.result?.value ?? r?.error ?? r));
    await sleep(600);
  }

  // 可选：等到某个表达式为真再截图（抓"技能压暗"这种瞬时状态用）
  const waitJs = process.argv[7] ?? '';
  if (waitJs) {
    let hit = false;
    for (let i = 0; i < 150; i++) {
      const r = await send('Runtime.evaluate', { expression: waitJs, returnByValue: true }).catch(() => null);
      if (r?.result?.value) { hit = true; break; }
      await sleep(40);
    }
    console.log('--- WAIT ---');
    console.log(hit ? '命中等待条件，立即截图' : '等待超时，仍截图');
  }

  const shot = await send('Page.captureScreenshot', { format: 'png' });
  const file = join(OUT, `${name}.png`);
  await writeFile(file, Buffer.from(shot.data, 'base64'));
  console.log('--- PNG ---');
  console.log(file);

  const st = await send('Runtime.evaluate', {
    expression: 'JSON.stringify({audio: (window.SG&&SG.audio)?SG.audio.state():null, bus: (window.SG&&SG.audioBusStats)?SG.audioBusStats():null, hud: (document.getElementById("sg-audio-dbg")||{}).textContent||null})',
    returnByValue: true,
  }).catch(() => null);
  console.log('--- STATE ---');
  console.log(st?.result?.value ?? '(无)');
  if (logs.length) {
    console.log('--- CONSOLE ---');
    console.log(logs.slice(-25).join('\n'));
  }
  ws.close(); // 不 close 的话 WebSocket 会吊住事件循环，进程不退出（这也是之前 temp profile 泄漏的原因之一）
  process.exitCode = 0; // 用 exitCode 而不是 process.exit()，否则 finally 里的清理不会执行
} finally {
  // [C盘防泄漏] 整棵进程树都杀掉，再等一下删 profile，否则 Windows 上文件仍被占用
  const exited = new Promise((r) => proc.once('exit', r));
  // 掐掉以本 profile 为 --user-data-dir 的整组 msedge 进程，再删目录（有界，删不掉留给启动清扫）
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
  process.exit(process.exitCode ?? 0); // 清理完强制退出，防止句柄（WebSocket/Edge 子进程）吊住事件循环导致进程不退出
}
