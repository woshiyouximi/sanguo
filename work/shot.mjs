// 鐢?CDP 鎵撳紑椤甸潰锛氭姄 console / 寮傚父 + 鎴浘銆?// 鐢ㄦ硶: node shot.mjs <url> <out.png> [waitMs] [width] [height] [selectorToClip]
import { spawn, spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import { writeFileSync, readFileSync, mkdtempSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [url, out, waitArg, wArg, hArg, clipSel, extraJs, tapArg] = process.argv.slice(2);
const waitMs = Number(waitArg || 9000);
const W = Number(wArg || 750);
const H = Number(hArg || 1334);
const PORT = 9333 + Math.floor(Math.random() * 200);

const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));

// [C盘防泄漏] 启动时清扫 1 小时以上的旧临时 profile（含杀不掉的僵尸浏览器）
sweepStaleProfiles();
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  `--window-size=${W},${H}`,
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('devtools endpoint never came up');
}

const page = await findTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`[exception] ${d.exception?.description || d.text} @${d.url}:${d.lineNumber}`);
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    logs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
  }
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(waitMs);

// 椤甸潰閲岃窇鐐逛笢瑗匡紙鍏?stats / 鍒囧満鏅?/ 妯℃嫙鐐瑰嚮锛夛紝鍐嶇瓑涓€浼氬効璁╂覆鏌撹窡涓?// extraJs 鏀寔 "@鏂囦欢璺緞"锛坧wsh 浼犲紩鍙烽噷鐨勫弻寮曞彿浼氳鍚冩帀锛岄暱鑴氭湰璧版枃浠舵洿绋筹級
let evalCode = extraJs;
if (extraJs && extraJs.startsWith('@')) {
  evalCode = readFileSync(extraJs.slice(1), 'utf8');
}
if (evalCode && evalCode !== '-') {
  const r = await send('Runtime.evaluate', { expression: evalCode, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    console.log('[eval-exception]', r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  } else {
    console.log('[eval]', JSON.stringify(r.result?.value ?? null));
  }
  await sleep(2500);
}

// 妯℃嫙涓€娆℃寜鍘嬶紙CSS 鍍忕礌鍧愭爣锛夛紝楠岃瘉瑙︽帶閾捐矾
if (tapArg && tapArg !== '-') {
  const [tx, ty] = tapArg.split(',').map(Number);
  const base = { x: tx, y: ty, radiusX: 2, radiusY: 2, force: 1, id: 1 };
  await send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [base] });
  await sleep(90);
  await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  console.log('[tap]', tx, ty);
  await sleep(1200);
}

let clip;
if (clipSel && clipSel !== '-') {
  const r = await send('Runtime.evaluate', {
    expression: `JSON.stringify((() => { const e = document.querySelector(${JSON.stringify(clipSel)});
      const b = e.getBoundingClientRect();
      return { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.ceil(b.width), height: Math.ceil(b.height) }; })())`,
    returnByValue: true,
  });
  clip = JSON.parse(r.result.value);
  clip.scale = 1;
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, ...(clip ? { clip } : {}) });
writeFileSync(out, Buffer.from(shot.data, 'base64'));

// 椤甸潰鍐呮帰閽堬細canvas 灏哄 / 褰撳墠鍦烘櫙 / 鑺傜偣鏁?/ 瑙嗗彛
let probe = null;
try {
  const r = await send('Runtime.evaluate', {
    expression: `(() => {
      const c = document.querySelector('#GameCanvas');
      const scene = window.cc && cc.director && cc.director.getScene && cc.director.getScene();
      let nodes = 0;
      if (scene) { const walk = (n) => { nodes++; n.children.forEach(walk); }; walk(scene); }
      return JSON.stringify({
        canvas: c ? { w: c.width, h: c.height } : null,
        viewport: [window.innerWidth, window.innerHeight],
        scene: scene ? scene.name : null,
        nodeCount: nodes,
        title: document.title,
        clip: ${JSON.stringify(clip || null)},
      });
    })()`,
    returnByValue: true,
  });
  probe = r.result?.value ?? null;
} catch (e) {
  probe = `probe failed: ${e.message}`;
}

console.log(logs.join('\n'));
console.log('--- probe ---');
console.log(probe);
ws.close();
// [C盘防泄漏] 整棵进程树都杀掉，再等一下删 profile，否则 Windows 上文件仍被占用
// 掐掉以本 profile 为 --user-data-dir 的整组 msedge 进程，再删目录（有界，删不掉留给启动清扫）
try { edge.kill(); } catch { /* ignore */ }
await cleanupProfile(profile);
process.exit(0); // 清理完强制退出，防止句柄（WebSocket/Edge 子进程）吊住事件循环导致进程不退出
