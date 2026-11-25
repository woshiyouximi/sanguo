// Battle-page CDP driver: attach to an already-Start-Process'd Edge, then
// navigate / evaluate / tap / screenshot. Edge launching stays in PowerShell
// (Start-Process with an argument array) so this file owns only the protocol.
//
// usage: node _cdp.mjs --port=N --url=U --out=FILE [--w=750 --h=1334]
//                      [--wait=9000] [--js=file.js] [--tap=x,y] [--tap2=x,y]
//                      [--eval="expr"] [--json=out.json]
import { writeFileSync, readFileSync } from 'node:fs';

const arg = {};
for (const a of process.argv.slice(2)) {
  const m = /^--([^=]+)=(.*)$/.exec(a);
  if (m) arg[m[1]] = m[2];
}
const PORT = Number(arg.port || 9400);
const URL = arg.url || 'http://127.0.0.1:5173/web/';
const W = Number(arg.w || 750);
const H = Number(arg.h || 1334);
const WAIT = Number(arg.wait || 9000);

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

await new Promise((r) => ws.addEventListener('open', r));
await send('Page.enable');
await send('Runtime.enable');
await send('Log.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: false,
});
await send('Page.navigate', { url: URL });
await sleep(WAIT);

const out = {};

if (arg.js) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: readFileSync(arg.js, 'utf8'),
    awaitPromise: true, returnByValue: true, allowUnsafeEvalBlockedByCSP: true,
  });
  out.js = exceptionDetails ? { error: exceptionDetails.text } : result.value;
}

if (arg.eval) {
  const { result, exceptionDetails } = await send('Runtime.evaluate', {
    expression: arg.eval, awaitPromise: true, returnByValue: true,
  });
  out.eval = exceptionDetails ? { error: exceptionDetails.text } : result.value;
}

for (const key of ['tap', 'tap2', 'tap3']) {
  if (!arg[key]) continue;
  const [x, y] = arg[key].split(',').map(Number);
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', clickCount: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(400);
  out[key] = { x, y };
}

if (arg.tap && arg.probe) {
  const { result } = await send('Runtime.evaluate', {
    expression: arg.probe, awaitPromise: true, returnByValue: true,
  });
  out.probe = result.value;
}

if (arg.out) {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
  writeFileSync(arg.out, Buffer.from(shot.data, 'base64'));
  out.shot = arg.out;
}

out.errors = errors;
out.log = logs.slice(-40);
if (arg.json) writeFileSync(arg.json, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
ws.close();
