// 兵種動作圖集（anim/units.json + units_00.png）接線驗收：CDP 無頭跑三種對戰 + 兩條降級路徑。
//
// 跑法（先確保 dev server 在跑：cd F:\sanguo\game && node web/serve.mjs 5199）：
//   cd F:\sanguo\work
//   node verify_units.mjs            # 默認 dev server 5199
//   node verify_units.mjs --port 5199
//
// 做法：Edge headless + CDP，`Page.addScriptToEvaluateOnNewDocument` 給頁面打兩個補丁
// （`clearRect` 當「換幀」信號，`drawImage` 記錄每次偷畫的來源與幀名），於是每次
// render 都能數出「這幀裡 units_00.png / atlas_00.png / 染色 canvas 各畫了幾次」，
// 以及「畫到了哪些 sprite 幀（archer_back_f003 這種）」。幀名→圖集靠 rect 反查
// （units.json 1024×528、atlas.json 1024×1024，兩張表不重疊）。
//
// 驗收點：
//   1) 頁面 0 exception（Runtime.exceptionThrown + console.error）
//   2) 混合局同時出現 units_00.png 與 atlas_00.png 兩種圖源（同一幀裡）
//   3) 敵方弓兵用 archer.front（BladeVsBow 只有 archer_front、BowVsBlade 只有 archer_back）
//   4) 降級：block units.json / units_00.png → state.units 為 null、warn 一次、頁面照畫 atlas、0 exception
//   5) 順手存三張截圖 work/units_{bow_vs_blade,blade_vs_bow,bow_vs_bow}.png
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { cleanupProfile, sweepStaleProfiles } from './edge_temp_guard.mjs';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const ROOT = 'F:\\sanguo';
const ANIM = join(ROOT, 'game', 'web', 'anim');
const WORK = join(ROOT, 'work');

const argv = process.argv.slice(2);
const portArg = argv.indexOf('--port');
const DEV_PORT = portArg >= 0 ? Number(argv[portArg + 1]) : 5199;
const BASE = `http://127.0.0.1:${DEV_PORT}/web/index.html`;
const CDP_PORT = 9600 + Math.floor(Math.random() * 200);
const W = 750;
const H = 1334;
/** 三張對戰圖 + 兩條降級路徑都用同一個種子與 tick，保證可複現 */
const SEED = 7;
const SIM = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// 幀表：把兩套 JSON 的 sprite 名 ↔ rect 對上，注入頁面供 drawImage 反查
// 注意：兩張圖集都是 1024 寬、左上角起排，**rect 會撞**（例如 0,0,80,104 兩邊都有），
// 所以先按「圖源」分表：units_00.png / canvas:1024x528 → units，atlas_00.png / canvas:1024x1024 → atlas。
// ---------------------------------------------------------------------------
const UNITS_IMG = 'units_00.png';
const UNITS_TINT = 'canvas:1024x528';
const ATLAS_IMG = 'atlas_00.png';
const ATLAS_TINT = 'canvas:1024x1024';

function frameTables() {
  const read = (f) => JSON.parse(readFileSync(join(ANIM, f), 'utf8'));
  const bySrc = {};
  const srcOfSrc = {};
  for (const [file, keys, tag] of [
    ['units.json', [UNITS_IMG, UNITS_TINT], 'units'],
    ['atlas.json', [ATLAS_IMG, ATLAS_TINT], 'atlas'],
  ]) {
    const j = read(file);
    const table = {};
    for (const sp of j.pages[0].sprites) table[`${sp.x},${sp.y},${sp.w},${sp.h}`] = sp.name;
    for (const k of keys) {
      bySrc[k] = table;
      srcOfSrc[k] = tag;
    }
  }
  return { bySrc, srcOfSrc };
}

const HOOK = (() => {
  const { bySrc, srcOfSrc } = frameTables();
  return `(() => {
  if (window.__uHooked) return;
  window.__uHooked = true;
  const R = ${JSON.stringify(bySrc)};
  const TAG = ${JSON.stringify(srcOfSrc)};
  const bank = { cur: null, frames: [] };
  window.__uBank = bank;
  const newFrame = () => {
    bank.cur = { src: {}, name: {}, bysrc: {} };
    bank.frames.push(bank.cur);
    if (bank.frames.length > 240) bank.frames.shift();
    return bank.cur;
  };
  newFrame();
  const origClear = CanvasRenderingContext2D.prototype.clearRect;
  CanvasRenderingContext2D.prototype.clearRect = function (...a) {
    try { newFrame(); } catch (e) { /* 不影響繪製 */ }
    return origClear.apply(this, a);
  };
  const origDraw = CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage = function (img, ...a) {
    try {
      let key;
      if (img && typeof img.src === 'string' && img.src) key = img.src.split('/').pop();
      else if (img && typeof img.width === 'number') key = 'canvas:' + img.width + 'x' + img.height;
      else key = 'other';
      const f = bank.cur || newFrame();
      f.src[key] = (f.src[key] || 0) + 1;
      if (a.length === 8) {   // drawImage(img, sx,sy,sw,sh, dx,dy,dw,dh) = 序列幀
        const rk = a[0] + ',' + a[1] + ',' + a[2] + ',' + a[3];
        const table = R[key];
        const name = (table && table[rk]) || ('unknown:' + rk);
        f.name[name] = (f.name[name] || 0) + 1;
        const tag = TAG[key] || (name.startsWith('unknown:') ? 'unknown' : '?');
        f.bysrc[tag] = (f.bysrc[tag] || 0) + 1;
      }
    } catch (e) { /* 記錄失敗不許影響畫面 */ }
    return origDraw.apply(this, arguments);
  };
  window.__uSummary = () => {
    const names = new Set();
    const srcs = {};
    let both = 0;
    for (const f of bank.frames) {
      for (const k in f.name) names.add(k);
      for (const k in f.src) srcs[k] = (srcs[k] || 0) + f.src[k];
      if (f.bysrc.units && f.bysrc.atlas) both += 1;
    }
    return {
      frames: bank.frames.length,
      bothFrames: both,
      names: [...names].sort(),
      srcs,
      last: bank.frames.slice(-1)[0] || null,
    };
  };
})();`;
})();

// ---------------------------------------------------------------------------
// Edge + CDP
// ---------------------------------------------------------------------------
const profile = mkdtempSync(join(tmpdir(), 'edge-units-'));
sweepStaleProfiles();
const edge = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${CDP_PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${W},${H}`,
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--enable-unsafe-swiftshader',
    'about:blank',
  ],
  { stdio: 'ignore' },
);

async function findTarget() {
  for (let i = 0; i < 100; i += 1) {
    try {
      const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
      const list = await r.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch { /* not up yet */ }
    await sleep(200);
  }
  throw new Error('devtools endpoint never came up');
}

const target = await findTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
let msgId = 0;
const pending = new Map();
/** 每輪導航重填：exception / console.error / console.warn 都收 */
let logs = [];

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) reject(new Error(JSON.stringify(msg.error)));
    else resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails;
    logs.push({ kind: 'exception', text: d.exception?.description || d.text, url: d.url, line: d.lineNumber });
  } else if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args || []).map((a) => a.value ?? a.description ?? a.type).join(' ');
    const type = msg.params.type;
    if (type === 'error' || type === 'warning') logs.push({ kind: `console.${type}`, text });
  } else if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry;
    if (e.level === 'error') logs.push({ kind: 'log.error', text: e.text, url: e.url });
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });

async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(`eval 失敗：${r.exceptionDetails.exception?.description || r.exceptionDetails.text}`);
  return r.result?.value;
}

/** 等 sim 跑完（tick 到位）再取樣 */
async function waitSim(expectedTick, timeoutMs = 25000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tick = await evaluate('(window.__sanguo && window.__sanguo.state.world) ? window.__sanguo.state.world.tick : -1').catch(() => -1);
    if (tick >= expectedTick) return tick;
    await sleep(120);
  }
  throw new Error(`等不到 tick ${expectedTick}`);
}

async function screenshot(file) {
  const clip = JSON.parse(
    await evaluate(`JSON.stringify((() => {
      const e = document.querySelector('#stage');
      const b = e.getBoundingClientRect();
      return { x: Math.floor(b.x), y: Math.floor(b.y), width: Math.ceil(b.width), height: Math.ceil(b.height) };
    })())`),
  );
  clip.scale = 1;
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip });
  writeFileSync(file, Buffer.from(shot.data, 'base64'));
  return { file, ...clip };
}

// ---------------------------------------------------------------------------
// 驗收
// ---------------------------------------------------------------------------
let pass = 0;
let fail = 0;
const failures = [];
function check(ok, label, detail = '') {
  if (ok) {
    pass += 1;
    console.log(`  ✓ ${label}${detail ? ' — ' + detail : ''}`);
  } else {
    fail += 1;
    failures.push(label);
    console.log(`  ✗ ${label}${detail ? ' — ' + detail : ''}`);
  }
}

const families = (names) => {
  const out = {};
  for (const n of names) {
    const m = /^(archer_(?:back|front)|walk_(?:back|front|side)|attack_front|ride_back)/.exec(n);
    if (m) out[m[1]] = (out[m[1]] || 0) + 1;
  }
  return out;
};

async function runCase(c) {
  logs = [];
  await send('Network.setBlockedURLs', { urls: c.block ?? [] });
  const url = `${BASE}?troop=${c.troop}&btroop=${c.btroop}&seed=${SEED}&sim=${SIM}&freeze=1&auto=1`;
  await send('Page.navigate', { url });
  const tick = await waitSim(SIM);
  await sleep(600); // 讓 rAF 多畫幾幀，bucket 穩定
  const snap = JSON.parse(
    await evaluate(`JSON.stringify({
      tick: window.__sanguo.state.world.tick,
      mode: window.__sanguo.state.mode,
      hasUnits: !!window.__sanguo.state.units,
      hasAtlas: !!window.__sanguo.state.atlas,
      units: window.__sanguo.state.units ? { frames: Object.keys(window.__sanguo.state.units.frames).length, groups: Object.keys(window.__sanguo.state.units.groups) } : null,
      atkA: window.__sanguo.state.world.stats.attacksA,
      atkB: window.__sanguo.state.world.stats.attacksB,
      swingA: window.__sanguo.state.world.units.filter((u) => u.alive && u.side === 'A' && u.cd > 96).length,
      swingB: window.__sanguo.state.world.units.filter((u) => u.alive && u.side === 'B' && u.cd > 96).length,
      sum: window.__uSummary(),
    })`),
  );
  const names = snap.sum.names;
  const fam = families(names);
  const srcs = snap.sum.srcs;
  const exceptions = logs.filter((l) => l.kind === 'exception' || l.kind === 'console.error' || l.kind === 'log.error');
  const warns = logs.filter((l) => l.kind === 'console.warning');

  console.log(`\n=== ${c.label}（troop ${c.troop} vs ${c.btroop}${c.block ? '，blocked ' + c.block.join(',') : ''}）`);
  console.log(`  tick=${snap.tick} mode=${snap.mode} units=${JSON.stringify(snap.units)} atlas=${snap.hasAtlas}`);
  console.log(`  攻擊次數 A=${snap.atkA} B=${snap.atkB}；出手窗口內士兵 A=${snap.swingA} B=${snap.swingB}`);
  console.log(`  drawImage 圖源（最後 ${snap.sum.frames} 幀累計）：${JSON.stringify(srcs)}`);
  console.log(`  本幀圖源：${JSON.stringify(snap.sum.last?.src ?? {})}`);
  console.log(`  本幀幀名 → 圖集：${JSON.stringify(snap.sum.last?.bysrc ?? {})}`);
  console.log(`  幀名族：${JSON.stringify(fam)}  （幀名 ${names.length} 個）`);
  console.log(`  frames key 集合：${names.filter((n) => !n.startsWith('unknown')).join(' ')}`);
  if (warns.length) console.log(`  warn：${warns.map((w) => w.text).join(' | ')}`);
  if (exceptions.length) console.log(`  !! exception：${exceptions.map((e) => e.text).join(' | ')}`);

  // ① 0 exception
  check(exceptions.length === 0, '0 exception', exceptions.length ? exceptions[0].text.slice(0, 160) : '');

  if (c.expect === 'ok') {
    // ② 兩種圖源（同幀）
    check(snap.hasUnits === true, 'units.json 已載入（state.units 非 null）');
    check((srcs[UNITS_IMG] || 0) > 0, 'units_00.png 有被 drawImage', `${srcs[UNITS_IMG] || 0} 次`);
    for (const k of c.mustSrc ?? []) check((srcs[k] || 0) > 0, `圖源 ${k} 在場`, `${srcs[k] || 0} 次`);
    if (c.bothSources) {
      check((srcs[ATLAS_IMG] || 0) > 0, 'atlas_00.png 同時在場', `${srcs[ATLAS_IMG] || 0} 次`);
      check(snap.sum.bothFrames > 0, '存在「兩種圖源同幀」的畫面', `${snap.sum.bothFrames} 幀`);
    }
    // ③ 敵方弓兵用 front / 我方用 back
    for (const f of c.mustHave ?? []) check((fam[f] || 0) > 0, `用到 ${f} 幀`, `${fam[f] || 0} 個`);
    for (const f of c.mustNotHave ?? []) check((fam[f] || 0) === 0, `沒誤用 ${f} 幀`);
    if (c.shot) {
      const info = await screenshot(join(WORK, c.shot));
      console.log(`  截圖：${info.file}（${info.width}×${info.height}）`);
    }
  } else if (c.expect === 'fallback') {
    // ④ 降級：不白屏、不拋錯、warn 一次、退回 atlas
    check(snap.hasUnits === false, 'state.units 為 null（沒留半套圖集）');
    check((srcs[UNITS_IMG] || 0) === 0, 'units_00.png 一次都沒畫');
    check((srcs[ATLAS_IMG] || 0) > 0, 'atlas_00.png 照畫（退回舊圖集）', `${srcs[ATLAS_IMG] || 0} 次`);
    check(((fam.archer_back || 0) + (fam.archer_front || 0)) === 0, '沒有 archer_* 幀（退回 walk_back/walk_front）');
    check(((fam.walk_back || 0) + (fam.walk_front || 0)) > 0, '退回 walk_back / walk_front', JSON.stringify(fam));
    check(warns.some((w) => w.text.includes('兵種圖集未載入')), 'warn 了一次「兵種圖集未載入」');
    check(snap.tick >= SIM, '戰鬥照常推進', `tick=${snap.tick}`);
  }
}

try {
  await new Promise((r) => ws.addEventListener('open', r));
  await send('Runtime.enable');
  await send('Log.enable');
  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: HOOK });

  console.log(`dev server: ${BASE}；seed=${SEED} sim=${SIM}（freeze）`);

  await runCase({
    key: 'blade_vs_bow',
    label: '大刀(A) vs 弓箭(B)：敵方弓兵必須用 archer.front',
    troop: 2,
    btroop: 3,
    expect: 'ok',
    bothSources: true,
    mustSrc: [ATLAS_IMG, UNITS_TINT], // A 大刀用原圖、B 弓兵用 units 染色 canvas
    mustHave: ['archer_front', 'walk_back', 'attack_front'],
    mustNotHave: ['archer_back'],
    shot: 'units_blade_vs_bow.png',
  });

  await runCase({
    key: 'bow_vs_blade',
    label: '弓箭(A) vs 大刀(B)：我方弓兵必須用 archer.back',
    troop: 3,
    btroop: 2,
    expect: 'ok',
    bothSources: true,
    mustSrc: [UNITS_IMG, ATLAS_TINT], // A 弓兵用原圖、B 大刀用 atlas 染色 canvas
    mustHave: ['archer_back', 'walk_front'],
    mustNotHave: ['archer_front'],
    shot: 'units_bow_vs_blade.png',
  });

  await runCase({
    key: 'bow_vs_bow',
    label: '弓箭 vs 弓箭：兩側都是 units 圖集（背視 + 染色正視）',
    troop: 3,
    btroop: 3,
    expect: 'ok',
    bothSources: false, // 全場都是弓兵，本來就沒有 atlas 兵
    mustSrc: [UNITS_IMG, UNITS_TINT],
    mustHave: ['archer_back', 'archer_front'],
    shot: 'units_bow_vs_bow.png',
  });

  await runCase({
    key: 'fallback_units_json',
    label: '降級 1：units.json 404 → 退回 atlas.json',
    troop: 3,
    btroop: 3,
    expect: 'fallback',
    block: ['*anim/units.json*'],
  });

  await runCase({
    key: 'fallback_units_png',
    label: '降級 2：units_00.png 拉不到 → 退回 atlas.json',
    troop: 3,
    btroop: 3,
    expect: 'fallback',
    block: ['*anim/units_00.png*'],
  });
} finally {
  try { await send('Network.setBlockedURLs', { urls: [] }); } catch { /* ignore */ }
  ws.close();
  edge.kill();
  await sleep(400);
  try { edge.kill(); } catch { /* ignore */ }
  await cleanupProfile(profile);
}

console.log(`\n結果：${pass} 通過 / ${fail} 失敗`);
if (fail) {
  console.log(`失敗項：\n- ${failures.join('\n- ')}`);
  process.exit(1);
}
console.log('兵種圖集接線 OK：兩套圖源同場、敵方弓兵 archer.front、降級不白屏。');
