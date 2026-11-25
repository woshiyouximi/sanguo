// R187 诊断：看看网页里的 world 长什么样、cast 是否成功、弹丸为什么没登记。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const port = Number(process.argv[2] ?? 5231);
const profile = mkdtempSync(join(tmpdir(), 'edge-diag-'));
const dbgPort = 9700 + Math.floor(Math.random() * 200);
const edge = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${dbgPort}`, `--user-data-dir=${profile}`,
  '--window-size=750,1334', '--no-first-run', '--enable-unsafe-swiftshader', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page = null;
for (let i = 0; i < 120 && !page; i += 1) {
  try {
    const r = await fetch(`http://127.0.0.1:${dbgPort}/json/list`);
    page = (await r.json()).find((t) => t.type === 'page' && t.webSocketDebuggerUrl) ?? null;
  } catch { /* wait */ }
  if (!page) await sleep(250);
}
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) reject(new Error(JSON.stringify(m.error))); else resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${port}/web/?dev=1&auto=1&freeze=1&seed=7` });
for (let i = 0; i < 120; i += 1) {
  const r = await send('Runtime.evaluate', { expression: `Boolean(window.__sanguo?.booted && window.__sanguo.state.mode === 'fighting')`, returnByValue: true });
  if (r.result?.value) break;
  await sleep(250);
}
const r = await send('Runtime.evaluate', {
  expression: `(async () => {
    const S = window.__sanguo.state;
    const B = await import('/dist/core/battle.js');
    const R = await import('/dist/core/smartscript/runtime.js');
    const w = S.world;
    const gA = w.sides.A.general;
    const gB = w.sides.B.general;
    const a = w.units.find((u) => u.side === 'A' && u.isGeneral);
    const b = w.units.find((u) => u.side === 'B' && u.isGeneral);
    const info = {
      keysSides: Object.keys(w.sides.A),
      generalA: gA ? Object.keys(gA) : null,
      hpA: gA?.hp, hpB: gB?.hp, hpMaxB: gB?.hpMax,
      aUnit: a ? { x: a.x, y: a.y, hp: a.hp } : null,
      bUnit: b ? { x: b.x, y: b.y, hp: b.hp, isGeneral: b.isGeneral } : null,
      over: w.over, tick: w.tick,
      hasProjectilesOf: typeof R.projectilesOf,
      hasCast: typeof B.cast,
    };
    gA.mp = gA.mpMax; gA.qi = 999;
    const rr = B.cast(w, 'A', 2, 16, 6, B.fxTtlOf(S.data, 2));
    const steps = [];
    for (let i = 0; i < 16; i += 1) {
      B.step(w);
      const fl = R.projectilesOf(w);
      const s = w.sessions[w.sessions.length - 1];
      steps.push({ i, tick: w.tick, n: fl.length, born: fl[0]?.bornTick ?? null, life: fl[0]?.lifeTick ?? null,
        sess: w.sessions.length, frame: s ? s.frame : null, done: s ? s.done : null, holding: s ? s.holding : null,
        hpB: gB.hp, objs: s ? s.run.objects.size : null });
    }
    return JSON.stringify({ info, cast: { ok: rr.ok, reason: rr.reason, hits: rr.hits, damage: rr.damage }, steps });
  })()`,
  returnByValue: true,
  awaitPromise: true,
});
if (r.exceptionDetails) console.log('[exc]', r.exceptionDetails.exception?.description || JSON.stringify(r.exceptionDetails));
else console.log(JSON.stringify(JSON.parse(r.result.value), null, 1));
ws.close();
try { edge.kill(); } catch { /* ignore */ }
await sleep(400);
try { rmSync(profile, { recursive: true, force: true }); } catch { /* ignore */ }
process.exit(0);
