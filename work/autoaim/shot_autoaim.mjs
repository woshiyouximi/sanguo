// R139 验收截图：点技能格 → 立即施放（不再进瞄准态）。
// 只用真实前端路径：canvas 上的 pointerdown → hitTest('skill') → pickSkill → doCast → core.cast。
// 唯一的"作弊"是把主将氣力/技力灌满（原作一次技要整条气，不灌开局放不出来）。
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROF = 'F:\\sanguo\\work\\.edgeprof_autoaim';
const PORT = 9491;
const SRV_PORT = 5191;
const SHOTS = 'F:\\sanguo\\work\\autoaim';
const BASE = `http://127.0.0.1:${SRV_PORT}/web/`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(...a);

async function jget(url, method = 'GET') {
  const r = await fetch(url, { method });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

async function ensureServer() {
  try { const r = await jget(`http://127.0.0.1:${SRV_PORT}/web/`); if (String(r).length > 0) return 'up'; } catch {}
  const p = spawn('node', ['web/serve.mjs', String(SRV_PORT)], { cwd: 'F:\\sanguo\\game', detached: true, stdio: 'ignore' });
  p.unref();
  for (let i = 0; i < 40; i++) {
    await sleep(200);
    try { const r = await jget(`http://127.0.0.1:${SRV_PORT}/web/`); if (String(r).length > 0) return 'spawned'; } catch {}
  }
  throw new Error('static server did not come up');
}

async function ensureEdge() {
  try {
    const v = await jget(`http://127.0.0.1:${PORT}/json/version`);
    if (v && v.webSocketDebuggerUrl) return v;
  } catch {}
  spawn(EDGE, [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROF}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--mute-audio',
    '--force-device-scale-factor=1',
    '--window-size=760,1400',
    'about:blank',
  ], { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 120; i++) {
    await sleep(250);
    try {
      const v = await jget(`http://127.0.0.1:${PORT}/json/version`);
      if (v && v.webSocketDebuggerUrl) return v;
    } catch {}
  }
  throw new Error('Edge CDP did not come up');
}

class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pend = new Map(); }
  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = (e) => rej(new Error('ws error')); });
    const c = new CDP(ws);
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id && c.pend.has(m.id)) {
        const { res, rej } = c.pend.get(m.id);
        c.pend.delete(m.id);
        m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result);
      }
    };
    return c;
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pend.set(id, { res, rej });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }
  async attach() {
    const t = await this.send('Target.getTargets');
    const pages = (t.targetInfos || []).filter((x) => x.type === 'page');
    let page = pages.find((p) => p.url.includes(`127.0.0.1:${SRV_PORT}`)) || pages[pages.length - 1];
    if (!page) {
      const nt = await this.send('Target.createTarget', { url: 'about:blank' });
      page = { targetId: nt.targetId };
    }
    const a = await this.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    this.sid = a.sessionId;
    await this.send('Page.enable', {}, this.sid);
    await this.send('Runtime.enable', {}, this.sid);
    return this;
  }
  async eval(expr, awaitPromise = false) {
    const r = await this.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise }, this.sid);
    if (r.exceptionDetails) {
      const d = r.exceptionDetails;
      return { __exception: (d.exception && (d.exception.description || d.exception.value)) || d.text };
    }
    return r.result.value;
  }
  async viewport(w, h) {
    await this.send('Emulation.setDeviceMetricsOverride', { width: w, height: h, deviceScaleFactor: 1, mobile: false }, this.sid);
  }
  async goto(url) {
    await this.send('Page.navigate', { url }, this.sid);
    const t0 = Date.now();
    while (Date.now() - t0 < 30000) {
      const st = await this.eval('document.readyState').catch(() => '');
      if (st === 'complete') { await sleep(300); return; }
      await sleep(120);
    }
  }
  async mouse(x, y, type = 'click') {
    const base = { x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, buttons: 1 };
    if (type === 'click') {
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved', buttons: 0 }, this.sid);
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' }, this.sid);
      await sleep(40);
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' }, this.sid);
    } else if (type === 'move') {
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mouseMoved' }, this.sid);
    }
  }
  async shot(name, clip) {
    const s = await this.send('Page.captureScreenshot', { format: 'png', ...(clip ? { clip: { ...clip, scale: 1 } } : {}) }, this.sid);
    const p = `${SHOTS}\\${name}.png`;
    fs.writeFileSync(p, Buffer.from(s.data, 'base64'));
    return p;
  }
  close() { try { this.ws.close(); } catch {} }
}

/** design(750x1334) → 画布 CSS 像素 */
const toCss = `(function(dx, dy){
  const c = document.querySelector('#stage');
  const r = c.getBoundingClientRect();
  return { x: r.left + (dx / 750) * r.width, y: r.top + (dy / 1334) * r.height, rect: { x: r.left, y: r.top, w: r.width, h: r.height } };
})`;

async function main() {
  log('[1/6] server:', await ensureServer());
  await ensureEdge();
  const targets = await jget(`http://127.0.0.1:${PORT}/json/list`);
  const page = (Array.isArray(targets) ? targets : []).find((t) => t.type === 'page');
  const c = await CDP.connect(page.webSocketDebuggerUrl);
  await c.attach();
  await c.viewport(750, 1334);

  log('[2/6] goto', BASE);
  await c.goto(`${BASE}?dev=1&seed=777`);
  let booted = null;
  for (let i = 0; i < 100; i++) {
    booted = await c.eval('!!(window.__sanguo && window.__sanguo.booted)');
    if (booted === true) break;
    await sleep(200);
  }
  log('    booted =', booted, '| mode =', await c.eval('window.__sanguo.state.mode'));

  // 开战（走真实 startBattle：建局 → hitTest('start') 也是这条路）
  const started = await c.eval(`(function(){ try { window.__sanguo.startBattle(); return window.__sanguo.state.mode; } catch(e){ return 'ERR:'+e.message; } })()`);
  log('[3/6] mode after startBattle =', started);
  await sleep(1500);

  // 灌满氣力/技力（原作一次技要整条气；这是验收脚本唯一的作弊点）
  const arm = await c.eval(`(function(){
    const s = window.__sanguo.state, g = s.world.sides.A.general;
    g.mp = g.mpMax; g.qi = 120000;
    return { mp: g.mp, qi: g.qi, tick: s.world.tick, bAlive: s.world.sides.B.aliveCount };
  })()`);
  log('    armed =', JSON.stringify(arm));

  // 先点战场：确认只有提示、不再进瞄准态
  const fieldPt = await c.eval(`${toCss}(375, 500)`);
  await c.mouse(fieldPt.x, fieldPt.y);
  await sleep(250);
  const hint = await c.eval('window.__sanguo.state.message');
  const aimState = await c.eval('JSON.stringify({ sel: window.__sanguo.state.selectedSkill, aim: window.__sanguo.state.aim })');
  log('[4/6] 点战场 → message =', JSON.stringify(hint), '| aim state =', aimState);
  await c.shot('01_field_hint', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });

  // 等两军接战（tick 到 110 左右），让技能有东西可打
  for (let i = 0; i < 120; i++) {
    const t = await c.eval('window.__sanguo.state.world.tick');
    if (typeof t === 'number' && t >= 110) break;
    await sleep(200);
  }
  await c.eval('(function(){ const g = window.__sanguo.state.world.sides.A.general; g.mp = g.mpMax; g.qi = 120000; return 1; })()');

  // 技能格 1（index 1 = 半月斬 seq50）与 index 3（神鬼亂舞 104）的位置
  const slot = await c.eval(`(async function(){
    const L = await import('/dist/view/layout.js');
    const r1 = L.skillSlotRect(1), r3 = L.skillSlotRect(3);
    return { r1, r3, skills: window.__sanguo.state.skills.map(s => ({ seq: s.seq, name: s.name })) };
  })()`, true);
  log('    slots =', JSON.stringify(slot.skills));
  const s3 = await c.eval(`${toCss}(${slot.r3.x + slot.r3.w / 2}, ${slot.r3.y + slot.r3.h / 2})`);
  const s1 = await c.eval(`${toCss}(${slot.r1.x + slot.r1.w / 2}, ${slot.r1.y + slot.r1.h / 2})`);

  // 点技能格 → 立即 cast（没有第二步"点战场"）
  const before = await c.eval(`JSON.stringify({ k: window.__sanguo.state.world.stats.spellKillsA, d: window.__sanguo.state.world.stats.spellDamageA, s: window.__sanguo.state.world.sessions.length })`);
  await c.mouse(s3.x, s3.y);
  await sleep(120);
  const afterClick = await c.eval(`JSON.stringify({
    msg: window.__sanguo.state.message,
    sel: window.__sanguo.state.selectedSkill, aim: window.__sanguo.state.aim,
    sessions: window.__sanguo.state.world.sessions.length,
    fx: window.__sanguo.state.world.fx.length,
    marks: window.__sanguo.state.world.skillMarks.length,
    k: window.__sanguo.state.world.stats.spellKillsA,
    d: window.__sanguo.state.world.stats.spellDamageA
  })`);
  log('[5/6] 点技能格3 →', afterClick);
  log('    before =', before);
  await c.shot('02_skill_click_cast', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });
  // 等内核对账出第一条战果标记（多帧技第 6~7 帧才生效），这时提示栏会被 battleView.battleMessage()
  // 改写成真实结果 —— 这才是"点一下就放出效果"的证据帧
  for (let i = 0; i < 40; i++) {
    const n = await c.eval('window.__sanguo.state.world.skillMarks.length');
    if (typeof n === 'number' && n > 0) break;
    await sleep(50);
  }
  await sleep(80);
  await c.shot('03_cast_hit', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });
  await sleep(1600);
  const settleState = await c.eval(`JSON.stringify({
    msg: window.__sanguo.state.message,
    k: window.__sanguo.state.world.stats.spellKillsA,
    d: window.__sanguo.state.world.stats.spellDamageA,
    marks: window.__sanguo.state.world.skillMarks.slice(-3)
  })`);
  log('[6/6] 1.6s 后 →', settleState);
  await c.shot('04_after', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });

  // 命療術（纯己方技）：先把主将血砍半，再点技能格 0 —— 自动落在自己身上
  await c.eval(`(function(){
    const s = window.__sanguo.state, g = s.world.sides.A.general;
    g.hp = Math.floor(g.maxHp * 0.5); g.mp = g.mpMax; g.qi = 120000;
    return g.hp;
  })()`);
  const slot0 = await c.eval(`(async function(){
    const L = await import('/dist/view/layout.js');
    return L.skillSlotRect(0);
  })()`, true);
  const s0 = await c.eval(`${toCss}(${slot0.x + slot0.w / 2}, ${slot0.y + slot0.h / 2})`);
  await c.mouse(s0.x, s0.y);
  await sleep(180);
  const healState = await c.eval(`JSON.stringify({
    msg: window.__sanguo.state.message,
    sel: window.__sanguo.state.selectedSkill, aim: window.__sanguo.state.aim,
    hp: window.__sanguo.state.world.sides.A.general.hp,
    healed: window.__sanguo.state.world.stats.spellHealedA
  })`);
  log('    点技能格0（命療術）→', healState);
  await c.shot('05_heal_click', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });

  // 再点一次技能格1（半月斬），证明连点两下都是"一格即放"
  await c.eval('(function(){ const g = window.__sanguo.state.world.sides.A.general; g.mp = g.mpMax; g.qi = 120000; return 1; })()');
  await c.mouse(s1.x, s1.y);
  await sleep(200);
  const second = await c.eval('JSON.stringify({ msg: window.__sanguo.state.message, sel: window.__sanguo.state.selectedSkill, aim: window.__sanguo.state.aim })');
  log('    第二次点技能格1 →', second);
  await c.shot('06_second_cast', { x: fieldPt.rect.x, y: fieldPt.rect.y, width: fieldPt.rect.w, height: fieldPt.rect.h });

  c.close();
  log('done. shots in', SHOTS);
}

main().catch((e) => { console.error('FAIL', e); process.exit(1); });
