// Battle HUD acceptance run: real CDP mouse clicks on the canvas, then read
// the live game state back. Proves the #battleui decorative layer (which sits
// above the canvas with pointer-events:none) did not move or swallow a single
// hit rectangle: every click lands on the same design-space coordinates that
// main.js toDesign()/hitTest() compute.
//
// usage: node _accept.mjs --port=9411 --url=... [--json=out.json]
import { writeFileSync } from 'node:fs';

const arg = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) arg[m[1]] = m[2];
}
const PORT = Number(arg.port || 9411);
const URL = arg.url || 'http://127.0.0.1:5173/web/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('no devtools page on port ' + PORT);
}

const page = await findPage();
const ws = new WebSocket(page.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const logs = [];
const errors = [];
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
    if (msg.params.type === 'error') errors.push(text);
  } else if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    const t = `[exception] ${d.exception?.description || d.text} @${d.url}:${d.lineNumber}`;
    logs.push(t); errors.push(t);
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    logs.push(`[log.${e.level}] ${e.text} ${e.url || ''}`);
    if (e.level === 'error') errors.push(`${e.text} ${e.url || ''}`);
  }
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const mid = ++id;
  pending.set(mid, { resolve, reject });
  ws.send(JSON.stringify({ id: mid, method, params }));
});
const evaluate = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' :: ' + expr);
  return r.result.value;
};

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: URL });
await sleep(Number(arg.wait || 12000));

const PROBE = `(() => {
  const s = window.__sanguo && window.__sanguo.state;
  const cv = document.getElementById('stage');
  const r = cv.getBoundingClientRect();
  return {
    rect: { left: +r.left.toFixed(2), top: +r.top.toFixed(2), width: +r.width.toFixed(2), height: +r.height.toFixed(2) },
    mode: s && s.mode,
    message: s && s.message,
    selectedSkill: s && s.selectedSkill,
    hpA: s && s.world && s.world.sides.A.general.hp,
    aliveB: s && s.world && s.world.sides.B.alive,
    fledA: s && s.world && s.world.fled.A,
    over: s && s.world && s.world.over,
    bui: (() => { const b = document.getElementById('battleui'); return b ? { on: b.classList.contains('on'), mode: b.getAttribute('data-mode'), transform: b.style.transform } : null; })(),
  };
})()`;

const rect = (await evaluate(PROBE)).rect;
// design-space -> client-space, the exact inverse of main.js toDesign()
const at = (dx, dy) => [rect.left + (dx / 750) * rect.width, rect.top + (dy / 1334) * rect.height];

async function click(dx, dy) {
  const [x, y] = at(dx, dy);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(50);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(260);
  return { design: [dx, dy], client: [+x.toFixed(1), +y.toFixed(1)] };
}

const out = { url: URL, before: await evaluate(PROBE), steps: [] };

// Optional: top up the general's qi/mp so a skill click can actually reach
// cast() instead of bouncing off castBlockReason('qi'). Only the game numbers
// are faked; the click path (hitTest -> pickSkill -> doCast -> cast) stays real.
if (arg.seedqi) {
  out.seeded = await evaluate(`(() => {
    const st = window.__sanguo.state;
    const g = st.world.sides.A.general;
    g.qi = 999; g.mp = g.mpMax;
    // slot.qi 在本 build 里是 undefined/NaN（makeSkillBar 的資料缺欄），
    // 会让 castBlockReason 永远回 'qi'；补成有限值只是为了让 cast() 真的跑一次。
    for (const s of st.skills || []) s.qi = 0;
    return { qi: g.qi, mp: g.mp, mpMax: g.mpMax, slots: (st.skills || []).map((s) => ({ name: s.name, mp: s.mp, qi: s.qi })) };
  })()`);
}

// 4 skill slots: skillSlotRect(i) = (116 + 98i, 1124, 88, 88) -> centre
for (let i = 0; i < 4; i += 1) {
  const hit = await click(116 + 98 * i + 44, 1124 + 44);
  out.steps.push({ what: `skill${i + 1}`, ...hit, after: await evaluate(PROBE) });
}

// cast the currently selected skill on the battlefield centre -> doCast/cast()
{
  const hit = await click(375, 620);
  out.steps.push({ what: 'field-cast', ...hit, after: await evaluate(PROBE) });
}

// the big red button: BTN_RETREAT = (528, 1220, 204, 84)
{
  const hit = await click(528 + 102, 1220 + 42);
  out.steps.push({ what: 'retreat', ...hit, after: await evaluate(PROBE) });
}

out.final = await evaluate(PROBE);
out.errors = errors;
out.log = logs.slice(-30);
if (arg.json) writeFileSync(arg.json, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
