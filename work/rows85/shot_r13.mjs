/**
 * R13 截图：campaign.html 页头三命令入口（武將資料 / 勢力地圖 / 內政終了）+ 武將資料浮层。
 *
 * 前置（pwsh 起）：
 *   node game/web/serve.mjs 5199
 *   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=work\rows85\ud_p0 about:blank
 *
 * 用法：node work/rows85/shot_r13.mjs [--port 9333] [--url .../campaign.html?demo=1] [--out F:\sanguo\work\rows85]
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const argOf = (n, d) => {
  const i = process.argv.indexOf('--' + n);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
const PORT = Number(argOf('port', '9333'));
const URL_ = argOf('url', 'http://127.0.0.1:5199/web/campaign.html?dev=1&demo=1');
const OUT = argOf('out', HERE);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (p) return p;
    } catch { /* 端口未起 */ }
    await sleep(250);
  }
  throw new Error('no page target on ' + PORT);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
      } else if (m.method) this.events.push(m);
    });
  }
  send(method, params = {}) {
    const id = ++this.id;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => reject(new Error(method + ' timeout')), 30000);
    });
  }
}

const page = await pageTarget();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expr) => {
  const r = await cdp.send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const shot = async (name) => {
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  const file = join(OUT, name);
  await writeFile(file, Buffer.from(data, 'base64'));
  return file;
};

await cdp.send('Page.navigate', { url: URL_ });
for (let i = 0; i < 200; i++) {
  if (await evalJs('document.readyState').catch(() => 'x') === 'complete') break;
  await sleep(100);
}
await sleep(800);
// 这个 user-data-dir 里有 P0 验证留下的存档（boot.battle 会先弹招降面板）
// ⇒ 先清干净再重载，截图才是「干净开局 + 三命令入口」
await evalJs('localStorage.clear()');
await cdp.send('Page.reload', { ignoreCache: true });
for (let i = 0; i < 200; i++) {
  if (await evalJs('document.readyState').catch(() => 'x') === 'complete') break;
  await sleep(100);
}
await sleep(1800);

const head = await evalJs(`(() => {
  const t = (id) => (document.getElementById(id)?.textContent || '').trim();
  const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden; };
  return { gold: t('gold'), cities: t('ct'), ym: t('ym'),
    btnGenerals: t('btnGenerals'), btnForces: t('btnForces'), btnEndMonth: t('btnEndMonth'),
    visGenerals: vis('btnGenerals'), visEndMonth: vis('btnEndMonth') };
})()`);
const files = [];
files.push(await shot('r13_head_three_commands.png'));

// 打开「武將資料」
await evalJs(`document.getElementById('btnGenerals').click()`);
await sleep(900);
const genState = await evalJs(`(() => {
  const rows = document.querySelectorAll('#genRows > *').length;
  return { sheetHidden: document.getElementById('generalSheet')?.hidden,
    ttl: (document.getElementById('genTtl')?.textContent || '').trim(),
    sub: (document.getElementById('genSub')?.textContent || '').trim(),
    rows, foot: (document.getElementById('genFoot')?.textContent || '').trim().slice(0, 40) };
})()`);
files.push(await shot('r13_general_sheet.png'));

// 关掉，再点「內政終了」
await evalJs(`document.querySelector('#generalSheet [data-close]').click()`);
await sleep(400);
await evalJs(`document.getElementById('btnEndMonth').click()`);
await sleep(900);
const endState = await evalJs(`(() => ({
  hint: (document.getElementById('hint')?.textContent || '').trim(),
  log: (document.getElementById('logbox')?.textContent || '').trim().split('\\n').slice(-2).join(' / '),
}))()`);
files.push(await shot('r13_endmonth.png'));

const errs = cdp.events.filter((e) => e.method === 'Runtime.exceptionThrown')
  .map((e) => (e.params.exceptionDetails.exception?.description || '').split('\n')[0]);
console.log(JSON.stringify({ url: URL_, head, genState, endState, exceptions: errs, files }, null, 2));
ws.close();
