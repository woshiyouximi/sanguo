// R4/R78/R65 驗收截圖：head / force_list / force_detail / extinct / monthly
// 用法：node work/_monarch_shots.mjs
// 說明：走 CDP + msedge --headless=new（與 work/_morale_shots.mjs 同一套），
//       用獨立 profile（work/_edge_monarch）不污染 lead 的 .edgeprof_lead 存檔。
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9335;
const BASE = 'http://127.0.0.1:5173/web/';
const OUT = 'F:\\sanguo\\work\\monarch\\';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
// 任務書要求截圖必須用 Start-Process 起瀏覽器（直接 & msedge 會靜默失敗）。
// 所以正式跑法是 work\_monarch_browser.ps1：Start-Process 起 headless Edge（遠端調試 9335），
// 再帶 MONARCH_ATTACH=1 跑本腳本；本腳本自己不 spawn 時就只 attach 到那個 port。
const ATTACH = process.env.MONARCH_ATTACH === '1';
const edge = ATTACH ? null : spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_monarch',
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
  async goto(url, settle = 1400) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      try { if (await this.eval('document.readyState') === 'complete') break; } catch {}
    }
    await sleep(settle);
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(OUT + name, Buffer.from(r.data, 'base64'));
    console.log('[shot]', OUT + name);
  }
  close() { try { this.ws.close(); } catch {} }
}

/** 一份確定性存檔：玩家＝何進（劇本1 的洛陽/虎牢關），君主三欄齊全，上月有漂移摘要 */
const SAVE = {
  seeded: true, scenario: 1, month: 7, gold: 4200,
  wins: 3, losses: 1, streak: 1, bestStreak: 2, defWins: 1,
  log: [
    { t: '1年6月', s: '我 軍 出 征：洛陽 → 虎牢關（100 兵，1 個月）', k: 'info' },
    { t: '1年6月', s: '第1年6月：疲勞 -3 · 士氣 +2/-1 · 忠誠 +12/-1（18 人）', k: 'info' },
  ],
  owned: ['洛陽', '弘農'],
  cities: {
    洛陽: { troops: 520, pop: 210000, money: 2400 },
    弘農: { troops: 380, pop: 90000, money: 900 },
  },
  monarch: '何進', force: '何進', king: '何進', monarchSince: 2,
  forces: {}, fate: {}, ts: 0,
  tire: { 何進: 12, 曹操: 4, 袁紹: 64, 盧植: 78 },
  morale: { 何進: 82, 曹操: 76, 袁紹: 61, 盧植: 55 },
  loyal: { 何進: 92, 曹操: 71, 袁紹: 58, 盧植: 86 },
  generalLevel: { 何進: 18, 曹操: 20, 袁紹: 16, 盧植: 17 },
  drift: { month: 6, tireDown: 3, spiritDown: 1, spiritUp: 2, spiritSkipped: 0, loyalDown: 1, loyalUp: 12, loyalSkipped: 0, names: 18 },
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
  const page = await Page.open(BASE + 'campaign.html');
  await page.goto(BASE + 'campaign.html');   // 確保已經落在 http://127.0.0.1:5173 這個 origin，才寫得進 localStorage
  await page.eval(seed(SAVE));

  // 1) head.png：頁頭君主（君主 何進 · 勢力 何進 · 旗26）+ 漂移行（不開浮层，亮版）
  await page.goto(BASE + 'campaign.html?read=1');
  console.log('kingbar:', await page.eval(`document.getElementById('kingName').textContent + ' | ' + document.getElementById('kingdomName').textContent`));
  console.log('driftbar:', await page.eval(`document.getElementById('driftLine').textContent`));
  await page.shot('head.png');

  // 1b) monarch.png：點君主名開屬性卡（generals.json 數據）
  await page.eval(`document.getElementById('kingName').click()`);
  await sleep(500);
  console.log('monarch sheet hidden:', await page.eval(`document.getElementById('monarchSheet').hidden`));
  console.log('monarch body:', await page.eval(`document.getElementById('monBody').innerText.replace(/\\n/g,' / ').slice(0,300)`));
  await page.shot('monarch.png');

  // 2) force_list.png：勢力一覽（城數/武將數/君主/存續或滅亡）
  await page.goto(BASE + 'campaign.html?read=1&panel=forces');
  console.log('force rows:', await page.eval(`document.querySelectorAll('#forceRows [data-force]').length`));
  console.log('force sub:', await page.eval(`document.getElementById('forceSub').textContent`));
  await page.shot('force_list.png');

  // 2b) force_detail.png：勢力明細（城列表 + 武將忠誠/士氣/疲勞）
  await page.eval(`document.querySelector('#forceRows [data-force="何進"]').click()`);
  await sleep(400);
  console.log('detail title:', await page.eval(`document.getElementById('forceTtl').textContent`));
  console.log('detail officers:', await page.eval(`document.getElementById('forceRows').innerText.replace(/\\n/g,' / ').slice(0,400)`));
  await page.shot('force_detail.png');

  // 3) extinct.png：走正式流程讓孔岫（只有譙一城）滅亡 → 戰報 + 殘將歸宿 + UI 提示
  await page.goto(BASE + 'campaign.html?read=1&demo=extinct', 900);
  console.log('log rows:', await page.eval(`document.getElementById('logrows').innerText.replace(/\\n/g,' / ').slice(0,500)`));
  console.log('notice:', await page.eval(`document.getElementById('notice').textContent`));
  await page.shot('extinct.png');

  // 4) monthly.png：推進一月 → 頂欄漂移行 + 戰報「第X年X月：疲勞 … 忠誠 …」
  await page.eval(seed(SAVE));
  await page.goto(BASE + 'campaign.html?read=1&adv=1', 1800);
  console.log('month driftbar:', await page.eval(`document.getElementById('driftLine').textContent`));
  console.log('month log:', await page.eval(`document.getElementById('logrows').innerText.replace(/\\n/g,' / ').slice(0,500)`));
  console.log('month drift saved:', await page.eval(`(() => { try { return JSON.stringify(JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').drift||null); } catch(e){ return 'n/a'; } })()`));
  await page.shot('monthly.png');

  // 5) 讓位（換君主）走 UI：君主卡 → 讓位 → 選第一位繼任者 → 落存檔（只驗證，不截圖）
  await page.goto(BASE + 'campaign.html?read=1&panel=monarch', 900);
  await page.eval(`document.getElementById('btnAbdicate').click()`);
  await sleep(400);
  const heirs = await page.eval(`document.querySelectorAll('#throneRows [data-heir]').length`);
  const heir = await page.eval(`document.querySelector('#throneRows [data-heir]')?.dataset.heir || ''`);
  await page.eval(`document.querySelector('#throneRows [data-heir]')?.click()`);
  await sleep(500);
  const afterKing = await page.eval(`document.getElementById('kingName').textContent`);
  const savedMonarch = await page.eval(`(() => { try { return JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}').monarch || ''; } catch(e){ return 'n/a'; } })()`);
  console.log('abdicate:', heirs, '位候選 →', heir, '繼位；頂欄', afterKing, '；存檔 monarch', savedMonarch);

  page.close();
} finally {
  if (edge) edge.kill();
}
