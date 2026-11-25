// work/persp/shoot.mjs —— 透视投影截图（零依赖，有头 Edge + 原生 WebSocket）
//
// 用法：
//   node work/persp/shoot.mjs before     # 只拍 before_100v100（必须用改动前的 dist！）
//   node work/persp/shoot.mjs after      # 拍 after_100v100 / after_soldiers_closeup / after_generals
//
// 为什么不用 work/shots.ps1：那个是 headless --screenshot，页面在后台时 rAF 会停，
// 拍出来可能是半帧/首帧。这里按验收要求做 Page.bringToFront + 帧计数确认（web 页面没有
// Cocos 的 getTotalFrames()，所以注入 rAF 计数器 window.__fc 作为等价证据）。
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = Number(process.env.CDP_PORT || 9225);
const PROFILE = 'F:\\sanguo\\work\\.edgeprof_persp';
const OUT = 'F:\\sanguo\\work\\persp';
const BASE = 'http://127.0.0.1:5173/web/index.html';

const mode = process.argv[2] || 'after';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CDP 最小客户端 ----------
let ws = null;
let seq = 0;
const pending = new Map();
const events = [];

function connect(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', (e) => reject(new Error('ws error ' + (e.message || '?'))));
    ws.addEventListener('message', (ev) => {
      let m;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.id && pending.has(m.id)) {
        const p = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) p.reject(new Error(m.error.message + ' ' + JSON.stringify(m.error.data ?? '')));
        else p.resolve(m.result);
      } else if (m.method) {
        events.push(m);
      }
    });
  });
}

function send(method, params = {}, sessionId) {
  const msg = { id: ++seq, method, params };
  if (sessionId) msg.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
    setTimeout(() => {
      if (pending.has(msg.id)) { pending.delete(msg.id); reject(new Error('timeout ' + method)); }
    }, 60000);
  });
}

async function waitPort(ms = 30000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (r.ok) return await r.json();
    } catch { /* 还没起来 */ }
    await sleep(150);
  }
  throw new Error('Edge 调试端口没起来');
}

async function launchIfNeeded() {
  try {
    const r = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (r.ok) return 'reuse';
  } catch { /* fallthrough */ }
  if (!existsSync(EDGE)) throw new Error('找不到 Edge: ' + EDGE);
  spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--window-size=800,1560',
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  await waitPort();
  return 'launched';
}

// ---------- 页面操作 ----------
let session = null;

async function evaluate(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, session);
  if (r.exceptionDetails) throw new Error('eval 失败: ' + JSON.stringify(r.exceptionDetails).slice(0, 400));
  return r.result.value;
}

async function openScene(url) {
  await send('Page.enable', {}, session);
  await send('Page.navigate', { url }, session);
  const t0 = Date.now();
  while (Date.now() - t0 < 45000) {
    try {
      const ok = await evaluate('!!(window.__sanguo && window.__sanguo.state && window.__sanguo.state.world) && document.readyState === "complete"');
      if (ok) return;
    } catch { /* 导航中上下文会短暂消失 */ }
    await sleep(200);
  }
  throw new Error('页面没就绪: ' + url);
}

/** 验收要求：截前必须 bringToFront，并确认帧计数在涨。 */
async function ensureAnimating(tag) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await send('Page.bringToFront', {}, session);
    await sleep(120);
    const a = await evaluate('window.__fc || 0');
    await sleep(600);
    const b = await evaluate('window.__fc || 0');
    if (b - a >= 20) {
      console.log(`  [frames] ${tag}: ${a} → ${b} (+${b - a}) 渲染在跑 ✓`);
      return true;
    }
    console.log(`  [frames] ${tag}: ${a} → ${b} 没涨，重试 bringToFront…`);
  }
  throw new Error(tag + ': 帧计数不涨，拒绝截图（会拍到半帧）');
}

async function canvasBox() {
  return evaluate(`(() => {
    const c = document.querySelector('canvas');
    if (!c) return null;
    const r = c.getBoundingClientRect();
    window.scrollTo(0, 0);
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height), px: c.width };
  })()`);
}

async function shot(name, clip) {
  const r = await send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip } : {}) }, session);
  mkdirSync(OUT, { recursive: true });
  const path = join(OUT, name + '.png');
  writeFileSync(path, Buffer.from(r.data, 'base64'));
  console.log(`  [shot] ${path}`);
  return path;
}

async function newPage() {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
  session = sessionId;
  // 视口 782 = 750 canvas + 32 边距 ⇒ main.js 的 resize() 算出 fit=1.0，canvas 正好 750 CSS px
  await send('Emulation.setDeviceMetricsOverride', {
    width: 782, height: 1520, deviceScaleFactor: 1, mobile: false,
  }, session);
  // 注入 rAF 计数器：页面在后台时 rAF 会停，这个数就是"真在渲染"的证据
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: 'window.__fc = 0; (function loop(){ window.__fc = (window.__fc||0) + 1; requestAnimationFrame(loop); })();',
  }, session);
}

// ---------- 场景 ----------
const SCENE_100 = `${BASE}?terrain=7&dev=1&sim=90&freeze=1`;

async function do100(name) {
  console.log(`[scene] ${name}`);
  await openScene(SCENE_100);
  await sleep(400);
  const box = await canvasBox();
  if (!box) throw new Error('没找到 canvas');
  console.log(`  [canvas] ${box.w}x${box.h} CSS (backing ${box.px}px) @ ${box.x},${box.y}`);
  if (box.w !== 750) console.log(`  [warn] canvas CSS 宽 ${box.w} ≠ 750（缩放带来的轻微不精确，不影响对比）`);
  await ensureAnimating(name);
  return shot(name, { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 });
}

async function doCloseup(name) {
  console.log(`[scene] ${name}`);
  await openScene(SCENE_100);
  await sleep(400);
  const box = await canvasBox();
  await ensureAnimating(name);
  // 取我軍前幾排（設計坐標 y≈560..1010）並放大 2×，用來看遠排/近排士兵的大小差 + 腳底貼地
  const clipY = box.y + Math.round(560 * box.h / 1334);
  const clipH = Math.round(450 * box.h / 1334);
  return shot(name, { x: box.x, y: clipY, width: box.w, height: clipH, scale: 2 });
}

async function doGenerals(name) {
  console.log(`[scene] ${name}`);
  await openScene(SCENE_100);
  await sleep(400);
  const box = await canvasBox();
  const gens = await evaluate(`(() => {
    const w = window.__sanguo.state.world;
    return w.units.filter(u => u.isGeneral).map(u => ({ side: u.side, x: u.x, y: u.y, alive: u.alive, name: u.name || u.kind || '' }));
  })()`);
  console.log('  [generals]', JSON.stringify(gens));
  // 镜头硬切到我方主将所在行（freeze 模式下 frame() 不覆盖 state.camX）
  const target = gens.find((g) => g.side === 'A') || gens[0];
  await evaluate(`window.__sanguo.state.camX = ${target.x}; window.__sanguo.state.camX`);
  await sleep(500);
  const now = await evaluate('window.__sanguo.state.camX');
  console.log(`  [camera] camX = ${now}（目标行 ${target.x}）`);
  await ensureAnimating(name);
  return shot(name, { x: box.x, y: box.y, width: box.w, height: box.h, scale: 1 });
}

// ---------- main ----------
const how = await launchIfNeeded();
const ver = await waitPort();
console.log(`[browser] ${how} · ${ver.Browser} · port ${PORT}`);
await connect(ver.webSocketDebuggerUrl);
await newPage();
const out = [];
if (mode === 'before') {
  out.push(await do100('before_100v100'));
} else {
  out.push(await do100('after_100v100'));
  out.push(await doCloseup('after_soldiers_closeup'));
  out.push(await doGenerals('after_generals'));
}
console.log('--- result ---');
console.log(JSON.stringify(out, null, 2));
process.exit(0);
