// 探针：批量打开战斗页，读 window.__sanguo.state 里主将的 tick 内状态。
// 用法：node probe.mjs "<query 模板，用 {N} 占位>" sim1 sim2 sim3 ...
import { spawn } from 'node:child_process';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = 'F:\\sanguo\\work\\.edgeprof-cdp';
const PORT = 9223;
const tpl = process.argv[2] || 'http://127.0.0.1:5173/web/index.html?sim={N}&freeze=1&terrain=4';
const nums = process.argv.slice(3).map(Number);
const EXPR =
  'JSON.stringify((()=>{const w=__sanguo.state.world;const us=w.units||[];' +
  'const gs=us.filter(u=>u.isGeneral).map(u=>({s:u.side,cd:u.cd,alive:u.alive,x:+u.x.toFixed(1)}));' +
  'let d=999;for(const a of us)if(a.side==="A"&&a.alive)for(const b of us)if(b.side==="B"&&b.alive)d=Math.min(d,Math.abs(a.x-b.x));' +
  'return{tick:w.tick,over:w.over,fled:w.fled,g:gs,minDx:+d.toFixed(1),aliveA:us.filter(u=>u.side==="A"&&u.alive).length,aliveB:us.filter(u=>u.side==="B"&&u.alive).length};})())';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function json(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return res.json();
}
async function waitPort(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      await json('/json/version');
      return true;
    } catch {
      await sleep(250);
    }
  }
  return false;
}

async function main() {
  const child = spawn(
    EDGE,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--force-device-scale-factor=1',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${PROFILE}`,
      'about:blank',
    ],
    { detached: true, stdio: 'ignore' },
  );
  child.unref();
  if (!(await waitPort(30000))) throw new Error('devtools port never opened');
  const version = await json('/json/version');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
  });
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const mid = ++id;
      pending.set(mid, { resolve, reject });
      ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
    });

  const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  const s = (m, p = {}) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 782, height: 1500, deviceScaleFactor: 1, mobile: false });

  for (const n of nums) {
    const url = tpl.replace('{N}', String(n));
    await s('Page.navigate', { url });
    await sleep(2000);
    let out = '';
    try {
      const r = await s('Runtime.evaluate', { expression: EXPR, returnByValue: true });
      out = r.result?.value ?? '';
    } catch (e) {
      out = 'eval failed: ' + e.message;
    }
    console.log(`sim=${n} ${out}`);
  }
  try {
    await send('Browser.close');
  } catch {
    /* ignore */
  }
  ws.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('probe failed:', e.message);
    process.exit(1);
  });
