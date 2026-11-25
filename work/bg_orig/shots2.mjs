// 截图：CDP 直出 750×1334（clip 跟 canvas 对齐，不裁剪不重采样）。
// 用法：node shots2.mjs            → 跑内置 JOBS
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = 'F:\\sanguo\\work\\.edgeprof-cdp';
const PORT = 9223;
const OUTDIR = 'F:\\sanguo\\work\\bg_orig';
const BASE = 'http://127.0.0.1:5173/web/index.html';

const JOBS = [
  { name: 'general_in_battle', q: '?sim=300&freeze=1&terrain=4' },
  { name: 'general_attack', q: '?sim=360&freeze=1&terrain=4' },
  { name: 'general_fallback', q: '?sim=300&freeze=1&terrain=4&gen=off' },
  // 撤退：点画布里的「撤 退」按钮（设计坐标 630,1262 → 页面 646,1395）
  { name: 'general_retreat', q: '?sim=300&freeze=1&terrain=4', click: [646, 1395], after: 700 },
];

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

  for (const job of JOBS) {
    const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
    const s = (m, p = {}) => send(m, p, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: 782, height: 1500, deviceScaleFactor: 1, mobile: false });
    await s('Page.navigate', { url: BASE + job.q });
    await sleep(2400);
    if (job.click) {
      const [x, y] = job.click;
      for (const type of ['mousePressed', 'mouseReleased']) {
        await s('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1, buttons: type === 'mousePressed' ? 1 : 0 });
      }
      await sleep(job.after ?? 500);
    }
    const shot = await s('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 16, y: 133, width: 750, height: 1334, scale: 1 },
    });
    const out = `${OUTDIR}\\${job.name}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    const st = await s('Runtime.evaluate', {
      expression:
        'JSON.stringify({tick:__sanguo.state.world.tick,fled:__sanguo.state.world.fled,' +
        'g:__sanguo.state.world.units.filter(u=>u.isGeneral).map(u=>({s:u.side,cd:u.cd,alive:u.alive}))})',
      returnByValue: true,
    });
    const size = fs.statSync(out).size;
    console.log(`${job.name}: ${size}B  ${st.result?.value ?? ''}`);
    await send('Target.closeTarget', { targetId: target.id });
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
    console.error('shots failed:', e.message);
    process.exit(1);
  });
