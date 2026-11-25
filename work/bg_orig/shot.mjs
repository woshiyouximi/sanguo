// A2 战场背景截图：用 CDP 驱动 headless Edge 抓 canvas 区域。
// 为什么不用 --screenshot：本机 Edge 158 的 --screenshot/--dump-dom 快捷路径已失效
// （launcher 进程立刻 exit 0，真实浏览器被留在后台，没人写文件），但 CDP 端口正常。
//
// 用法：node shot.mjs <url> <out.png> [clipX,clipY,clipW,clipH]
// 环境变量：EDGE_PORT（默认 9223）
import { writeFileSync } from 'node:fs';

const PORT = process.env.EDGE_PORT || '9223';
const [, , url, out, clipArg] = process.argv;
if (!url || !out) {
  console.error('usage: node shot.mjs <url> <out.png> [x,y,w,h]');
  process.exit(2);
}
const clip = clipArg
  ? (([x, y, width, height]) => ({ x, y, width, height, scale: 1 }))(
      clipArg.split(',').map(Number),
    )
  : undefined;

async function http(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return res.json();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const version = await http('/json/version');
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

  // 新开一个 target 并 attach
  const target = await http(`/json/new?${encodeURIComponent(url)}`, 'PUT');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  const sendS = (m, p = {}) => send(m, p, sessionId);

  await sendS('Page.enable');
  // 视口固定 782x1500、dpr=1 → 与旧 headless 的窗口尺寸一致，画布落在 (16,133)
  await sendS('Emulation.setDeviceMetricsOverride', {
    width: 782,
    height: 1500,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await sendS('Page.navigate', { url });
  await sleep(2200); // 加载 dist 模块 + 贴图解码 + sim 跑完
  const { data } = await sendS('Page.captureScreenshot', { format: 'png', clip });
  writeFileSync(out, Buffer.from(data, 'base64'));
  await send('Target.closeTarget', { targetId: target.id });
  ws.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error('shot failed:', e.message);
    process.exit(1);
  });
