// R7 年度结算 + R56 战后武将处置：浏览器端验收（CDP，注入存档 → 重载 → 推进 → 再重载）
//
// 用法（先由 pwsh 用 Start-Process 起 Edge，本例端口 9333、profile work\r7\edgeprof）：
//   1) Start-Process msedge --headless=new --remote-debugging-port=9333 --user-data-dir=... work\r7\edgeprof
//   2) node work\r7\verify_r7.mjs
//
// 验收链：
//   a. 注入一份「刚打完仗」的存档：槽 1 是 month=12 的快照，旧键 sanguo_campaign_v1 的 ts 更新、
//      wins +1（→ campaign.html 的 boot.battle 判定成立），captured=['張飛']、executed=['呂布','公孫瓚']。
//   b. 重载 → settleBattleReturn() 必须跑：斬首 呂布 出池（roster._moved='陣亡'）、招降 張飛 入洛陽、
//      自家君主 公孫瓚 必须被剔除（君主不可俘 0x40975E）。
//   c. __r7.advance(2)：month 12 → 14 跨过正月（13）→ 年度结账（closed=year1）+ 战报一行。
//   d. 再 reload：从 localStorage 的槽快照读回，证明 year/ledger/annual/lastPost/_moved 都落档了。

import fs from 'node:fs';

const PORT = Number(process.env.R7_PORT || 9333);
const BASE = 'http://127.0.0.1:5173/web/campaign.html';
const OUT = 'F:\\sanguo\\work\\r7';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function json(path, method = 'GET') {
  const res = await fetch(`http://127.0.0.1:${PORT}${path}`, { method });
  return res.json();
}
async function waitPort(ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { await json('/json/version'); return true; } catch { await sleep(250); }
  }
  return false;
}

const SEED = `(async () => {
  const S = await import('http://127.0.0.1:5173/web/saves.js');
  const raw = await (await fetch('/data/scenarios.json', { cache: 'no-store' })).json();
  const sc = Object.assign({}, raw[0], { id: 1 });
  const T = 1700000000000;
  const snap = S.prepareSnapshot(S.newCampaign(sc, { ts: T, gold: 5000 }), sc.cities, { info: () => ({}) });
  snap.month = 12;
  snap.gold = 5000;
  snap.wins = 3; snap.losses = 1; snap.defWins = 0;
  snap.ledger = { year: 1, months: 11, income: 440, salary: 165 };
  snap.roster = { _moved: {}, '洛陽': ['呂布', '張遼'], '襄平': ['張飛', '公孫瓚'] };
  snap.last = '洛陽';
  const store = S.emptyStore();
  S.writeSlot(store, 0, snap, { scenarioName: '劇本1', ts: T });
  S.saveStore(store);
  const legacy = JSON.parse(JSON.stringify(snap));
  legacy.ts = T + 5000;
  legacy.wins = 4;
  legacy.captured = ['張飛'];
  legacy.executed = ['呂布', '公孫瓚'];
  S.writeLegacy(legacy);
  return { seeded: true, month: snap.month, king: snap.king, legacyTs: legacy.ts, slotTs: snap.ts };
})()`;

const pick = (s) => s && ({
  month: s.month, year: s.year, yearFlag: s.yearFlag,
  ledger: s.ledger, annual: s.annual && {
    year: s.annual.year, intoYear: s.annual.intoYear, months: s.annual.months,
    income: s.annual.income, salary: s.annual.salary, cities: s.annual.cities,
    officers: s.annual.officers, wins: s.annual.wins, losses: s.annual.losses,
    gold: s.annual.gold, text: s.annual.text,
  },
  lastPost: s.lastPost,
  captured: s.captured ?? null, executed: s.executed ?? null,
  moved: (s.roster && s.roster._moved) || null,
  cityLuoyang: (s.roster && s.roster['洛陽']) || null,
  cityXiangping: (s.roster && s.roster['襄平']) || null,
  log: (Array.isArray(s.log) ? s.log : []).map((x) => x.s),
});

async function main() {
  if (!(await waitPort(30000))) throw new Error('devtools port never opened');
  const version = await json('/json/version');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const problems = [];
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      problems.push(`exception: ${msg.params?.exceptionDetails?.text} ${msg.params?.exceptionDetails?.exception?.description || ''}`);
    }
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
      problems.push(`console.error: ${(msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ')}`);
    }
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
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

  const target = await json(`/json/new?${encodeURIComponent('about:blank')}`, 'PUT');
  const { sessionId } = await send('Target.attachToTarget', { targetId: target.id, flatten: true });
  const s = (m, p = {}) => send(m, p, sessionId);
  await s('Page.enable');
  await s('Runtime.enable');
  await s('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

  const ev = async (expression) => {
    const r = await s('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) {
      throw new Error('eval threw: ' + JSON.stringify(r.exceptionDetails).slice(0, 600));
    }
    return r.result.value;
  };
  const waitExpr = async (expr, ms, label) => {
    const t0 = Date.now();
    let last = null;
    while (Date.now() - t0 < ms) {
      try {
        last = await ev(expr);
        if (last) return last;
      } catch { /* 导航中会抛，继续等 */ }
      await sleep(200);
    }
    throw new Error(`timeout waiting ${label} (last=${JSON.stringify(last)})`);
  };
  const shot = async (name) => {
    const r = await s('Page.captureScreenshot', { format: 'png' });
    const f = `${OUT}\\${name}.png`;
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    return { path: f, bytes: fs.statSync(f).size };
  };

  const report = { base: BASE, steps: {}, problems };

  // a) 种存档（先在同一 origin 下打开一页，才能写 localStorage）
  await s('Page.navigate', { url: BASE });
  await waitExpr('document.readyState === "complete" && !!document.querySelector("#map")', 20000, 'page ready');
  await sleep(600);
  report.steps.seed = await ev(SEED);
  // 存档「前」的原始 JSON（证据用：报告里的前后差异就是拿这两份 diff 的）
  const storeBefore = JSON.parse(await ev(`localStorage.getItem('sanguo_saves_v1') || 'null'`));
  const snapBefore = storeBefore && storeBefore.slots && storeBefore.slots[0] && storeBefore.slots[0].snapshot;
  fs.writeFileSync(`${OUT}\\save_before.json`, JSON.stringify(snapBefore, null, 2), 'utf8');
  const legacyBefore = JSON.parse(await ev(`localStorage.getItem('sanguo_campaign_v1') || 'null'`));
  fs.writeFileSync(`${OUT}\\legacy_before.json`, JSON.stringify(legacyBefore, null, 2), 'utf8');

  // b) 带 ?probe=r7 重载 → boot.battle 触发 settleBattleReturn()
  await s('Page.navigate', { url: `${BASE}?probe=r7` });
  await waitExpr('!!(window.__r7 && window.__r7.state)', 20000, '__r7 ready');
  await sleep(700);
  const before = JSON.parse(await ev('JSON.stringify(window.__r7.state())'));
  report.steps.afterBattleSettle = pick(before);
  report.steps.shot1 = await shot('01_r56_settle');

  // c) 跨年（單月推進，玩家實際用法）：month 12 → 13 = 正月 → 年度結算 + 戰報一行
  await ev('window.__r7.advance(1)');
  await sleep(400);
  const jan = JSON.parse(await ev('JSON.stringify(window.__r7.state())'));
  report.steps.afterYearSettle = pick(jan);
  report.steps.logRowsJan = await ev(`Array.from(document.querySelectorAll('#logrows .logrow')).map(x => x.innerText.replace(/\\s+/g, ' '))`);
  report.steps.shot2 = await shot('02_r7_annual');

  // c2) 再推一個月：年度那行不該就被擠掉（釘行）
  await ev('window.__r7.advance(1)');
  await sleep(400);
  const feb = JSON.parse(await ev('JSON.stringify(window.__r7.state())'));
  report.steps.afterNextMonth = pick(feb);
  report.steps.logRowsNext = await ev(`Array.from(document.querySelectorAll('#logrows .logrow')).map(x => x.innerText.replace(/\\s+/g, ' '))`);
  report.steps.shot3 = await shot('03_next_month');

  // d) reload：不再有更旧的旧键 → 直接读槽快照，验证落档
  await s('Page.reload', { ignoreCache: false });
  await waitExpr('!!(window.__r7 && window.__r7.state)', 20000, '__r7 after reload');
  await sleep(700);
  const reloaded = JSON.parse(await ev('JSON.stringify(window.__r7.state())'));
  report.steps.afterReload = pick(reloaded);
  report.steps.shot4 = await shot('04_after_reload');

  report.steps.slotRaw = JSON.parse(await ev(`(() => {
    const st = JSON.parse(localStorage.getItem('sanguo_saves_v1') || '{}');
    const e = st.slots && st.slots[0];
    const sn = e && e.snapshot ? e.snapshot : null;
    if (!sn) return JSON.stringify(null);
    return JSON.stringify({
      month: sn.month, year: sn.year, yearFlag: sn.yearFlag, ledger: sn.ledger,
      annual: sn.annual && { year: sn.annual.year, months: sn.annual.months, income: sn.annual.income, text: sn.annual.text },
      lastPost: sn.lastPost, moved: sn.roster && sn.roster._moved,
      luoyang: sn.roster && sn.roster['洛陽'], xiangping: sn.roster && sn.roster['襄平'],
      log: (sn.log || []).map((x) => x.s),
    });
  })()`));

  // 存档「后」的完整 JSON（与 save_before.json 直接 diff）
  const storeAfter = JSON.parse(await ev(`localStorage.getItem('sanguo_saves_v1') || 'null'`));
  const snapAfter = storeAfter && storeAfter.slots && storeAfter.slots[0] && storeAfter.slots[0].snapshot;
  fs.writeFileSync(`${OUT}\\save_after.json`, JSON.stringify(snapAfter, null, 2), 'utf8');

  fs.writeFileSync(`${OUT}\\verify_report.json`, JSON.stringify(report, null, 2), 'utf8');
  console.log(JSON.stringify(report, null, 2));

  try { await send('Browser.close'); } catch { /* ignore */ }
  ws.close();
}

main()
  .then(() => process.exit(0))
  .catch((e) => { console.error('verify failed:', e.message); process.exit(1); });
