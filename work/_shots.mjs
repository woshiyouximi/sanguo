/**
 * work/_shots.mjs —— 大地图真值接线的验收截图 + console error 抓取
 *
 * 用法：
 *   node work/_shots.mjs            # 跑全部（3 张截图 + 回归 smoke）
 *   node work/_shots.mjs A          # 只跑 A（march_targets_real）
 *   node work/_shots.mjs B          # 只跑 B（defend_real）
 *   node work/_shots.mjs C          # 只跑 C（month_end）
 *   node work/_shots.mjs smoke      # 只跑回归 smoke（不截图）
 *
 * 做法：Edge --headless=new + CDP。先开一页 campaign.html 拿到 /web/ 同源上下文，
 * 用页面内 fetch 读 scenarios.json 拼一份合法存档写进 localStorage['sanguo_saves_v1']，
 * 再导航到真正的验收 URL。console error 全程监听（Runtime.exceptionThrown /
 * Runtime.consoleAPICalled(type=error) / Log.entryAdded(level=error)）。
 */
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9341;
const BASE = 'http://127.0.0.1:5199/web/';
const OUT = 'F:\\sanguo\\work\\';

const only = (process.argv[2] || 'all').toUpperCase();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const child = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--autoplay-policy=no-user-gesture-required', '--mute-audio',
  `--remote-debugging-port=${PORT}`,
  '--user-data-dir=F:\\sanguo\\work\\_edge_shots_' + Date.now(),
  '--window-size=750,1334',
  'about:blank',
], { stdio: 'ignore' });

let ws;
let msgId = 0;
const pending = new Map();
const errors = [];            // { step, kind, text }
let step = 'boot';

function send(method, params = {}) {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function waitVersion() {
  for (let i = 0; i < 80; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return r.json();
    } catch { /* not up */ }
    await sleep(250);
  }
  throw new Error('CDP not up');
}

async function evalPage(expression, { awaitPromise = true, timeout = 30000 } = {}) {
  const r = await send('Runtime.evaluate', {
    expression, returnByValue: true, awaitPromise, userGesture: true, timeout,
  });
  if (r.exceptionDetails) {
    throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  }
  return r.result?.value;
}

async function go(url, { settle = 1200 } = {}) {
  step = url;
  await send('Page.navigate', { url });
  for (let i = 0; i < 80; i += 1) {
    try {
      const st = await evalPage('document.readyState', { awaitPromise: false });
      if (st === 'complete') break;
    } catch { /* navigating */ }
    await sleep(200);
  }
  await sleep(settle);
}

const SAVE_BUILDER = `(opts) => (async () => {
  const raw = await (await fetch('../data/scenarios.json')).json();
  const scenes = Array.isArray(raw) ? raw : (raw.scenarios || []);
  const sc = scenes[opts.sc || 0];
  const cap = (c) => Math.min(Math.floor(Number(c.POPULATION) / 2500) + 110, 600);
  const cities = {};
  for (const c of sc.cities) {
    cities[c.NAME] = { troops: cap(c), pop: Number(c.POPULATION) || 0, money: Number(c.MONEY) || 0 };
  }
  for (const [n, t] of Object.entries(opts.troops || {})) if (cities[n]) cities[n].troops = t;
  const owned = sc.cities.slice(0, 3).map((c) => c.NAME);
  for (const n of opts.owned || []) if (cities[n] && !owned.includes(n)) owned.push(n);
  const armies = [];
  for (const a of opts.armies || []) {
    const pi = (sc.paths || []).findIndex((p) => (p.Start === a.from && p.End === a.to) || (p.Start === a.to && p.End === a.from));
    if (pi >= 0) armies.push({ id: 'seed' + armies.length, side: a.side, from: a.from, to: a.to, pathIndex: pi, progress: a.progress, troops: a.troops, general: null, reported: false });
  }
  const snapshot = {
    seeded: true, scenario: Number(sc.id) || 1, month: 1, gold: opts.gold == null ? 1200 : opts.gold,
    wins: 0, losses: 0, defWins: 0, log: [], owned, cities, armies,
    armySeq: armies.length, ts: Date.now(),
  };
  localStorage.setItem('sanguo_saves_v1', JSON.stringify({ v: 1, last: 1, slots: [{ snapshot, ts: Date.now(), scenarioName: sc.name }] }));
  localStorage.removeItem('sanguo_campaign_v1');
  return 'seeded ' + owned.join('/') + ' · armies=' + armies.length;
})()`;

async function seed(opts) {
  await go(BASE + 'campaign.html', { settle: 800 });   // 空档位 → 只弹选剧本浮层，不报错
  const r = await evalPage(`(${SAVE_BUILDER})(${JSON.stringify(opts)})`);
  console.log('  seed ->', r);
}

async function shot(name, file) {
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(OUT + file, Buffer.from(r.data, 'base64'));
  console.log(`  shot -> work\\${file}  (${name})`);
}

async function text(sel) {
  return evalPage(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); return e ? (e.innerText || e.textContent || '') : ''; })()`, { awaitPromise: false });
}

async function runA() {
  console.log('[A] march_targets_real · 宛 → 洛陽');
  // 宛 = 剧本 1 里跟洛陽接壤的城（新开局只有襄平/北平/代縣，这里相当于「已攻下宛」）
  await seed({ sc: 0, owned: ['宛'], troops: { 宛: 420 }, gold: 1600 });
  await go(BASE + 'campaign.html?sel=' + encodeURIComponent('宛'), { settle: 1400 });
  await evalPage(`document.querySelector('[data-act="dispatch"]').click()`, { awaitPromise: false });
  await sleep(900);
  const sub = await text('#marchSub');
  const cards = await text('#marchTargets');
  console.log('  marchSub:', sub.replace(/\n/g, ' / '));
  console.log('  cards:', cards.replace(/\n/g, ' | '));
  await shot('A', 'march_targets_real.png');
  return { sub, cards };
}

async function runB() {
  console.log('[B] defend_real · 洛陽(曹操) → 宛');
  // 路上已有一支洛陽來的兵（progress 0.9），推进一月就到城下 → defendUrl 跳转
  await seed({
    sc: 0, owned: ['宛'], troops: { 宛: 180 },
    armies: [{ side: 'B', from: '洛陽', to: '宛', progress: 0.9, troops: 92 }],
  });
  await go(BASE + 'campaign.html?adv=1', { settle: 2500 });
  // advanceMonth(1) 里 handleMarchEvents 会 location.href = defendUrl(atk)
  let href = '';
  for (let i = 0; i < 40; i += 1) {
    try {
      href = await evalPage('location.href', { awaitPromise: false });
      if (href.includes('defend=1')) break;
    } catch { /* navigating */ }
    await sleep(250);
  }
  console.log('  defend url:', href);
  if (!href.includes('defend=1')) throw new Error('没有跳到守城战：' + href);
  // 加截图参数：auto 开局（headless 里必须 bringToFront 才会跑 rAF），
  // 等战报时钟走到 9 秒再拍：这时敌将曹操已经从阵后走到阵前，名字在头顶画得清楚
  const shotUrl = href + '&auto=1&seed=7';
  await go(shotUrl, { settle: 900 });
  let clock = '';
  for (let i = 0; i < 150; i += 1) {
    clock = await text('#stat');
    const m = /00:(\d\d)/.exec(clock);
    if (m && Number(m[1]) >= 9) break;
    await sleep(200);
  }
  console.log('  clock:', clock.replace(/\s+/g, ' ').slice(0, 100));
  await shot('B', 'defend_real.png');
  return { href, clock: clock.replace(/\s+/g, ' ') };
}

async function runC() {
  console.log('[C] month_end · 推进一月 → 守军回补 + 俸禄支出');
  await seed({ sc: 0, troops: { 襄平: 60, 北平: 100, 代縣: 130 }, gold: 1200 });
  await go(BASE + 'campaign.html?auto=1&adv=1', { settle: 1800 });
  const log = await text('#logrows');
  const gold = await text('.stats');
  console.log('  log:', log.replace(/\n/g, ' | '));
  console.log('  stats:', gold.replace(/\n/g, ' '));
  await shot('C', 'month_end.png');
  return { log };
}

async function runList() {
  console.log('[L] 列表视图 · 勢力/太守/守將（含剧本 1 的数字 KING 空城）');
  await seed({ sc: 0 });
  await go(BASE + 'campaign.html?march=0', { settle: 1200 });
  await evalPage(`document.querySelector('.tab[data-tab="list"]').click()`, { awaitPromise: false });
  await sleep(400);
  const rows = {};
  for (const n of ['代縣', '易京', '晉陽', '洛陽', '南皮']) {
    rows[n] = await evalPage(
      `(() => { const el = document.querySelector('[data-name=${JSON.stringify(n)}]'); return el ? el.innerText.replace(/\\n/g, ' ') : '(缺)'; })()`,
      { awaitPromise: false },
    );
  }
  // ?march=0 的出征按钮必须还是 data-act="march"（走 deploy.html）
  await evalPage(`document.querySelector('[data-name=${JSON.stringify('易京')}]').click()`, { awaitPromise: false });
  await sleep(300);
  const btn = await evalPage(`(() => { const b = document.querySelector('[data-act="march"]'); return b ? b.innerHTML.replace(/\\s+/g, ' ').slice(0, 80) : '(缺)'; })()`, { awaitPromise: false });
  await evalPage(`document.querySelector('[data-act="march"]').click()`, { awaitPromise: false });
  await sleep(1200);
  let href = '';
  try { href = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
  for (let i = 0; i < 20 && !href.includes('deploy.html'); i += 1) {
    await sleep(250);
    try { href = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
  }
  console.log('  rows:', Object.entries(rows).map(([k, v]) => `${k}=${v}`).join(' ; '));
  console.log('  march=0 出征 →', href.replace('http://127.0.0.1:5199/web/', ''));
  return { rows, btn, href };
}

/** 直接验 item 2（march_direct 分支）与 item 3 的遭遇分支：注入按钮点一下，看跳转 URL 的 bgen */
async function runDirect() {
  console.log('[D] march_direct / 遭遇战 URL 的敌将参数');
  await seed({ sc: 0, troops: { 代縣: 300 } });
  await go(BASE + 'campaign.html?march=0&sel=' + encodeURIComponent('洛陽'), { settle: 1300 });
  // 该分支在现版本没有按钮入口（旧「点城直接开战」），这里临时注入一个按钮来跑真实代码
  await evalPage(`(() => {
    const d = document.createElement('div');
    d.className = 'btn'; d.dataset.act = 'march_direct'; d.textContent = 'direct';
    document.getElementById('actions').appendChild(d); d.click(); return 'clicked';
  })()`, { awaitPromise: false });
  await sleep(1200);
  let href = '';
  try { href = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
  for (let i = 0; i < 20 && !href.includes('index.html'); i += 1) {
    await sleep(250);
    try { href = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
  }
  console.log('  march_direct →', href.replace('http://127.0.0.1:5199/web/', ''));

  // 遭遇：?marchdemo=encounter 两支相向部队，推进一月撞上 → confirmBox → 出战 → encounterUrl
  await seed({ sc: 0, troops: { 代縣: 300, 晉陽: 150 } });
  await go(BASE + 'campaign.html?marchdemo=encounter&adv=1', { settle: 1500 });
  const hasBox = await evalPage(`(() => { const s = document.getElementById('confirmSheet'); return s ? !s.hidden : false; })()`, { awaitPromise: false });
  let enc = '(无遭遇确认框)';
  if (hasBox) {
    await evalPage(`(() => { const b = document.getElementById('btnConfirmOk'); if (!b) return 'no'; b.click(); return 'ok'; })()`, { awaitPromise: false });
    await sleep(1200);
    try { enc = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
    for (let i = 0; i < 20 && !enc.includes('index.html'); i += 1) {
      await sleep(250);
      try { enc = await evalPage('location.href', { awaitPromise: false }); } catch { /* nav */ }
    }
  }
  console.log('  encounter confirm:', hasBox, '→', enc.replace('http://127.0.0.1:5199/web/', ''));
  return { direct: href, encounter: enc, hasBox };
}

/** 空城卡：剧本 1 的数字 KING（易京=1）不能印成「勢力 1」 */
async function runEmpty() {
  console.log('[E] 空城目标卡 · 易京（剧本 1 的 KING 是数字 1）');
  await seed({ sc: 0, troops: { 北平: 200 } });
  await go(BASE + 'campaign.html?sel=' + encodeURIComponent('北平'), { settle: 1300 });
  await evalPage(`document.querySelector('[data-act="dispatch"]').click()`, { awaitPromise: false });
  await sleep(900);
  const cards = await text('#marchTargets');
  console.log('  cards:', cards.replace(/\n/g, ' | '));
  const bad = /勢力\s*1\b/.test(cards);
  if (bad) throw new Error('空城卡印出了「勢力 1」');
  return { cards };
}

const SMOKE = [
  ['?march=0&sel=' + encodeURIComponent('易京'), '旧路径：?march=0'],
  ['?marchdemo=mid', '?marchdemo=mid 行軍种子'],
  ['?marchdemo=arrive', '?marchdemo=arrive'],
  ['?adv=3&auto=1', '?adv=3 批量推进'],
  ['?panel=saves', '?panel=saves 存檔面板'],
  ['?marchdbg=1&adv=2', '?marchdbg=1 快照'],
];

async function runSmoke() {
  const rows = [];
  for (const [qs, label] of SMOKE) {
    const before = errors.length;
    await seed({ sc: 0, troops: { 代縣: 120 } });
    await go(BASE + 'campaign.html' + qs, { settle: 1500 });
    const acts = await text('#actions');
    const log = await text('#logrows');
    rows.push({ label, qs, acts: acts.replace(/\s+/g, ' ').slice(0, 60), log: log.replace(/\s+/g, ' ').slice(0, 80), errs: errors.length - before });
    console.log(`  smoke ${label}: acts="${rows.at(-1).acts}" errs=${rows.at(-1).errs}`);
    // ?march=0 还要验证「出征按钮仍然走 deploy.html」
    if (qs.includes('march=0')) {
      const btn = await evalPage(`(() => { const b = document.querySelector('[data-act="march"]'); return b ? b.outerHTML.slice(0, 120) : ''; })()`, { awaitPromise: false });
      console.log('  march=0 button:', btn.replace(/\s+/g, ' '));
      rows.at(-1).btn = btn;
    }
  }
  return rows;
}

try {
  await waitVersion();
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
      return;
    }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push({ step, kind: 'exception', text: d?.exception?.description || d?.text || '?' });
    } else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
      errors.push({ step, kind: 'console.error', text: (m.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ') });
    } else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
      const e = m.params.entry;
      errors.push({ step, kind: 'log', text: `${e.source}: ${e.text} ${e.url || ''}`.trim() });
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 2, mobile: false });
  try { await send('Page.bringToFront'); } catch { /* 旧版 Edge 没有 */ }

  const result = {};
  if (only === 'ALL' || only === 'A') result.A = await runA();
  if (only === 'ALL' || only === 'B') result.B = await runB();
  if (only === 'ALL' || only === 'C') result.C = await runC();
  if (only === 'ALL' || only === 'L') result.list = await runList();
  if (only === 'ALL' || only === 'D') result.direct = await runDirect();
  if (only === 'ALL' || only === 'E') result.empty = await runEmpty();
  if (only === 'ALL' || only === 'SMOKE') result.smoke = await runSmoke();

  console.log('\n=== console errors: ' + errors.length + ' ===');
  for (const e of errors.slice(0, 40)) console.log(`  [${e.kind}] ${e.step}\n    ${e.text.slice(0, 400)}`);
  writeFileSync(OUT + '_shots_result.json', JSON.stringify({ result, errors }, null, 2));
  console.log('\nresult -> work\\_shots_result.json');
} finally {
  try { ws?.close(); } catch { /* ignore */ }
  try { child.kill(); } catch { /* ignore */ }
}
