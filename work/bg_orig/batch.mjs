// A2 战场背景批量截图：自己拉起 headless Edge（带调试端口）+ CDP 逐页抓图。
// 用法：node batch.mjs <jobs.json>
// jobs.json: [{ "url": "...", "out": "F:\\...png", "wait": 2200, "clip": "16,133,750,1334" }]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = 'F:\\sanguo\\work\\.edgeprof-cdp';
const PORT = 9223;

const jobsPath = process.argv[2];
if (!jobsPath) {
  console.error('usage: node batch.mjs <jobs.json>');
  process.exit(2);
}
const jobs = JSON.parse(readFileSync(jobsPath, 'utf8'));

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
  mkdirSync(PROFILE, { recursive: true });
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

  for (const job of jobs) {
    const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
    const { sessionId } = await send('Target.attachToTarget', {
      targetId: target.id,
      flatten: true,
    });
    const sendS = (m, p = {}) => send(m, p, sessionId);
    await sendS('Page.enable');
    await sendS('Runtime.enable');
    await sendS('Emulation.setDeviceMetricsOverride', {
      width: 782,
      height: 1500,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await sendS('Page.navigate', { url: job.url });
    await sleep(job.wait ?? 2200);
    const clip = job.clip
      ? (([x, y, width, height]) => ({ x, y, width, height, scale: 1 }))(
          job.clip.split(',').map(Number),
        )
      : undefined;
    const { data } = await sendS('Page.captureScreenshot', { format: 'png', clip });
    mkdirSync(dirname(job.out), { recursive: true });
    writeFileSync(job.out, Buffer.from(data, 'base64'));

    // ?bgbench=1 时把 <html data-bgbench> 一起读出来，作为截图之外的独立证据
    let bench = '';
    if (job.url.includes('bgbench=1')) {
      try {
        const r = await sendS('Runtime.evaluate', {
          expression: 'document.documentElement.dataset.bgbench || document.title || ""',
          returnByValue: true,
        });
        bench = r.result?.value || '';
      } catch {
        /* 忽略 */
      }
    }
    console.log(`${job.out} bytes=${Buffer.from(data, 'base64').length} bench=${bench}`);
    await send('Target.closeTarget', { targetId: target.id });
  }

  try {
    await send('Browser.close');
  } catch {
    /* 忽略 */
  }
  ws.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('batch failed:', e.message);
    process.exit(1);
  });
