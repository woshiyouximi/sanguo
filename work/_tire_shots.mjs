// 疲勞系統驗收截圖：city / battle / month
// 用法：node work/_tire_shots.mjs
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9334;
const BASE = 'http://127.0.0.1:5199/web/';
const OUT = 'F:\\sanguo\\work\\';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_tire',
  '--window-size=750,1334', 'about:blank',
], { stdio: 'ignore' });

async function waitVersion() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return; } catch {}
    await sleep(250);
  }
  throw new Error('edge devtools not ready');
}

class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); }
  static async open(url) {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' });
    const info = await r.json();
    const ws = new WebSocket(info.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    const p = new Page(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && p.pending.has(m.id)) {
        const { res, rej } = p.pending.get(m.id); p.pending.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    await p.send('Page.enable');
    await p.send('Runtime.enable');
    await p.send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
    return p;
  }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async eval(expression) {
    const r = await this.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + JSON.stringify(r.exceptionDetails.exception?.description || ''));
    return r.result?.value;
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      try { if (await this.eval('document.readyState') === 'complete') break; } catch {}
    }
    await sleep(1200);
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(OUT + name, Buffer.from(r.data, 'base64'));
    console.log('[shot]', name);
  }
  close() { try { this.ws.close(); } catch {} }
}

const SAVE = {
  seeded: true, scenario: 1, month: 4, gold: 5000, wins: 2, losses: 0, defWins: 0,
  log: [{ t: '1年4月', s: '我軍攻克代縣，士氣大振。', k: 'win' }],
  owned: ['代縣'],
  cities: { 代縣: { troops: 5000, pop: 180000, money: 3000, morale: 80 } },
  tire: { 劉焉: 37, 關羽: 0 },
  last: '代縣', ts: Date.now(),
};

function seed(save) {
  const ts = Date.now();
  const snap = { ...save, ts };
  const store = { v: 1, last: 1, slots: [{ ts, name: '驗收', snapshot: snap }, null, null, null, null, null, null, null, null, null] };
  return `(() => {
    localStorage.clear();
    localStorage.setItem('sanguo_saves_v1', ${JSON.stringify(JSON.stringify(store))});
    localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(JSON.stringify(snap))});
    return true;
  })()`;
}

try {
  await waitVersion();
  const page = await Page.open(BASE + 'index.html');

  // 1) 內政頁：疲勞 63/100（主將 劉焉，≥60 顯示橙色）
  const s1 = { ...SAVE, tire: { 劉焉: 63 } };
  await page.eval(seed(s1));
  await page.goto(BASE + 'city.html?city=' + encodeURIComponent('代縣'));
  console.log('city text has 疲勞:', await page.eval(`document.body.innerText.includes('疲勞')`));
  console.log('city major:', await page.eval(`window.__city && window.__city.M.majorOf(window.__city.save, window.__city.cityDef)`));
  await page.shot('tire_city.png');

  // 2) 出征編成：主將疲勞 + atire 參數
  const s1b = { ...SAVE, tire: { 劉焉: 63, 關羽: 63 } };
  await page.eval(seed(s1b));
  await page.goto(BASE + 'deploy.html?city=' + encodeURIComponent('晉陽'));
  console.log('deploy tire:', await page.eval(`document.getElementById('gtire').textContent`));
  console.log('deploy color:', await page.eval(`document.getElementById('gtire').style.color`));
  await page.eval(`document.getElementById('go').click()`);
  await sleep(600);
  console.log('deploy url:', await page.eval(`location.search`));

  // 3) 戰後結算：A 主將 37 -> 15+trunc(durationSec/10)
  const s2 = { ...SAVE, tire: { 劉焉: 37 } };
  await page.eval(seed(s2));
  await page.goto(BASE + 'index.html?auto=1&sim=300&end=1&freeze=1&city=' + encodeURIComponent('代縣')
    + '&gen=' + encodeURIComponent('劉焉') + '&atire=37&seed=123&from=campaign&soldiers=300&bgen=' + encodeURIComponent('張角'));
  console.log('battle msg:', await page.eval(`(document.getElementById('msg')||{}).textContent || ''`));
  console.log('battle localStorage tire:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').tire`));
  await page.shot('tire_battle.png');

  // 3) 推進一月：63 -> 62，疲勞 ≥60 → 士氣 80 -> 79
  const s3 = { ...SAVE, tire: { 劉焉: 63, 關羽: 0 } };
  await page.eval(seed(s3));
  await page.goto(BASE + 'campaign.html?adv=1');
  console.log('campaign tire:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').tire`));
  console.log('campaign morale:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').cities?.['代縣']?.morale`));
  console.log('campaign log:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').log`));
  await page.shot('tire_month.png');
  page.close();
} finally {
  edge.kill();
}
