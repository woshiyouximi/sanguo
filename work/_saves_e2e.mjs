/**
 * 真實瀏覽器（Edge headless + CDP）端到端驗證：
 *   T1 舊檔遷移（含未知字段 captured/drops/weirdKey）
 *   T2 存 / 讀 / 刪（真實滑鼠點擊，證明按鈕沒被遮住）
 *   T3 損壞 JSON 不崩
 *   T4 新遊戲 → 換劇本（會覆蓋確認）→ 初始三城來自新劇本
 *   T5 main.js 戰鬥寫回（legacy ts 更新）→ 啟動同步進槽
 *   T6 推進一月自動存檔
 *
 *   node work/_saves_e2e.mjs
 * 退出碼 0 = 全部通過。
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ORIGIN = 'http://127.0.0.1:5199';
const PAGE = `${ORIGIN}/web/campaign.html`;
import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9890 + Math.floor(Math.random() * 90);
const profile = await mkdtemp(join(tmpdir(), 'edge-e2e-'));
sweepStaleProfiles();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const proc = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  '--disable-extensions', '--mute-audio', '--hide-scrollbars', '--force-device-scale-factor=1',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });

async function waitVersion() {
  for (let i = 0; i < 200; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); if (r.ok) return r.json(); }
    catch { /* not up */ }
    await sleep(150);
  }
  throw new Error('Edge 調試端口沒起來');
}

const results = [];
let consoleErrors = [], exceptions = [];
function ok(name, cond, detail = '') {
  results.push({ name, ok: !!cond, detail });
  console.log(`${cond ? '✓' : '✗'} ${results.length}. ${name}${detail ? ' — ' + detail : ''}`);
}

let seq = 0;
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
  const fmt = (a) => (!a ? '?' : ('value' in a) ? String(a.value) : (a.description || a.type || '?'));
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      return m.error ? rej(new Error(m.error.message)) : res(m.result);
    }
    const p = m.params ?? {};
    if (m.method === 'Runtime.exceptionThrown') {
      exceptions.push(p.exceptionDetails?.exception?.description || p.exceptionDetails?.text || '?');
    } else if (m.method === 'Runtime.consoleAPICalled' && p.type === 'error') {
      consoleErrors.push((p.args ?? []).map(fmt).join(' '));
    }
  });
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  await send('Runtime.enable'); await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 750, height: 1334, deviceScaleFactor: 1, mobile: false });

  const evalJs = async (expr) => {
    const r = await send('Runtime.evaluate', {
      expression: `(async () => { ${expr} })()`, awaitPromise: true, returnByValue: true,
    });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result?.value;
  };
  const nav = async (q = '', wait = 2600) => {
    exceptions = []; consoleErrors = [];
    await send('Page.navigate', { url: PAGE + q });
    await sleep(wait);
  };
  const clearAll = async () => {
    await send('Page.navigate', { url: ORIGIN + '/web/items.html' });
    await sleep(900);
    await evalJs(`localStorage.removeItem('sanguo_saves_v1'); localStorage.removeItem('sanguo_campaign_v1'); return 1;`);
  };
  const readStore = () => evalJs(`return JSON.parse(localStorage.getItem('sanguo_saves_v1') || 'null');`);
  const readLegacy = () => evalJs(`return JSON.parse(localStorage.getItem('sanguo_campaign_v1') || 'null');`);
  const mouseClick = async (sel, nth = 0) => {
    const box = await evalJs(`const els = document.querySelectorAll(${JSON.stringify(sel)});
      const el = els[${nth}]; if (!el) return null;
      const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height };`);
    if (!box) throw new Error('找不到可點元素 ' + sel + ' #' + nth);
    for (const type of ['mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', clickCount: 1 });
    }
    await sleep(260);
    return box;
  };

  // ---------------------------------------------------------------- T1 舊檔遷移
  console.log('\n=== T1 舊 sanguo_campaign_v1 → 槽 1（未知字段保留） ===');
  await clearAll();
  await nav();   // 首訪：無存檔不應寫任何東西
  const pristine = await evalJs(`return { saves: localStorage.getItem('sanguo_saves_v1'), legacy: localStorage.getItem('sanguo_campaign_v1'),
    picker: !document.querySelector('#pickSheet').hidden, badge: document.querySelector('#slotBadge').textContent };`);
  ok('首訪無存檔：不寫槽、不寫舊鍵，直接彈選劇本', pristine.saves === null && pristine.legacy === null && pristine.picker && pristine.badge === '未開局',
    JSON.stringify(pristine));

  const legacyObj = {
    seeded: true, month: 5, gold: 2345, wins: 3, losses: 1, defWins: 1,
    log: [{ t: '1年5月', s: '舊版存檔', k: 'info' }],
    owned: ['襄平', '北平', '代縣', '晉陽'],
    cities: {
      襄平: { troops: 143, pop: 79500, money: 2846 },
      北平: { troops: 145, pop: 89000, money: 2917 },
      代縣: { troops: 178, pop: 172000, money: 3540 },
      晉陽: { troops: 200, pop: 120000, money: 3000 },
    },
    // main.js 另一個人正在寫進去的字段（campaign 必須原樣保留）
    captured: { 北平: { day: 1, by: '我軍', tags: ['騎', '弓'] } },
    drops: [{ name: '鐵脊蛇矛', from: '北平', qty: 1 }],
    weirdKey: 'keep-me',
    last: '北平',
    ts: Date.now() - 60_000,
  };
  await evalJs(`localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(JSON.stringify(legacyObj))}); return 1;`);
  await nav();
  const st1 = await readStore();
  const migNotice = await evalJs(`return document.querySelector('#notice').hidden ? null : document.querySelector('#notice').textContent;`);
  const badge1 = await evalJs(`return document.querySelector('#slotBadge').textContent;`);
  const hdr1 = await evalJs(`return { sc: document.querySelector('#scName').textContent, ym: document.querySelector('#ym').textContent,
    gold: document.querySelector('#gold').textContent, ct: document.querySelector('#ct').textContent, rec: document.querySelector('#rec').textContent };`);
  ok('遷移後有 1 個槽（10 槽容器）', st1 && st1.slots.length === 10 && st1.slots.filter(Boolean).length === 1,
    `slots=${st1?.slots?.length} filled=${st1?.slots?.filter(Boolean).length}`);
  ok('遷移到槽 1、last=1、名為「槽 1」', st1?.slots[0]?.name === '槽 1' && st1?.last === 1, JSON.stringify({ name: st1?.slots[0]?.name, last: st1?.last }));
  ok('槽摘要字段正確（剧本/第1年5月/城4/3勝1敗）',
    st1?.slots[0]?.scenario === 1 && st1?.slots[0]?.month === 5 && st1?.slots[0]?.ownedCount === 4
    && st1?.slots[0]?.wins === 3 && st1?.slots[0]?.losses === 1,
    JSON.stringify({ scenario: st1?.slots[0]?.scenario, month: st1?.slots[0]?.month, owned: st1?.slots[0]?.ownedCount, wins: st1?.slots[0]?.wins }));
  ok('遷移保留未知字段 captured / drops / weirdKey / last',
    JSON.stringify(st1?.slots[0]?.snapshot?.captured) === JSON.stringify(legacyObj.captured)
    && JSON.stringify(st1?.slots[0]?.snapshot?.drops) === JSON.stringify(legacyObj.drops)
    && st1?.slots[0]?.snapshot?.weirdKey === 'keep-me' && st1?.slots[0]?.snapshot?.last === '北平',
    'captured.day=' + st1?.slots[0]?.snapshot?.captured?.北平?.day);
  ok('遷移提示在消息欄出現（一次）', !!migNotice && migNotice.includes('已自動遷移到槽 1'), String(migNotice));
  ok('標題列顯示遷移後的存檔（槽 1 / 第1年5月 / 城4 / 3勝1敗）',
    badge1 === '槽 1' && hdr1.ym === '1 年 5 月' && hdr1.ct === '4' && hdr1.rec === '3 勝 1 敗 · 守 1' && hdr1.gold === '2,345',
    JSON.stringify({ badge1, ...hdr1 }));

  // ---------------------------------------------------------------- T2 存 / 讀 / 刪
  console.log('\n=== T2 存 / 讀 / 刪（真實滑鼠點擊） ===');
  await mouseClick('#btnSave');
  const sheetOpen = await evalJs(`return { open: !document.querySelector('#saveSheet').hidden, rows: document.querySelectorAll('#slotRows .slot').length };`);
  ok('點「存檔」打開 10 槽浮層', sheetOpen.open && sheetOpen.rows === 10, JSON.stringify(sheetOpen));
  const saveBox = await mouseClick('#slotRows .slot:nth-child(3) button[data-do=save]');
  const st2 = await readStore();
  ok('點槽 3「存」→ 寫入槽 3、last=3、槽數不變（10/2 非空）',
    st2?.slots[2]?.name === '槽 3' && st2?.last === 3 && st2?.slots.length === 10 && st2?.slots.filter(Boolean).length === 2,
    `last=${st2?.last} filled=${st2?.slots?.filter(Boolean).length} box=${JSON.stringify(saveBox)}`);
  ok('槽 3 快照保留 captured / drops', st2?.slots[2]?.snapshot?.captured?.北平?.day === 1 && st2?.slots[2]?.snapshot?.drops?.[0]?.name === '鐵脊蛇矛',
    'drops=' + JSON.stringify(st2?.slots[2]?.snapshot?.drops));
  const badge2 = await evalJs(`return document.querySelector('#slotBadge').textContent;`);
  const flashMsg = await evalJs(`return document.querySelector('#saveMsg').textContent;`);
  ok('存檔後徽章變槽 3、浮層內有成功提示', badge2 === '槽 3' && flashMsg.includes('已存入槽 3'), JSON.stringify({ badge2, flashMsg }));

  await mouseClick('#slotRows .slot:nth-child(1) button[data-do=load]');
  const afterLoad = await evalJs(`return { badge: document.querySelector('#slotBadge').textContent,
    ym: document.querySelector('#ym').textContent, sheet: !document.querySelector('#saveSheet').hidden,
    notice: document.querySelector('#notice').hidden ? null : document.querySelector('#notice').textContent };`);
  const st2b = await readStore();
  ok('點槽 1「讀」→ 回到第1年5月、關浮層、last=1', afterLoad.badge === '槽 1' && afterLoad.ym === '1 年 5 月'
    && !afterLoad.sheet && st2b.last === 1 && (afterLoad.notice || '').includes('已讀取槽 1'), JSON.stringify({ afterLoad, last: st2b.last }));

  await mouseClick('#btnSave');
  await mouseClick('#slotRows .slot:nth-child(3) button[data-do=del]');
  const st3 = await readStore();
  const delRow = await evalJs(`const r = document.querySelectorAll('#slotRows .slot')[2];
    return { text: r.textContent.replace(/\\s+/g, ' ').trim(), empty: r.classList.contains('empty'),
      disabled: r.querySelectorAll('.sbtns button[disabled]').length,
      canRead: !!r.querySelector('[data-do=load]') };`);
  ok('點槽 3「刪」→ 該槽變空、讀/刪按鈕禁用、其它槽不受影響',
    st3?.slots[2] === null && st3?.slots.filter(Boolean).length === 1 && delRow.empty && delRow.disabled === 2 && !delRow.canRead,
    JSON.stringify({ empty: delRow.empty, disabled: delRow.disabled, canRead: delRow.canRead, text: delRow.text }));

  // ---------------------------------------------------------------- T3 損壞 JSON
  console.log('\n=== T3 損壞 JSON 不崩 ===');
  await evalJs(`localStorage.setItem('sanguo_saves_v1', '{oops not json');
    localStorage.setItem('sanguo_campaign_v1', '<<<bad>>>'); return 1;`);
  await nav();
  const broken = await evalJs(`return { sc: document.querySelector('#scName')?.textContent,
    picker: !document.querySelector('#pickSheet').hidden, badge: document.querySelector('#slotBadge').textContent,
    body: document.body.textContent.includes('選擇劇本') };`);
  ok('壞 saves/legacy JSON：頁面正常、回選劇本、未開局',
    broken.picker && broken.badge === '未開局' && !exceptions.length && !consoleErrors.length,
    JSON.stringify({ broken, exceptions, consoleErrors }));

  // ---------------------------------------------------------------- T4 新遊戲 + 換劇本
  console.log('\n=== T4 新遊戲（劇本 3）→ 換劇本 4（覆蓋確認） ===');
  await clearAll();
  await nav('?panel=new');
  await mouseClick('#pickCards .scard', 2);            // 群雄割劇（第 3 張）
  await mouseClick('#btnPickStart');
  const st4 = await readStore();
  const newGame = await evalJs(`return { sc: document.querySelector('#scName').textContent,
    ym: document.querySelector('#ym').textContent, badge: document.querySelector('#slotBadge').textContent,
    picker: !document.querySelector('#pickSheet').hidden };`);
  ok('新遊戲：劇本 3、第1年1月、寫入槽 1、關浮層',
    st4?.slots[0]?.snapshot?.scenario === 3 && st4?.slots[0]?.month === 1 && st4?.last === 1
    && newGame.sc === '群雄割劇' && newGame.ym === '1 年 1 月' && !newGame.picker && newGame.badge === '槽 1',
    JSON.stringify({ meta: st4?.slots[0] && { scenario: st4.slots[0].scenario, month: st4.slots[0].month }, newGame }));
  ok('劇本 3 初始三城＝襄平/北平/代縣，襄平人口 83500（不是劇本 1 的 79500）',
    JSON.stringify(st4?.slots[0]?.snapshot?.owned) === JSON.stringify(['襄平', '北平', '代縣'])
    && st4?.slots[0]?.snapshot?.cities?.襄平?.pop === 83500,
    'owned=' + JSON.stringify(st4?.slots[0]?.snapshot?.owned) + ' pop=' + st4?.slots[0]?.snapshot?.cities?.襄平?.pop);

  await mouseClick('#scstrip .sc', 3);                  // 赤壁之戰
  const confirmShown = await evalJs(`return { open: !document.querySelector('#confirmSheet').hidden,
    msg: document.querySelector('#confirmMsg').textContent, title: document.querySelector('#confirmTitle').textContent };`);
  ok('有進行中存檔時換劇本 → 彈「會覆蓋」確認',
    confirmShown.open && confirmShown.title.includes('切 換 劇 本') && confirmShown.msg.includes('會覆蓋') && confirmShown.msg.includes('槽 1'),
    confirmShown.msg);
  await mouseClick('#btnConfirmOk');
  const st5 = await readStore();
  const switched = await evalJs(`return { sc: document.querySelector('#scName').textContent,
    ym: document.querySelector('#ym').textContent, ct: document.querySelector('#ct').textContent };`);
  ok('確認後切到劇本 4：槽 1 被覆蓋為赤壁之戰、第1年1月、襄平人口 93500',
    st5?.slots[0]?.snapshot?.scenario === 4 && st5?.slots[0]?.month === 1
    && st5?.slots[0]?.snapshot?.cities?.襄平?.pop === 93500 && switched.sc === '赤壁之戰' && switched.ym === '1 年 1 月',
    JSON.stringify({ meta: st5?.slots[0] && { scenario: st5.slots[0].scenario, month: st5.slots[0].month }, pop: st5?.slots[0]?.snapshot?.cities?.襄平?.pop, switched }));

  // ---------------------------------------------------------------- T5 戰鬥寫回同步
  console.log('\n=== T5 main.js 戰鬥寫回（legacy ts 較新）→ 啟動同步回槽 ===');
  const before = await readStore();
  const legacy2 = JSON.parse(await evalJs(`return localStorage.getItem('sanguo_campaign_v1');`));
  legacy2.wins = before.slots[0].wins + 1;
  legacy2.ts = Date.now() + 1000;
  legacy2.captured = { 襄平: { day: 2, note: '戰後' } };
  legacy2.drops = [{ name: '孫子兵法', from: '襄平' }];
  await evalJs(`localStorage.setItem('sanguo_campaign_v1', ${JSON.stringify(JSON.stringify(legacy2))}); return 1;`);
  await nav();
  const st6 = await readStore();
  const battleUi = await evalJs(`return { rec: document.querySelector('#rec').textContent,
    notice: document.querySelector('#notice').hidden ? null : document.querySelector('#notice').textContent,
    badge: document.querySelector('#slotBadge').textContent };`);
  ok('戰鬥寫回被採用：勝場 +1、槽快照同步、提示「戰鬥結果已寫回」',
    st6?.slots[0]?.wins === before.slots[0].wins + 1 && st6?.slots[0]?.snapshot?.wins === before.slots[0].wins + 1
    && (battleUi.notice || '').includes('戰鬥結果已寫回') && battleUi.badge === '槽 1',
    JSON.stringify({ wins: st6?.slots[0]?.wins, notice: battleUi.notice, rec: battleUi.rec }));
  ok('戰鬥寫回新增的 captured / drops 也保留在槽快照裡',
    st6?.slots[0]?.snapshot?.captured?.襄平?.day === 2 && st6?.slots[0]?.snapshot?.drops?.[0]?.name === '孫子兵法',
    'captured=' + JSON.stringify(st6?.slots[0]?.snapshot?.captured));

  // ---------------------------------------------------------------- T6 推進一月自動存檔
  console.log('\n=== T6 推進一月 → 自動存回最近使用的槽 ===');
  const m0 = (await readStore())?.slots[0];
  await nav('?adv=2', 4200);
  const st7 = await readStore();
  const advUi = await evalJs(`return { ym: document.querySelector('#ym').textContent, badge: document.querySelector('#slotBadge').textContent };`);
  ok('?adv=2：槽 1 的 month 由 1 → 3，時間戳更新（自動存檔）',
    st7?.slots[0]?.month === 3 && st7?.slots[0]?.snapshot?.month === 3 && st7?.slots[0]?.ts > m0.ts && st7?.last === 1,
    JSON.stringify({ month: st7?.slots[0]?.month, ym: advUi.ym, ts: st7?.slots[0]?.ts, oldTs: m0.ts }));
  ok('推進後標題列同步（3 月）且沒有 console 異常', advUi.ym === '1 年 3 月' && !exceptions.length && !consoleErrors.length,
    JSON.stringify({ ym: advUi.ym, exceptions, consoleErrors }));

  // ---------------------------------------------------------------- 樣本
  const finalStore = await readStore();
  await writeFile('F:\\sanguo\\work\\saves_sample_full.json', JSON.stringify(finalStore, null, 2));
  const sample = {
    v: finalStore.v, last: finalStore.last,
    slots: finalStore.slots.map((e, i) => i === 0 && e ? {
      ...e,
      snapshot: {
        ...e.snapshot,
        cities: { 襄平: e.snapshot.cities.襄平, '…': `共 ${Object.keys(e.snapshot.cities).length} 城` },
        owned: e.snapshot.owned,
      },
    } : (e ? `${e.name}…` : null)),
  };
  console.log('\n=== sanguo_saves_v1 真實樣本（snapshot.cities 只留一城 + 城數）===');
  console.log(JSON.stringify(sample, null, 2));
  console.log('\n完整原始 JSON → F:\\sanguo\\work\\saves_sample_full.json');

  console.log('\n=== 匯總 ===');
  const bad = results.filter((r) => !r.ok);
  console.log(`${results.length - bad.length} 過 / ${results.length} 條` + (bad.length ? '；FAIL: ' + bad.map((b) => b.name).join(' | ') : ''));
  console.log(`exception=${exceptions.length} console.error=${consoleErrors.length}`);
  ws.close();
  process.exitCode = bad.length ? 1 : 0;
} finally {
  try { proc.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
}
