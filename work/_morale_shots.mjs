// 武將級士氣驗收截圖：deploy / battle / month
// 用法：node work/_morale_shots.mjs
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
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_morale',
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
  // 舊近似留下的城池級 morale：順便驗證遷移會改名 cityMorale
  cities: { 代縣: { troops: 5000, pop: 180000, money: 3000, morale: 80 } },
  tire: { 劉焉: 37, 關羽: 0 },
  morale: { 劉焉: 37, 關羽: 60 },
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

  // 1) 出征編成：主將卡「士氣 25/100」（<30 標紅），並看 go 產生的 amorale
  const s1 = { ...SAVE, tire: { 劉焉: 63 }, morale: { 劉焉: 25, 關羽: 60 } };
  await page.eval(seed(s1));
  await page.goto(BASE + 'deploy.html?city=' + encodeURIComponent('晉陽'));
  console.log('deploy general:', await page.eval(`document.getElementById('gname').textContent`));
  console.log('deploy morale:', await page.eval(`document.getElementById('gmorale').textContent`));
  console.log('deploy morale color:', await page.eval(`document.getElementById('gmorale').style.color`));
  await page.shot('morale_deploy.png');
  await page.eval(`document.getElementById('go').click()`);
  await sleep(700);
  console.log('deploy url:', await page.eval(`location.search`));

  // 2) 戰鬥 HUD：amorale=23，狀態條應顯示「士氣 23」而不是 60
  const s2 = { ...SAVE, tire: { 劉焉: 37 }, morale: { 劉焉: 23 } };
  await page.eval(seed(s2));
  await page.goto(BASE + 'index.html?auto=1&sim=300&end=1&freeze=1&city=' + encodeURIComponent('代縣')
    + '&gen=' + encodeURIComponent('劉焉') + '&amorale=23&atire=37&bmorale=88&seed=123&from=campaign&soldiers=300'
    + '&bgen=' + encodeURIComponent('張角'));
  console.log('battle stat:', await page.eval(`(document.getElementById('stat')||{}).textContent || ''`));
  console.log('battle sides morale:', await page.eval(`window.__sanguo ? JSON.stringify({A:window.__sanguo.state.world.sides.A.morale,B:window.__sanguo.state.world.sides.B.morale}) : 'no state'`));
  await page.shot('morale_battle.png');

  // 3) 推進一月：疲勞 63 的劉焉士氣 55 → 54，日誌要有「士氣 -1」
  const s3 = { ...SAVE, tire: { 劉焉: 63, 關羽: 0 }, morale: { 劉焉: 55, 關羽: 60 } };
  await page.eval(seed(s3));
  await page.goto(BASE + 'campaign.html?adv=1');
  console.log('month morale:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').morale`));
  console.log('month tire:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').tire`));
  console.log('month log:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').log`));
  console.log('month cities:', await page.eval(`JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').cities`));
  await page.shot('morale_month.png');
  page.close();
} finally {
  edge.kill();
}
