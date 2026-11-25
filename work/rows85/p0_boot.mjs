/**
 * R86 / P0 死档验证：CDP 真跑一遍「打完仗回大地图」。
 *
 * 前置（由 pwsh 起）：
 *   node game/web/serve.mjs 5199                     # 站点根 = game/
 *   msedge --headless=new --remote-debugging-port=9333 --user-data-dir=work\rows85\ud_p0 about:blank
 *
 * 流程：
 *   1. 打开 /web/campaign.html（正常首访，模块能跑完）
 *   2. Runtime.evaluate 注入 localStorage 种子（p0_seed.mjs 造的 store + 旧键，boot.battle=true）
 *   3. Page.reload → 这一次就是"打完仗后第一次进大地图"，修好前必崩 surState TDZ
 *   4. 收 Runtime.exceptionThrown / console.error / Log.entryAdded(error)
 *   5. 打印 DOM 状态：页头 金/城、地图 canvas 尺寸、招降面板是否弹出、地圖是否畫了
 *
 * 用法：node work/rows85/p0_boot.mjs [--port 9333] [--url http://127.0.0.1:5199/web/campaign.html]
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const argOf = (name, dflt) => {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
};
const PORT = Number(argOf('port', '9333'));
const URL_ = argOf('url', 'http://127.0.0.1:5199/web/campaign.html');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return { page, list };
    } catch { /* 端口还没起来 */ }
    await sleep(250);
  }
  throw new Error(`CDP ${PORT} 无 page target`);
}

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.events = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      } else if (msg.method) {
        this.events.push(msg);
      }
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
  errs() {
    const out = [];
    for (const e of this.events) {
      if (e.method === 'Runtime.exceptionThrown') {
        const d = e.params.exceptionDetails;
        out.push('EXCEPTION: ' + (d.exception?.description || d.text || '?').split('\n').slice(0, 3).join(' | '));
      }
      if (e.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(e.params.type)) {
        out.push(e.params.type.toUpperCase() + ': ' + e.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
      }
      if (e.method === 'Log.entryAdded' && ['error', 'warning'].includes(e.params.entry.level)) {
        out.push('LOG-' + e.params.entry.level + ': ' + e.params.entry.text);
      }
    }
    return out;
  }
}

const seed = JSON.parse(await readFile(join(HERE, 'seed_bootbattle.json'), 'utf8'));
const { page } = await targets();
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
const cdp = new CDP(ws);
await cdp.send('Page.enable');
await cdp.send('Runtime.enable');
await cdp.send('Log.enable');
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

const evalJs = async (expression) => {
  const r = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result?.value;
};
const waitReady = async () => {
  for (let i = 0; i < 200; i++) {
    if (await evalJs('document.readyState').catch(() => 'x') === 'complete') return true;
    await sleep(100);
  }
  return false;
};

// ① 首次正常打开（预热：让页面在本 origin 下跑一次，顺便确保 CDN/字体不拖时间）
await cdp.send('Page.navigate', { url: URL_ });
await waitReady();
await sleep(600);
const baseline = cdp.errs();       // 首访自身的 console（不进最终判定）
cdp.events.length = 0;

// ② 注入种子：store(sanguo_saves_v1) + 旧键(sanguo_campaign_v1)
await evalJs(`(() => {
  localStorage.setItem('sanguo_saves_v1', ${JSON.stringify(seed.store)});
  localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(seed.legacy)});
  return 'seeded';
})()`);

// ③ 重载 = 打完仗第一次进大地图
cdp.events.length = 0;
await cdp.send('Page.reload', { ignoreCache: true });
await waitReady();
await sleep(1500);

const state = await evalJs(`(() => {
  const t = (id) => (document.getElementById(id)?.textContent || '').trim();
  const cv = document.getElementById('map');
  return {
    gold: t('gold'), cities: t('ct'), rec: t('rec'), yearMonth: t('ym'),
    listRows: document.querySelectorAll('#list .card, #list .city, #list li').length,
    mapBlank: !cv || !cv.width || !cv.height,
    mapSize: cv ? cv.width + 'x' + cv.height : '',
    surSheetHidden: document.getElementById('surrenderSheet')?.hidden,
    surCards: document.querySelectorAll('#surCards .sur-card, #surCards > *').length,
    bootErr: window.__bootErr || null,
    actions: document.querySelectorAll('#actions button').length,
  };
})()`);

const errs = cdp.errs();
console.log(JSON.stringify({
  url: URL_,
  crashErrors: errs,
  firstLoadWarnings: baseline.filter((x) => x.startsWith('EXCEPTION')),
  state,
}, null, 2));
ws.close();
