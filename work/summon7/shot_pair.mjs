/**
 * work/summon7/shot_pair.mjs —— 补兵技「施放前 / 施放后」同一战场的对照截图。
 *
 * 做法：用 ?dev=1&auto=1&freeze=1&sim=60 把战斗停在固定 tick（freeze 只停逻辑与镜头，
 * 仍然每帧 draw()），先截 before，再在页面里动态 import dist 的 core 直接
 * `cast(world,'A',seq,x,y)` + 手推 400 个 `step(world)`，等画面下一帧重绘后截 after。
 * 两枪同一 URL、同一 seed、同一相机，差别只有那一次 cast。
 *
 * 用法: node work/summon7/shot_pair.mjs [seq] [gx] [gy] [camX] [simTick]
 */
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const [seqArg, gxArg, gyArg, camArg, simArg] = process.argv.slice(2);
const seq = Number(seqArg ?? 5);
const gx = Number(gxArg ?? 20);
const gy = Number(gyArg ?? 6.5);
const camX = Number(camArg ?? 4);
const simTick = Number(simArg ?? 60);
const PORT = 9555 + Math.floor(Math.random() * 100);
const OUT_BEFORE = 'F:/sanguo/work/summon7/before.png';
const OUT_AFTER = 'F:/sanguo/work/summon7/after.png';

const url = `http://127.0.0.1:5199/web/index.html?dev=1&auto=1&freeze=1&sim=${simTick}&seed=7&follow=0`;
const profile = mkdtempSync(join(tmpdir(), 'edge-shot-'));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=750,1334',
  '--hide-scrollbars', '--enable-unsafe-swiftshader', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
let msgId = 0;
const pending = new Map();
const logs = [];

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function evalJs(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r?.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r?.result?.value;
}

async function shot(file) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.data, 'base64'));
  console.log('shot ->', file);
}

const COUNT_FN = `
function counts() {
  const w = window.__sanguo.state.world;
  const alive = (s) => w.units.filter((u) => u.side === s && u.alive && !u.isGeneral).length;
  return { tick: w.tick, A: alive('A'), B: alive('B'), sessions: w.sessions.length,
           marks: w.skillMarks.filter((m) => (m.summoned || 0) > 0).map((m) => m.summoned) };
}`;

try {
  for (let i = 0; i < 80; i += 1) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(250);
  }
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('no page target');
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
      return;
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
      logs.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
    }
    if (msg.method === 'Runtime.exceptionThrown') {
      logs.push('EXC ' + (msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text));
    }
  });
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url });

  let ready = false;
  for (let i = 0; i < 120; i += 1) {
    await sleep(250);
    try {
      ready = await evalJs(`!!(window.__sanguo && window.__sanguo.state && window.__sanguo.state.world && window.__sanguo.state.mode === 'fighting')`);
    } catch { ready = false; }
    if (ready) break;
  }
  if (!ready) throw new Error('battle never became ready; logs=' + logs.join(' | '));

  await evalJs(`${COUNT_FN}; window.__counts = counts;`);
  // 相机钉在同一个位置（freeze 只停逻辑与镜头，draw() 仍每帧跑）
  await evalJs(`window.__sanguo.state.camX = ${camX}; true`);
  await sleep(500);
  const before = await evalJs('window.__counts()');
  console.log('BEFORE', JSON.stringify(before));
  await evalJs(`window.__sanguo.state.message = '伏兵組陣：施放前'; true`);
  await sleep(250);
  await shot(OUT_BEFORE);

  const castRes = await evalJs(`(async () => {
    const m = await import('/dist/core/battle.js');
    const st = window.__sanguo.state;
    const w = st.world;
    w.sides.A.general.qi = m.QI_MAX;
    const r = m.cast(w, 'A', ${seq}, ${gx}, ${gy}, m.fxTtlOf(st.data, ${seq}));
    for (let i = 0; i < 400; i += 1) m.step(w);
    st.camX = ${camX};
    st.message = '伏兵組陣：施放後';
    return { ok: r.ok, killed: r.killed, hits: r.hits, damage: r.damage, reason: r.reason ?? null };
  })()`);
  console.log('CAST', JSON.stringify(castRes));
  await sleep(700);
  const after = await evalJs('window.__counts()');
  console.log('AFTER', JSON.stringify(after));
  await shot(OUT_AFTER);

  console.log('DIFF A', after.A - before.A, 'B', after.B - before.B, 'marks', JSON.stringify(after.marks));
  if (logs.length) console.log('PAGE ERRORS:', logs.slice(0, 8).join('\n'));
  else console.log('PAGE ERRORS: none');
} finally {
  try { child.kill(); } catch { /* ignore */ }
}
