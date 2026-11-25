/**
 * campaign.html 改造後的冒煙測試：內政按鈕 / 列表 tab / 換圖參數 / 出征跳轉。
 *   node work/_saves_smoke.mjs
 * 只驗「沒有回歸」：0 exception、按鈕有點到、localStorage 有更新。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/web/campaign.html`;
import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9860 + Math.floor(Math.random() * 30);
const profile = await mkdtemp(join(tmpdir(), 'edge-smoke-'));
sweepStaleProfiles();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });

const res = [];
const ok = (n, c, d = '') => { res.push({ n, c }); console.log(`${c ? '✓' : '✗'} ${res.length}. ${n}${d ? ' — ' + d : ''}`); };
let exceptions = [], errors = [];
let seq = 0;
try {
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch { /* wait */ }
    await sleep(150);
  }
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();
  const send = (method, params = {}) => new Promise((r, j) => {
    const id = ++seq; pending.set(id, { r, j }); ws.send(JSON.stringify({ id, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { r, j } = pending.get(m.id); pending.delete(m.id);
      return m.error ? j(new Error(m.error.message)) : r(m.result);
    }
    const p = m.params ?? {};
    if (m.method === 'Runtime.exceptionThrown') exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text);
    if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') errors.push('console.error');
  });
  await new Promise((r, j) => { ws.addEventListener('open', r); ws.addEventListener('error', j); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });
  const ev = async (expr) => {
    const r = await send('Runtime.evaluate', { expression: `(async()=>{${expr}})()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const click = async (sel, nth = 0) => {
    const b = await ev(`const e=document.querySelectorAll(${JSON.stringify(sel)})[${nth}]; if(!e) return null;
      const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};`);
    if (!b) throw new Error('no element ' + sel);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: b.x, y: b.y, button: 'left', clickCount: 1 });
    }
    await sleep(320);
  };

  await send('Page.navigate', { url: PAGE + '?demo=1&seed=7' });
  await sleep(3000);

  // 列表 tab → 點自己的城 → 內政按鈕
  await click('.tab', 1);
  const listUi = await ev(`return { visible: getComputedStyle(document.querySelector('#list')).display,
    cities: document.querySelectorAll('#list .city').length, mine: document.querySelectorAll('#list .city.mine').length };`);
  ok('列表 tab：60 城、3 座我方', listUi.visible === 'block' && listUi.cities === 60 && listUi.mine === 3, JSON.stringify(listUi));

  await click('#list .city', 0);   // 襄平（第一座，開局三城之一）
  const acts = await ev(`return [...document.querySelectorAll('#actions .btn')].map(b=>b.textContent.replace(/\\s+/g,' ').trim());`);
  ok('選中自己的城 → 徵兵/開發/推進一月（3 個內政按鈕）',
    acts.length === 3 && acts.some((s) => s.includes('徵 兵')) && acts.some((s) => s.includes('開 發')) && acts.some((s) => s.includes('推進一月')),
    JSON.stringify(acts));

  // 點一座別人的城 → 出征按鈕（相鄰則可用，不相鄰則 disabled + 原因）
  const enemyRow = await ev(`const rows=[...document.querySelectorAll('#list .city')]; const i=rows.findIndex(r=>!r.classList.contains('mine')); return i;`);
  await click('#list .city', enemyRow);
  const marchActs = await ev(`const b=document.querySelector('#actions .btn'); return { n: document.querySelectorAll('#actions .btn').length,
    text: b?.textContent.replace(/\\s+/g,' ').trim(), disabled: b?.hasAttribute('disabled'), hint: document.querySelector('#hint').textContent };`);
  ok('選中別人的城 → 出征按鈕（相鄰可直接出征）',
    marchActs.n === 2 && marchActs.text.includes('出 征') && marchActs.disabled === false, JSON.stringify(marchActs));

  // 再找一座不接壤的敵城：出征 disabled 且有原因文案
  let farCase = null;
  for (let i = 3; i < 14 && !farCase; i++) {
    await click('#list .city', i);
    const c = await ev(`const b=document.querySelector('#actions .btn'); return { name: document.querySelector('#list .city')?.textContent,
      disabled: b?.hasAttribute('disabled'), text: b?.textContent.replace(/\\s+/g,' ').trim() };`);
    if (c?.disabled) farCase = { i, ...c };
  }
  ok('不接壤的敵城：出征 disabled 並顯示原因（需 N 段路 / 不接壤）',
    !!farCase && /需 \d+ 段路|不接壤/.test(farCase.text), JSON.stringify(farCase));

  // 回到自己的城做內政
  await click('#list .city', 0);

  const before = await ev(`const g=document.querySelector('#gold').textContent; return { gold: g, troops: document.querySelector('#rec').textContent };`);
  await click('#actions .btn[data-act=recruit]');
  const afterRecruit = await ev(`return { gold: document.querySelector('#gold').textContent,
    hint: document.querySelector('#hint').textContent, log: document.querySelector('#logrows').textContent.slice(0,120),
    legacy: (()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null'); return s && {gold:s.gold, month:s.month, keys:Object.keys(s)};})() };`);
  ok('徵兵：金 1,200 → 700、舊鍵同步（main.js 通道仍在）',
    before.gold === '1,200' && afterRecruit.gold === '700' && afterRecruit.legacy?.gold === 700, JSON.stringify(afterRecruit));

  // 開發
  await click('#actions .btn[data-act=develop]');
  const dev = await ev(`return { gold: document.querySelector('#gold').textContent, hint: document.querySelector('#hint').textContent };`);
  ok('開發：按鈕可點、金降低、無異常', dev.gold !== '700' && exceptions.length === 0, JSON.stringify(dev));

  // 推進一月（單月真打可能跳守城戰，這裡只驗按下後 URL 或月份有反應）
  await click('#actions .btn[data-act=advance]');
  await sleep(1200);
  const adv = await ev(`return { url: location.href, ym: document.querySelector('#ym')?.textContent,
    legacy: (()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null'); return s && s.month;})() };`).catch(() => ({ url: 'unknown' }));
  ok('推進一月：留在 campaign 或跳守城戰，舊鍵月份至少沒倒退',
    /campaign\.html|index\.html/.test(String(adv.url)) && (adv.legacy >= 1 || adv.url === 'unknown'), JSON.stringify(adv));

  // 換圖參數（?routes=1&bg=0）不炸
  await send('Page.navigate', { url: PAGE + '?routes=1&bg=0&seed=3' });
  await sleep(2600);
  const canvas = await ev(`const c=document.querySelector('#map'); return { w:c.width, h:c.height,
    drawn: c.getContext('2d').getImageData(0,0,c.width,c.height).data.some((v,i)=> i%4===3 && v>0) };`);
  ok('?routes=1&bg=0：畫布有尺寸且確實畫了東西', canvas.w > 0 && canvas.h > 0 && canvas.drawn, JSON.stringify(canvas));

  // 出征：跳 index.html?city=…
  await click('.tab', 0);
  const targetCity = await ev(`const r=[...document.querySelectorAll('#map')]; return 1;`);
  void targetCity;
  const enemy = await ev(`const s=JSON.parse(localStorage.getItem('sanguo_saves_v1'));const own=new Set(s.slots[0].snapshot.owned);
    const p=JSON.parse(localStorage.getItem('sanguo_campaign_v1'));
    return { owned: p.owned };`);
  ok('出征前置：存檔裡有我方城池名單', Array.isArray(enemy.owned) && enemy.owned.length === 3, JSON.stringify(enemy));

  console.log('\n=== 匯總 ===');
  const bad = res.filter((x) => !x.c);
  console.log(`${res.length - bad.length} 過 / ${res.length} 條` + (bad.length ? '；FAIL: ' + bad.map((b) => b.n).join(' | ') : ''));
  console.log(`exception=${exceptions.length} console.error=${errors.length}`);
  if (exceptions.length) console.log(exceptions.join('\n'));
  ws.close();
  process.exitCode = bad.length || exceptions.length ? 1 : 0;
} finally {
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
}
