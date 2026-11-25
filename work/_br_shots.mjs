// R22 / R54 / 格挡的验收截图。
// 用法：node work/_br_shots.mjs      （先 node game/web/serve.mjs 5173）
// 产出：work/br_settle.png（结算面板分开列步/骑击杀）、work/br_capture_multi.png（一次抓 3 名将）、
//       work/br_blocks.png（音频 HUD 的 defense 计数来自 core.stats.blocks）
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9337;
const BASE = 'http://127.0.0.1:5173/';
const OUT = 'F:\\sanguo\\work\\';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_br',
  '--window-size=750,1500', '--mute-audio', 'about:blank',
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
  static async open(url, width, height) {
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
    await p.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
    });
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
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + ' ' + (r.exceptionDetails.exception?.description || ''));
    return r.result?.value;
  }
  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 100; i++) {
      await sleep(150);
      try { if (await this.eval('document.readyState') === 'complete') break; } catch {}
    }
    await sleep(1800);
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(OUT + name, Buffer.from(r.data, 'base64'));
    console.log('[shot]', name);
  }
  close() { try { this.ws.close(); } catch {} }
}

const HARNESS = (qs) => `${BASE}tests/r22r54.html?${qs}`;

try {
  await waitVersion();

  // 1) 结算面板：步兵击杀 / 骑兵击杀 各一行（B 方 30 级 → 骑兵上限 50）
  const p1 = await Page.open('about:blank', 750, 1470);
  await p1.goto(HARNESS('case=settle'));
  console.log('[settle] hud:\n' + await p1.eval(`document.getElementById('hud').textContent`));
  await p1.shot('br_settle.png');
  p1.close();

  // 2) R54：一次抓到 3 名副将（招降行会列 3 个人名 + 另有 N 人）
  const p2 = await Page.open('about:blank', 750, 1470);
  await p2.goto(HARNESS('case=capture'));
  console.log('[capture] hud:\n' + await p2.eval(`document.getElementById('hud').textContent`));
  await p2.shot('br_capture_multi.png');
  p2.close();

  // 3) 格挡：正式页面 + ?sfxdbg=1 的音频 HUD（左下角 defense×N），再叠一块证据面板
  const p3 = await Page.open('about:blank', 750, 1334);
  await p3.goto(`${BASE}web/index.html?auto=1&sim=1200&freeze=1&sfxdbg=1&seed=7`);
  const info = await p3.eval(`(() => {
    const st = window.__sanguo && window.__sanguo.state;
    if (!st || !st.world) return { err: 'no world' };
    const s = st.world.stats;
    const a = window.SG && window.SG.audio && window.SG.audio.state ? window.SG.audio.state() : { byName: {}, plays: 0 };
    const oldProxy = Math.max(0, s.attacksA - s.hitsA) + Math.max(0, s.attacksB - s.hitsB);
    const ev = document.createElement('div');
    ev.id = 'br-evidence';
    ev.style.cssText = 'position:fixed;left:6px;bottom:104px;z-index:10000;'
      + 'font:12px/1.45 ui-monospace,Consolas,monospace;color:#f4e9cf;'
      + 'background:rgba(0,0,0,.8);padding:6px 8px;border:1px solid #b98b3a;white-space:pre';
    ev.textContent = [
      'R22·R54 验收 ③ 格挡精确计数',
      'core.stats.blocks（兵对兵近战砍空） = ' + s.blocks,
      'audio HUD: defense ×' + (a.byName.defense || 0) + '（节流后播放次数 ≤ blocks）',
      '旧代理 attacks−hits = ' + oldProxy + '（含射空/主将闪避，本轮已弃用）',
      '命中 = ' + (s.hitsA + s.hitsB) + '  tick = ' + st.world.tick,
    ].join('\\n');
    document.body.appendChild(ev);
    return { blocks: s.blocks, defense: a.byName.defense || 0, oldProxy, hits: s.hitsA + s.hitsB, hud: (document.getElementById('sg-audio-dbg') || {}).textContent || '' };
  })()`);
  console.log('[blocks]', JSON.stringify(info));
  await sleep(500);
  await p3.shot('br_blocks.png');
  p3.close();
} finally {
  edge.kill();
}
