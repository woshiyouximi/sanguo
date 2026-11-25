// R187：用 CDP 抓「武将技投射物」的改前/改后截图。
// 用法：node work/proj/shots.mjs <after|before> [port]
//   前置：dist 已由 `tsc -p tsconfig.build.json` 构建，`node web/serve.mjs 5231` 在跑。
// 每张图：dev=1&auto=1&freeze=1 起战斗 → 每张截图前 __sanguo.startBattle() 重开一局（世界干净、可复现）
// → 钉死双方主将坐标 → cast 指定 seq → 手动 step 到「投射物已出现 + 再飞 4 tick」→ 冻结画面
// → Page.bringToFront → captureScreenshot。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const phase = process.argv[2] ?? 'after';
const port = Number(process.argv[3] ?? 5231);
const out = new URL('./', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

// 要截的技（seq → 手动步进的 tick 上限，改前/改后取同一个 tick 才可对照）：
// 落月弓 / 御飛刀 / 連弩 / 半月斬 / 落日弓 / 鬼戟 / 三日月斬 / 日月輪斬
const TARGETS = [[2, 74], [13, 74], [46, 54], [50, 59], [52, 74], [59, 74], [83, 59], [107, 59]];

const profile = mkdtempSync(join(tmpdir(), 'edge-proj-'));
const dbgPort = 9400 + Math.floor(Math.random() * 300);
const edge = spawn(EDGE, [
  '--headless=new',
  `--remote-debugging-port=${dbgPort}`,
  `--user-data-dir=${profile}`,
  '--window-size=750,1334',
  '--hide-scrollbars',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--enable-unsafe-swiftshader',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findTarget() {
  for (let i = 0; i < 120; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
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
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error))); else resolve(msg.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
  return r.result?.value ?? null;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `http://127.0.0.1:${port}/web/?dev=1&auto=1&freeze=1&seed=7` });

for (let i = 0; i < 120; i += 1) {
  const ready = await evaluate(`Boolean(window.__sanguo && window.__sanguo.booted && window.__sanguo.state.mode === 'fighting' && window.__sanguo.state.world)`);
  if (ready) break;
  await sleep(250);
}
console.log('[boot]', await evaluate(`JSON.stringify({ mode: window.__sanguo?.state?.mode ?? null, booted: Boolean(window.__sanguo?.booted) })`));

const shot = async (seq, cap) => {
  const script = `(async () => {
    await window.__sanguo.startBattle();
    await new Promise((res) => requestAnimationFrame(res));
    const S = window.__sanguo.state;
    const B = await import('/dist/core/battle.js');
    const R = await import('/dist/core/smartscript/runtime.js');
    const w = S.world;
    const a = w.units.find((u) => u.side === 'A' && u.isGeneral);
    const b = w.units.find((u) => u.side === 'B' && u.isGeneral);
    a.x = 24; a.y = 6.5; a.prevX = a.x; a.prevY = a.y;
    b.x = 16; b.y = 6; b.prevX = b.x; b.prevY = b.y;
    a.alive = true; b.alive = true;
    const gB = w.sides.B.general;
    gB.alive = true; gB.hp = gB.maxHp;
    const gA = w.sides.A.general;
    gA.alive = true; gA.mp = 99999; gA.mpMax = 99999; gA.qi = 99999;
    const hp0 = gB.hp;
    const r = B.cast(w, 'A', ${seq}, 16, 6, B.fxTtlOf(S.data, ${seq}));
    const dmg = [];
    let last = hp0;
    let seenAt = -1;
    let steps = 0;
    for (let i = 0; i < ${cap}; i += 1) {
      B.step(w);
      steps += 1;
      if (gB.hp !== last) { dmg.push(w.tick); last = gB.hp; }
      if (seenAt < 0 && R.projectilesOf(w).length > 0) seenAt = i;
      if (seenAt >= 0 && i - seenAt >= 4) break;
      if (w.over) break;
    }
    const flights = R.projectilesOf(w).map((f) => ({ seq: f.seq, dir: f.dir, res: f.resource, born: f.bornTick, life: f.lifeTick, hit: f.hitFrame }));
    S.camX = B.camera(w);
    S.floaters.length = 0;
    const magic = S.data.magics.find((m) => m.SEQUENCE === ${seq});
    S.message = magic ? magic.NAME : String(${seq});
    await new Promise((res) => requestAnimationFrame(res));
    await new Promise((res) => requestAnimationFrame(res));
    return JSON.stringify({ seq: ${seq}, ok: r.ok, reason: r.reason ?? null, steps, seenAt, tick: w.tick,
      hp: [hp0, gB.hp], dmgTicks: dmg, flights: flights.filter((f) => f.seq === ${seq}),
      allFlights: flights.length, tickRate: B.TICK_HZ });
  })()`;
  const info = JSON.parse(await evaluate(script));
  await send('Page.bringToFront');
  await sleep(220);
  const png = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(join(out, `${phase}_seq${seq}.png`), Buffer.from(png.data, 'base64'));
  console.log(`[${phase}] seq=${info.seq} ok=${info.ok}${info.reason ? '/' + info.reason : ''} steps=${info.steps} seenAt=${info.seenAt} hp=${info.hp.join('→')} dmgTick=[${info.dmgTicks.join(',')}] flights=${JSON.stringify(info.flights)}`);
};

for (const [seq, cap] of TARGETS) {
  try {
    await shot(seq, cap);
  } catch (err) {
    console.log(`[${phase}] seq=${seq} FAILED ${err.message}`);
  }
}

ws.close();
try { edge.kill(); } catch { /* ignore */ }
await sleep(400);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(0);
