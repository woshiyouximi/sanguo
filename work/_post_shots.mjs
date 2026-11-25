// 戰後與成長五條修復的驗收截圖（R53/R62/R60/R61/R25）
// 用法：node work/_post_shots.mjs   （先 node game/web/serve.mjs 5173）
import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9336;
const BASE = 'http://127.0.0.1:5173/web/';
const OUT = 'F:\\sanguo\\work\\';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

mkdirSync(OUT, { recursive: true });
const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=F:\\sanguo\\work\\_edge_post',
  '--window-size=750,1334', '--mute-audio', 'about:blank',
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
  async goto(url) {
    await this.send('Page.navigate', { url });
    for (let i = 0; i < 80; i++) {
      await sleep(150);
      try { if (await this.eval('document.readyState') === 'complete') break; } catch {}
    }
    await sleep(1600);
  }
  async shot(name) {
    const r = await this.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    writeFileSync(OUT + name, Buffer.from(r.data, 'base64'));
    console.log('[shot]', name);
  }
  close() { try { this.ws.close(); } catch {} }
}

const Q = (o) => Object.entries(o).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
const URL_BASE = (extra) => BASE + 'index.html?auto=1&sim=300&freeze=1&' + Q(extra);

async function probe(page, tag) {
  const s = await page.eval(`(() => {
    const st = window.__sanguo && window.__sanguo.state;
    if (!st) return { err: 'no state' };
    const s = st.settlement || {};
    return {
      mode: s.mode, modeName: s.modeName, report: s.report,
      winner: s.winner, morale: s.morale, loyalty: s.loyalty, tire: s.tire, tireGain: s.tireGain,
      learned: s.learned, level: s.level, levelUp: s.levelUp, exp: s.exp, score: s.score,
      durationSec: s.durationSec, post: s.post, msg: st.message,
    };
  })()`);
  console.log('[' + tag + ']', JSON.stringify(s));
  return s;
}

try {
  await waitVersion();
  const page = await Page.open(BASE + 'index.html');
  await page.eval('localStorage.clear()');

  // 1) R53：忠誠 95 的敵將被俘但拒降（三條硬門），面板列出「招降 X（忠誠 87，拒）」
  await page.goto(URL_BASE({ end: 'recruit', bgen: '高順', bloyal: 95, bconstancy: 6, gen: '關羽', seed: 7 }));
  await probe(page, 'recruit');
  await page.shot('post_recruit_block.png');

  // 2) R62/R61：戰後雙方存活武將士氣 -20、疲勞 +15+秒/10，面板兩行都要有變化
  await page.goto(URL_BASE({ end: 'win', gen: '關羽', amorale: 60, atire: 40, bmorale: 70, seed: 7 }));
  await probe(page, 'morale');
  await page.shot('post_morale.png');

  // 3) R60：雙方兵盡、主將都活 → 平手（mode 3）+「雙方平手」戰報
  await page.goto(URL_BASE({ end: 'draw', gen: '關羽', seed: 7 }));
  await probe(page, 'draw');
  await page.shot('post_mode_draw.png');

  // 4) R25：5 級 1900 經驗開局，mode 2 擊退的戰功把經驗推過 1970 → 6 級，
  //    自動學會 SKILL 6→63 冰柱刺 + WISESKILL 6→16 強化士兵，面板與技能欄都要出現
  await page.goto(URL_BASE({ end: 'win', gen: '關羽', level: 5, exp: 1900, seed: 7 }));
  await probe(page, 'levelup');
  console.log('[levelup] skills:', await page.eval(`JSON.stringify((window.__sanguo.state.skills || []).map((k) => k.name))`));
  await page.shot('post_levelup_skill.png');

  page.close();
} finally {
  edge.kill();
}
