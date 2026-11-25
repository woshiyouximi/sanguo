#!/usr/bin/env node
// [216_apk] 用 CDP 驱动 Edge（无头，手机竖屏视口）打开 APK 里那四页，验证「发布形态」的界面卫生：
//   - window.__RELEASE__ === true / window.__sanguo === undefined（调试探针没挂）
//   - 战斗页不再出现开发期工具条（<header>）与齿轮按钮（#hdrBtn）、没有「開戰」按钮
//   - 即便带上 ?dev=1，探针也挂不上（发布形态把 dev 全部挡掉）
//   - campaign / city / deploy 三页各自能渲染（canvas 有内容）
// 顺便把四页截图存下来，作为报告里的证据。
//
//   node apk\test\cdp_shots.mjs [baseUrl] [outDir] [debugPort]

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://127.0.0.1:5299';
const OUT = path.resolve(process.argv[3] || 'F:\\sanguo\\work\\apk');
const PORT = Number(process.argv[4] || 9223);
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP 小客户端 ----------
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    this.waiters = [];
    this.errors = [];
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(`${msg.error.message} (${JSON.stringify(msg.error.data || null)})`)) : resolve(msg.result);
        return;
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params.exceptionDetails;
        this.errors.push(`${d.text || 'exception'} ${(d.exception && d.exception.description) || ''}`.trim().slice(0, 300));
      }
      if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
        this.errors.push(`log: ${msg.params.entry.text}`.slice(0, 300));
      }
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        const w = this.waiters[i];
        if (w.method === msg.method && w.sessionId === msg.sessionId) {
          this.waiters.splice(i, 1);
          w.resolve(msg.params);
        }
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify(payload));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }
  waitEvent(method, sessionId, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const w = { method, sessionId, resolve };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) {
          this.waiters.splice(i, 1);
          reject(new Error(`event timeout: ${method}`));
        }
      }, timeoutMs);
    });
  }
}

async function waitFor(url, timeoutMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(url);
      if (r.ok) return await r.json();
    } catch {}
    await sleep(300);
  }
  throw new Error(`等不到 ${url}`);
}

// ---------- 启动 Edge ----------
const profile = path.join(process.env.TEMP || 'C:\\Windows\\Temp', `sg-edge-${Date.now()}`);
const edge = spawn(
  EDGE,
  [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--hide-scrollbars',
    '--mute-audio',
    '--autoplay-policy=no-user-gesture-required',
    '--window-size=750,1334',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

let madeErrors = [];
const results = [];

function check(page, name, ok, detail) {
  results.push({ page, name, ok: !!ok, detail });
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
}

try {
  const ver = await waitFor(`http://127.0.0.1:${PORT}/json/version`, 30000);
  console.log(`Edge ${ver['Browser']}`);
  const wsUrl = ver.webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', () => rej(new Error('CDP websocket 连不上')), { once: true });
  });
  const browser = new Cdp(ws);

  const pages = [
    {
      id: '01-campaign',
      label: 'campaign.html（大地图 = APK 入口）',
      url: `${BASE}/campaign.html?rel=1`,
      settle: 5000,
      steps: [
        { label: '点「選君主」（首次开局的剧本卡）', js: `(() => {
            const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent && e.textContent.replace(/\\s+/g, '').includes('選君主'));
            if (!b) return null;
            b.click();
            return b.textContent.trim().slice(0, 20);
          })()` },
        { label: '在君主浮层里选第一位君主', js: `(() => {
            const box = document.querySelector('.kcard, .kings, .kingcard, #kings');
            const cands = [...document.querySelectorAll('button, .card, .scard, .kcard, li')]
              .filter((e) => e.offsetParent && /君主|曹操|劉備|孫堅|公孫瓚|袁紹|董卓/.test(e.textContent) && e.getBoundingClientRect().height > 20);
            const pick = cands.find((e) => e.getBoundingClientRect().height > 40) || cands[0];
            if (!pick) return null;
            pick.click();
            return pick.textContent.trim().replace(/\\s+/g, ' ').slice(0, 30);
          })()` },
        { label: '若还有「開始 / 進入」再点一下', js: `(() => {
            const b = [...document.querySelectorAll('button')].find((e) => e.offsetParent && /^(開始|開始遊戲|進入|確定)$/.test(e.textContent.trim()));
            if (!b) return 'no-confirm';
            b.click();
            return b.textContent.trim();
          })()` },
      ],
      own: (r) => [
        ['站点主界面（大地图）已渲染', r.canvasInk > 0.01 || r.textLen > 30, `canvas 非黑占比 ${(r.canvasInk * 100 || 0).toFixed(1)}% / 文字 ${r.textLen} 字`],
        ['地图画布有内容', r.canvasInk > 0.2, `canvas 非黑占比 ${(r.canvasInk * 100 || 0).toFixed(1)}%`],
      ],
    },
    {
      id: '02-city',
      label: 'city.html（内政）',
      url: `${BASE}/city.html?rel=1&city=襄平`,
      settle: 3500,
      own: (r) => [
        ['内政页已渲染（DOM 版式）', r.textLen > 30 && r.text.includes('內政'), `文字 ${r.textLen} 字，含「內政」=${r.text.includes('內政')}`],
      ],
    },
    {
      id: '03-deploy',
      label: 'deploy.html（出征）',
      url: `${BASE}/deploy.html?rel=1&city=襄平&from=襄平&bsoldiers=10`,
      settle: 3500,
      own: (r) => [
        ['出征页已渲染（DOM 版式）', r.textLen > 30 && /出征編成|出征/.test(r.textSquished), `文字 ${r.textLen} 字 / 开头「${r.textSquished.slice(0, 60)}」`],
        ['带了出征令参数，不显示「請從大地圖進入」', !r.textSquished.includes('請從大地圖'), r.textSquished.includes('請從大地圖') ? '出现了提示' : '正常'],
      ],
    },
    {
      id: '04-battle',
      label: 'index.html（战斗页，从大地图进入：带出征参数）',
      url: `${BASE}/index.html?rel=1&from=campaign&city=襄平&soldiers=10&bsoldiers=10`,
      settle: 6000,
      battle: true,
      own: (r) => [
        ['开发期工具条（<header>）不可见', r.headerDisplay === 'none', `header display=${r.headerDisplay}`],
        ['齿轮按钮 #hdrBtn 不可见', r.hdrBtnDisplay === 'none', `#hdrBtn display=${r.hdrBtnDisplay}`],
        ['「開戰」按钮 #start 不可见', r.startVisible === false, `#start 可见=${r.startVisible}`],
        ['战斗已自动开打（没有停在「開戰」引导卡）', r.hudMode !== 'ready' && r.hudMode !== 'no-hud', `mode=${r.hudMode}`],
        ['画布已放出来（rel-boot 已移除）', r.relBoot === false && r.stageVis !== 'hidden', `rel-boot=${r.relBoot} visibility=${r.stageVis}`],
        ['战斗画布已渲染', r.canvasInk > 0.01, `canvas 非黑占比 ${(r.canvasInk * 100 || 0).toFixed(1)}%`],
        ['HUD 只读通道 SG_HUD 可用', r.hasHud === true, r.hudText],
      ],
    },
    {
      id: '05-battle-naked',
      label: 'index.html（不带出征参数 = 开发期预览态）',
      url: `${BASE}/index.html?rel=1`,
      settle: 3000,
      isRedirect: true,
      own: () => [],
    },
  ];

  const DEVWORDS = ['本作規則', '[新設計]', '[推測]', 'Canvas2D 預覽', '豎屏重製'];

  for (const p of pages) {
    console.log(`\n== ${p.label}\n   ${p.url}`);
    const { targetId } = await browser.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId, flatten: true });
    const S = (m, params) => browser.send(m, params, sessionId);
    madeErrors = [];

    await S('Page.enable');
    await S('Runtime.enable');
    await S('Log.enable').catch(() => {});
    await S('Emulation.setDeviceMetricsOverride', {
      width: 750,
      height: 1334,
      deviceScaleFactor: 1,
      mobile: true,
      screenWidth: 750,
      screenHeight: 1334,
    });
    await S('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

    const loaded = browser.waitEvent('Page.loadEventFired', sessionId, 40000);
    await S('Page.navigate', { url: p.url });
    await loaded.catch(() => {});
    await sleep(p.settle);

    // 可选的交互步骤（例如首次开局要点剧本 / 选君主，才看得到大地图）
    for (const st of p.steps || []) {
      const { result: sr } = await S('Runtime.evaluate', { expression: st.js, returnByValue: true });
      const clicked = sr.value;
      if (clicked) {
        console.log(`   ↳ ${st.label}: ${String(clicked).slice(0, 40)}`);
      } else {
        console.log(`   ↳ ${st.label}: 找不到可点的元素`);
        const { result: dump } = await S('Runtime.evaluate', {
          expression: `[...document.querySelectorAll('button, .card, .scard, .kcard, li')].filter((e) => e.offsetParent).slice(0, 25).map((e) => (e.tagName + '.' + (e.className || '') + ' :: ' + e.textContent.trim().replace(/\\s+/g, ' ').slice(0, 24)))`,
          returnByValue: true,
        });
        console.log('      候选：' + JSON.stringify(dump.value));
      }
      await sleep(1100);
    }

    // 重定向型页面：确认被退回大地图
    if (p.isRedirect) {
      const { result: lr } = await S('Runtime.evaluate', { expression: 'location.pathname + location.search', returnByValue: true });
      check(p.id, '不带出征参数时自动退回大地图（不再露出开发期预览卡）', /campaign\.html/.test(lr.value || ''), lr.value);
    }

    // 采集页面状态：用一个自执行表达式把要的都取回来
    const expr = `(() => {
      const vis = (el) => {
        if (!el) return false;
        const s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) return false;
        const r = el.getBoundingClientRect();
        return r.width > 1 && r.height > 1;
      };
      const header = document.querySelector('header');
      const hdrBtn = document.getElementById('hdrBtn');
      const start = document.getElementById('start');
      const canvases = [...document.querySelectorAll('canvas')];
      let ink = 0;
      for (const c of canvases) {
        try {
          const w = Math.min(c.width, 240), h = Math.min(c.height, 240);
          if (!w || !h) continue;
          const tmp = document.createElement('canvas');
          tmp.width = w; tmp.height = h;
          const g = tmp.getContext('2d');
          g.drawImage(c, 0, 0, w, h);
          const d = g.getImageData(0, 0, w, h).data;
          let nonBlack = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i] > 12 || d[i + 1] > 12 || d[i + 2] > 12) nonBlack++;
          }
          ink = Math.max(ink, nonBlack / (w * h));
        } catch (e) { /* tainted canvas 之类，忽略 */ }
      }
      const hud = (typeof window.SG_HUD === 'function') ? window.SG_HUD() : null;
      return {
        url: location.href,
        readyState: document.readyState,
        release: window.__RELEASE__ === true,
        sanguo: typeof window.__sanguo,
        scenLv: typeof window.__scenLv,
        scenLevels: typeof window.__scenLevels,
        station: typeof window.__station,
        sgdevDev: !!(window.SGDev && window.SGDev.DEV),
        bodyClass: document.body.className,
        headerDisplay: header ? getComputedStyle(header).display : 'no-header',
        headerVisible: vis(header),
        hdrBtnDisplay: hdrBtn ? getComputedStyle(hdrBtn).display : 'no-hdrBtn',
        startVisible: vis(start),
        startText: start ? start.textContent.trim().slice(0, 20) : '',
        canvasInk: ink,
        hasHud: !!hud,
        hudText: hud ? JSON.stringify(hud) : '没有 SG_HUD',
        hudMode: hud ? hud.mode : 'no-hud',
        relBoot: document.body.classList.contains('rel-boot'),
        stageVis: (function () {
          var s = document.getElementById('stage');
          return s ? getComputedStyle(s).visibility : 'no-stage';
        })(),
        text: (document.body.innerText || '').replace(/\\s+/g, ' ').slice(0, 400),
        textLen: (document.body.innerText || '').trim().length,
        textSquished: (document.body.innerText || '').replace(/\\s+/g, '').slice(0, 600),
        dw: ${JSON.stringify(DEVWORDS)}.filter((w) => (document.body.innerText || '').includes(w)),
      };
    })()`;

    const { result, exceptionDetails } = await S('Runtime.evaluate', {
      expression: expr,
      returnByValue: true,
      awaitPromise: false,
    });
    if (exceptionDetails) throw new Error('evaluate 失败：' + JSON.stringify(exceptionDetails.exception?.description || exceptionDetails.text));
    const r = result.value;

    console.log(`   release=${r.release} __sanguo=${r.sanguo} SGDev.DEV=${r.sgdevDev} body="${r.bodyClass}" ready=${r.readyState}`);

    check(p.id, 'window.__RELEASE__ === true', r.release);
    check(p.id, 'window.__sanguo === undefined（调试探针没挂）', r.sanguo === 'undefined', `typeof = ${r.sanguo}`);
    check(p.id, 'window.__scenLv / __scenLevels 都没挂', r.scenLv === 'undefined' && r.scenLevels === 'undefined');
    check(p.id, 'SGDev.DEV === false', r.sgdevDev === false);
    check(p.id, '页面没有交办/调试字样', r.dw.length === 0, r.dw.length ? '出现 ' + r.dw.join('、') : '干净');
    for (const [n, ok, d] of p.own(r)) check(p.id, n, ok, d);

    // 截图先做（后面的 ?dev=1 子检查会跳页，截出来就不是这一页了）
    const shot = await S('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${p.id}.png`);
    fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
    console.log(`   📷 ${file} (${fs.statSync(file).size.toLocaleString('en-US')} B)`);

    // 额外：带 ?dev=1 也不能把探针挂回来
    if (p.battle) {
      await S('Page.navigate', { url: `${BASE}/index.html?rel=1&dev=1&sim=1` });
      await sleep(3000);
      const { result: r2 } = await S('Runtime.evaluate', {
        expression: `({sanguo: typeof window.__sanguo, dev: !!(window.SGDev && window.SGDev.DEV), rel: window.__RELEASE__ === true, scenLv: typeof window.__scenLv, path: location.pathname})`,
        returnByValue: true,
      });
      const v = r2.value;
      check(p.id, '?dev=1&sim=1 在发布形态下被忽略（探针仍不挂、DEV 仍 false）', v.sanguo === 'undefined' && v.dev === false && v.rel === true && v.scenLv === 'undefined', JSON.stringify(v));
    }

    if (madeErrors.length) {
      console.log(`   ⚠ 页面异常 ${madeErrors.length} 条：`);
      for (const e of madeErrors.slice(0, 6)) console.log('      ' + e);
      check(p.id, '页面没有未捕获异常', false, `${madeErrors.length} 条`);
    } else {
      check(p.id, '页面没有未捕获异常', true);
    }

    await browser.send('Target.closeTarget', { targetId });
  }

  await browser.send('Browser.close').catch(() => {});
  ws.close();
} catch (err) {
  console.error('\n💥 ' + (err && err.stack || err));
  process.exitCode = 2;
} finally {
  try { edge.kill(); } catch {}

  const failed = results.filter((r) => !r.ok);
  fs.writeFileSync(path.join(OUT, 'shots-report.json'), JSON.stringify({ base: BASE, results, errors: madeErrors }, null, 2));
  console.log(`\n${failed.length ? '❌' : '✅'} ${results.length - failed.length}/${results.length} PASS`);
  if (failed.length) {
    for (const f of failed) console.log(`   FAIL ${f.page}: ${f.name}${f.detail ? ' — ' + f.detail : ''}`);
    process.exitCode = 1;
  }
  setTimeout(() => process.exit(process.exitCode || 0), 300);
}
