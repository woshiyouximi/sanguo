/**
 * R192 战斗画面截图（CDP，headless Edge）：先 Page.bringToFront 再截。
 *
 *   node work/tick60/shot_battle.mjs <url> <out.png> [waitMs] [W] [H]
 *
 * 用 `?dev=1&auto=1&sim=N&freeze=1` 把世界同步步进到第 N tick 再冻住 —— 两次截图用同一个 sim，
 * 世界状态逐 tick 相同，差别只在倒计时牌面上的数字（这正是本轮要证明的东西）。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanupProfile, sweepStaleProfiles } from '../../work/edge_temp_guard.mjs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [url, out, waitArg, wArg, hArg] = process.argv.slice(2);
const waitMs = Number(waitArg || 12000);
const W = Number(wArg || 750);
const H = Number(hArg || 1334);
const PORT = 9500 + Math.floor(Math.random() * 300);

const profile = mkdtempSync(join(tmpdir(), 'edge-tick60-'));
sweepStaleProfiles();

const edge = spawn(
  EDGE,
  [
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
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch {
      /* not up yet */
    }
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
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    logs.push(`[console.${msg.params.type}] ${text}`);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push(`[exception] ${d.exception?.description || d.text} @${d.url}:${d.lineNumber}`);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params }));
  });

await new Promise((r) => ws.addEventListener('open', r));
await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(waitMs);
// 题面要求的顺序：先 bringToFront，再截图
await send('Page.bringToFront');
await sleep(600);

const probe = await send('Runtime.evaluate', {
  expression: `JSON.stringify((() => {
    const c = document.querySelector('#GameCanvas');
    const s = window.SG?.state ?? null;
    return {
      title: document.title,
      canvas: c ? { w: c.width, h: c.height } : null,
      viewport: [innerWidth, innerHeight],
      mode: s?.mode ?? null,
      tick: s?.world?.tick ?? null,
      over: s?.world?.over ?? null,
      clock: document.querySelector('#ClockLabel')?.textContent ?? null,
    };
  })())`,
  returnByValue: true,
});
console.log('[probe]', probe.result?.value ?? null);

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('[shot]', out);
if (logs.length) console.log(logs.slice(0, 20).join('\n'));

ws.close();
try {
  edge.kill();
} catch {
  /* ignore */
}
await cleanupProfile(profile);
process.exit(0);
