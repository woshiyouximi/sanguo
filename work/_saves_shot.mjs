/**
 * 存檔位 / 劇本選擇 三張驗收截圖 + 佈局量測 + console 採集（Edge headless，CDP）。
 *
 *   node work/_saves_shot.mjs
 *
 * 產物：work/saves_1.png（10 槽浮層）、work/saves_2.png（劇本選擇）、work/saves_3.png（讀檔回某月）
 * 每張都印：console error / exception / 4xx / 網路失敗、浮層矩形、每行 .sl 與按鈕是否重疊。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/web/campaign.html`;
const OUT = 'F:\\sanguo\\work\\saves_';
const W = 750, H = 1334;
import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9750 + Math.floor(Math.random() * 120);
const profile = await mkdtemp(join(tmpdir(), 'edge-saves-'));
sweepStaleProfiles();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CASES = [
  { id: 1, q: '?demo=1&panel=saves', note: '存檔浮層，10 槽' },
  { id: 2, q: '?panel=new', note: '劇本選擇（無存檔首訪）' },
  { id: 3, q: '?demo=1&read=2', note: '讀槽 2 回到第 2 年 7 月' },
];

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars',
  '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitVersion() {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return r.json(); }
    catch { /* not up yet */ }
    await sleep(150);
  }
  throw new Error('Edge 調試端口沒起來');
}

let seq = 0;
const report = [];
try {
  await waitVersion();
  const t = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  const pending = new Map();
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { res, rej });
    ws.send(JSON.stringify({ id, method, params }));
  });
  let logs = [], fails = [], http4 = [];
  const fmt = (a) => (!a ? '?' : ('value' in a) ? String(a.value) : (a.description || a.type || '?'));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      return m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    const p = m.params ?? {};
    if (m.method === 'Runtime.consoleAPICalled') {
      logs.push(`[${p.type}] ` + (p.args ?? []).map(fmt).join(' '));
    } else if (m.method === 'Runtime.exceptionThrown') {
      const d = p.exceptionDetails ?? {};
      logs.push('[exception] ' + (d.exception?.description || d.text || '?'));
    } else if (m.method === 'Network.loadingFailed') {
      fails.push(`${p.type || '?'} ${p.errorText} ${p.requestId}`);
    } else if (m.method === 'Network.responseReceived') {
      const r = p.response ?? {};
      if (r.status >= 400) http4.push(`${r.status} ${r.url.replace(ORIGIN, '')}`);
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable'); await send('Log.enable');
  await send('Page.enable'); await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await mkdir('F:\\sanguo\\work', { recursive: true });

  for (const c of CASES) {
    logs = []; fails = []; http4 = [];
    await send('Storage.clearDataForOrigin', { origin: ORIGIN, storageTypes: 'local_storage' });
    await send('Page.navigate', { url: PAGE + c.q });
    await sleep(3200);   // 等 fetch + 佈局 + 浮層
    const metrics = await send('Runtime.evaluate', {
      expression: `(() => {
        const R = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
          return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1),
                   bottom: +r.bottom.toFixed(1), right: +r.right.toFixed(1) }; };
        const rows = [...document.querySelectorAll('#slotRows .slot')].map((row) => {
          const a = R(row.querySelector('.sl')), b = R(row.querySelector('.sbtns'));
          return { text: row.textContent.replace(/\\s+/g, ' ').trim().slice(0, 46),
                   l1: row.querySelector('.l1')?.textContent.trim(),
                   l2: row.querySelector('.l2')?.textContent.trim(),
                   sl: a, btns: b,
                   overlap: !!(a && b && a.right > b.x + 0.5),
                   btnsInside: !!(b && b.y >= 0 && b.bottom <= 1334) };
        });
        const shown = [...document.querySelectorAll('.sheet')].filter((s) => !s.hidden);
        return {
          url: location.href,
          header: R(document.querySelector('header')),
          notice: document.querySelector('#notice').hidden ? null : { text: document.querySelector('#notice').textContent, r: R(document.querySelector('#notice')) },
          sheet: shown.length ? { id: shown[0].id, r: R(shown[0]) } : null,
          rows,
          rowCount: rows.length,
          emptyRows: document.querySelectorAll('#slotRows .slot.empty').length,
          enabledSave: document.querySelectorAll('#slotRows button[data-do=save]:not([disabled])').length,
          enabledLoad: document.querySelectorAll('#slotRows button[data-do=load]:not([disabled])').length,
          enabledDel: document.querySelectorAll('#slotRows button[data-do=del]:not([disabled])').length,
          scName: document.querySelector('#scName')?.textContent,
          ym: document.querySelector('#ym')?.textContent,
          gold: document.querySelector('#gold')?.textContent,
          ct: document.querySelector('#ct')?.textContent,
          rec: document.querySelector('#rec')?.textContent,
          badge: document.querySelector('#slotBadge')?.textContent,
          pickCards: [...document.querySelectorAll('#pickCards .scard')].map((e) => e.textContent.replace(/\\s+/g, ' ').trim().slice(0, 64)),
          pickWarn: document.querySelector('#pickWarn')?.textContent,
          confirmHidden: document.querySelector('#confirmSheet')?.hidden,
          docW: document.documentElement.scrollWidth,
          docH: document.documentElement.scrollHeight,
          storeKeys: (() => { try { const s = JSON.parse(localStorage.getItem('sanguo_saves_v1') || 'null');
            return s ? { v: s.v, last: s.last, slots: s.slots.map((x) => x ? x.name : null), topKeys: Object.keys(s) } : null; } catch (e) { return 'ERR ' + e.message; } })(),
          legacy: (() => { try { const s = JSON.parse(localStorage.getItem('sanguo_campaign_v1') || 'null');
            return s ? { month: s.month, ts: s.ts, keys: Object.keys(s) } : null; } catch (e) { return 'ERR'; } })(),
        };
      })()`,
      returnByValue: true,
    });
    const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = OUT + c.id + '.png';
    await writeFile(file, Buffer.from(shot.data, 'base64'));
    const v = metrics?.result?.value ?? {};
    const exceptions = logs.filter((l) => l.startsWith('[exception]'));
    const errs = logs.filter((l) => l.startsWith('[error]'));
    report.push({ id: c.id, file, note: c.note, exceptions, errs, http4, fails, metrics: v });
    console.log(`\n=== saves_${c.id}.png  ${c.note} ===`);
    console.log(`${file}  exception=${exceptions.length} consoleError=${errs.length} 4xx=${http4.length} netFail=${fails.length}`);
    if (exceptions.length) console.log('  ' + exceptions.join('\n  '));
    if (errs.length) console.log('  ' + errs.join('\n  '));
    if (http4.length) console.log('  4xx: ' + http4.join(', '));
    console.log('  header=' + JSON.stringify(v.header) + ' sheet=' + JSON.stringify(v.sheet) + ' notice=' + JSON.stringify(v.notice));
    console.log(`  rows=${v.rowCount} empty=${v.emptyRows} 存=${v.enabledSave} 讀=${v.enabledLoad} 刪=${v.enabledDel} ` +
      `scName=${v.scName} ym=${v.ym} gold=${v.gold} ct=${v.ct} rec=${v.rec} badge=${v.badge} doc=${v.docW}x${v.docH}`);
    (v.rows || []).forEach((r, i) => console.log(`   R${i + 1} overlap=${r.overlap} btnsInside=${r.btnsInside} | ${r.l1} | ${r.l2}`));
    if (v.pickCards?.length) { console.log('  pickCards:'); v.pickCards.forEach((s) => console.log('   - ' + s)); }
    if (v.pickWarn) console.log('  pickWarn: ' + v.pickWarn);
    if (v.storeKeys) console.log('  store: ' + JSON.stringify(v.storeKeys));
    if (v.legacy) console.log('  legacy: ' + JSON.stringify(v.legacy));
  }

  const bad = report.filter((r) => r.exceptions.length || r.errs.length || r.http4.length
    || r.metrics?.rows?.some((x) => x.overlap)
    || (r.metrics?.sheet && (r.metrics.sheet.r.y < 0 || r.metrics.sheet.r.bottom > 1334))
    || (r.id === 1 && r.metrics.rowCount !== 10)
    || (r.id === 2 && (r.metrics.pickCards || []).length !== 5));
  console.log('\n=== 匯總 ===');
  console.log(bad.length ? 'FAIL: ' + bad.map((b) => `saves_${b.id}`).join(', ') : 'PASS 三張 0 exception / 0 console.error / 0 4xx / 10 槽 / 5 劇本卡 / 無重疊');
  ws.close();
  process.exitCode = bad.length ? 1 : 0;
} finally {
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
}
