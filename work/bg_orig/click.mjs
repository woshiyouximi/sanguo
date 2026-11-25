// 真点击验收：「撤 退」可用、「突 擊」置灰。
// 用法：node click.mjs
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = 'F:\\sanguo\\work\\.edgeprof-cdp';
const PORT = 9223;
const OUTDIR = 'F:\\sanguo\\work\\bg_orig';
const BASE = 'http://127.0.0.1:5173/web/index.html';

// 设计坐标 → 页面坐标：画布位图 750×1334 落在页面 (16,133)
const PAGE = (sx, sy) => [16 + sx, 133 + sy];
const BTN_RETREAT = PAGE(630, 1262);
const BTN_ASSAULT = PAGE(630, 1166);

const JOBS = [
  // 不冻结：freeze=1 会在 sim 结束后只 draw() 一次，此时背景贴图还没解码完 → 拍到纯色底。
  { name: 'retreat_click', q: '?sim=60&terrain=7', click: BTN_RETREAT, label: '撤 退' },
  { name: 'assault_click', q: '?sim=60&terrain=7', click: BTN_ASSAULT, label: '突 擊' },
];

const PROBE =
  '(!window.__sanguo||!__sanguo.state||!__sanguo.state.world)?"null":' +
  'JSON.stringify(((s)=>({tick:s.world.tick,over:s.world.over,endReason:s.world.endReason||null,' +
  'fled:s.world.fled,status:s.world.status,message:s.message,' +
  'units:s.world.units.length,fleeing:s.world.units.filter(u=>u.flee).length,' +
  'aliveA:s.world.units.filter(u=>u.side==="A"&&u.alive).length,' +
  'aliveB:s.world.units.filter(u=>u.side==="B"&&u.alive).length}))(__sanguo.state))';

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

  const report = [];
  for (const job of JOBS) {
    const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
    const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
    const s = (m, p = {}) => send(m, p, sessionId);
    await s('Page.enable');
    await s('Runtime.enable');
    await s('Emulation.setDeviceMetricsOverride', { width: 782, height: 1500, deviceScaleFactor: 1, mobile: false });
    await s('Page.navigate', { url: BASE + job.q });
    // 等 sim 真正跑完：startBattle 是 async（要 await 图集/技能表），只看固定 sleep 会拍到预览世界
    const probe = async () => {
      const r = await s('Runtime.evaluate', { expression: PROBE, returnByValue: true });
      if (r.exceptionDetails) throw new Error('probe threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 300));
      const v = r.result.value;
      return v === 'null' ? { tick: -1, over: false, message: null, units: 0, fleeing: 0 } : JSON.parse(v);
    };
    const wantTick = Number.parseInt((job.q.match(/sim=(\d+)/) ?? [])[1] ?? '0', 10);
    const t0 = Date.now();
    let before = await probe();
    while (before.tick < wantTick && Date.now() - t0 < 30000) {
      await sleep(300);
      before = await probe();
    }
    if (before.tick < wantTick) throw new Error(`sim never reached tick ${wantTick} (got ${before.tick})`);
    // 等背景/图集的图片解码完（首帧可能还是纯色底）
    await sleep(1600);
    const [x, y] = job.click;
    await s('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'none', buttons: 0 });
    await s('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
    await s('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
    await sleep(900);
    const after = await probe();
    const shot = await s('Page.captureScreenshot', {
      format: 'png',
      clip: { x: 16, y: 133, width: 750, height: 1334, scale: 1 },
    });
    const out = `${OUTDIR}\\${job.name}.png`;
    fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
    report.push({ job: job.name, label: job.label, at: [x, y], before, after, bytes: fs.statSync(out).size });
    console.log(`${job.name} (${job.label}) @${x},${y}`);
    console.log('  before', JSON.stringify(before));
    console.log('  after ', JSON.stringify(after));
    await send('Target.closeTarget', { targetId: target.id });
  }
  fs.writeFileSync(`${OUTDIR}\\click_report.json`, JSON.stringify(report, null, 2), 'utf8');
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
    console.error('click failed:', e.message);
    process.exit(1);
  });
