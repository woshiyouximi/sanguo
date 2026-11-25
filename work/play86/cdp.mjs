// CDP driver for round-5 regression drill (read-only against product; only writes work/play86)
import { spawn } from 'node:child_process';
import fs from 'node:fs';

export const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
export const PROF = 'F:\\sanguo\\work\\.edgeprof_p86';
export const PORT = 9456;
export const BASE = 'http://127.0.0.1:5173/web/';
export const SHOTS = 'F:\\sanguo\\work\\play86\\shots';
export const STATE = 'F:\\sanguo\\work\\play86\\state';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function jget(url, method = 'GET') {
  const r = await fetch(url, { method });
  const t = await r.text();
  try { return JSON.parse(t); } catch { return t; }
}

export async function ensureEdge() {
  try {
    const v = await jget(`http://127.0.0.1:${PORT}/json/version`);
    if (v && v.webSocketDebuggerUrl) return v;
  } catch {}
  const args = [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROF}`,
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-features=Translate,MediaRouter,OptimizationHints',
    '--force-device-scale-factor=1',
    '--autoplay-policy=no-user-gesture-required',
    '--mute-audio',
    '--window-size=782,1500',
    'about:blank',
  ];
  spawn(EDGE, args, { detached: true, stdio: 'ignore' }).unref();
  for (let i = 0; i < 200; i++) {
    await sleep(250);
    try {
      const v = await jget(`http://127.0.0.1:${PORT}/json/version`);
      if (v && v.webSocketDebuggerUrl) return v;
    } catch {}
  }
  throw new Error('Edge CDP did not come up');
}

const ERRKEY = '__dsh_errs86';

export const COLLECTOR = `(function(){
try{
  if(window.__pushErr) return;
  var KEY='${ERRKEY}';
  var arr=[];
  try{ arr=JSON.parse(sessionStorage.getItem(KEY)||'[]'); }catch(e){ arr=[]; }
  if(!Array.isArray(arr)) arr=[];
  window.__errs=arr;
  window.__pushErr=function(o){
    o.t=new Date().toISOString();
    o.page=location.pathname+location.search;
    arr.push(o);
    try{ sessionStorage.setItem(KEY, JSON.stringify(arr.slice(-800))); }catch(e){}
  };
  function s(x){ try{ if(typeof x==='string') return x; if(x&&x.message) return String(x.message); return JSON.stringify(x); }catch(e){ return String(x); } }
  window.addEventListener('error', function(ev){
    var tg=ev.target;
    if(tg && tg!==window && tg.tagName){
      window.__pushErr({kind:'resource', msg:'<'+tg.tagName.toLowerCase()+'> '+(tg.currentSrc||tg.src||tg.href||''), tag:tg.tagName,
        cls:String(tg.className||''), stack:''});
      return;
    }
    window.__pushErr({kind:'error', msg:String(ev.message), at:(ev.filename||'')+':'+ev.lineno+':'+ev.colno,
      stack: ev.error&&ev.error.stack?String(ev.error.stack).slice(0,2000):''});
  }, true);
  window.addEventListener('unhandledrejection', function(ev){
    var r=ev.reason; window.__pushErr({kind:'unhandledrejection', msg:s(r).slice(0,800), stack:r&&r.stack?String(r.stack).slice(0,2000):''});
  });
  ['error','warn'].forEach(function(k){
    var orig=console[k]?console[k].bind(console):function(){};
    console[k]=function(){ var a=[].slice.call(arguments).map(s).join(' '); if(k==='warn'){ if(!/deprecat|Deprecat/.test(a)) window.__pushErr({kind:'console.'+k, msg:a.slice(0,900)}); } else window.__pushErr({kind:'console.'+k, msg:a.slice(0,900)}); return orig.apply(console, arguments); };
  });
}catch(e){}
})();`;

export class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pend = new Map(); this.ev = []; this.sid = null;
    ws.onmessage = (m) => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pend.has(msg.id)) {
        const { res, rej } = this.pend.get(msg.id); this.pend.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message + ' ' + JSON.stringify(msg.error.data || '')));
        else res(msg.result);
      } else if (msg.method) {
        this.ev.push(msg);
      }
    };
  }
  static async connect() {
    const v = await ensureEdge();
    const ws = new WebSocket(v.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws error')); });
    const c = new CDP(ws);
    c.v = v;
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
    let page = pages.find((p) => p.url.includes('127.0.0.1:5173')) || pages[pages.length - 1];
    if (!page) {
      const nt = await this.send('Target.createTarget', { url: 'about:blank' });
      page = { targetId: nt.targetId, url: 'about:blank' };
    }
    const a = await this.send('Target.attachToTarget', { targetId: page.targetId, flatten: true });
    this.sid = a.sessionId;
    this.targetId = page.targetId;
    await this.send('Page.enable', {}, this.sid);
    await this.send('Runtime.enable', {}, this.sid);
    await this.send('Log.enable', {}, this.sid);
    await this.send('Network.enable', {}, this.sid).catch(() => {});
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
  async inject() {
    try { await this.send('Page.addScriptToEvaluateOnNewDocument', { source: COLLECTOR }, this.sid); } catch (e) { this.injectErr = String(e.message); }
  }
  async goto(url) {
    await this.inject();
    const r = await this.send('Page.navigate', { url }, this.sid);
    await this.waitLoad();
    await this.eval(COLLECTOR).catch(() => {});
    return r;
  }
  async waitLoad(timeout = 30000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const st = await this.eval('document.readyState + "|" + location.href').catch(() => '');
      if (typeof st === 'string' && st.startsWith('complete')) { await sleep(350); return true; }
      await sleep(150);
    }
    return false;
  }
  async rect(sel) {
    return this.eval(`(()=>{const e=document.querySelector(${JSON.stringify(sel)}); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height,text:(e.innerText||'').slice(0,200)};})()`);
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
    } else if (type === 'down') {
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mousePressed' }, this.sid);
    } else if (type === 'up') {
      await this.send('Input.dispatchMouseEvent', { ...base, type: 'mouseReleased' }, this.sid);
    }
  }
  async clickSel(sel, dy = 0) {
    const r = await this.rect(sel);
    if (!r) return { ok: false, why: 'not found: ' + sel };
    await this.mouse(r.x + r.w / 2, r.y + r.h / 2 + dy);
    return { ok: true, rect: r };
  }
  /** click by design coords inside #stage (750x1334) */
  async design(x, y) {
    const r = await this.rect('#stage');
    if (!r) throw new Error('no #stage');
    await this.mouse(r.x + x * (r.w / 750), r.y + y * (r.h / 1334));
  }
  /** click by design coords, no #stage scaling (for pages whose root is 750 wide) */
  async clickAt(x, y) { await this.mouse(x, y); }
  async shot(name) {
    const r = await this.rect('#stage');
    let clip;
    if (r && r.w > 2) {
      clip = { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.w, height: r.h, scale: 1 };
    } else {
      clip = { x: 0, y: 0, width: 750, height: 1334, scale: 1 };
    }
    const s = await this.send('Page.captureScreenshot', { format: 'png', clip }, this.sid);
    const p = `${SHOTS}\\${name}.png`;
    fs.writeFileSync(p, Buffer.from(s.data, 'base64'));
    return { path: p, w: Math.round(clip.width), h: Math.round(clip.height) };
  }
  /** full 750x1334 viewport shot (battle page is letterboxed inside #stage) */
  async shotFull(name) {
    const clip = { x: 0, y: 0, width: 750, height: 1334, scale: 1 };
    const s = await this.send('Page.captureScreenshot', { format: 'png', clip }, this.sid);
    const p = `${SHOTS}\\${name}.png`;
    fs.writeFileSync(p, Buffer.from(s.data, 'base64'));
    return { path: p, w: 750, h: 1334 };
  }
  async errs(from = 0) {
    const raw = await this.eval(`sessionStorage.getItem('${ERRKEY}')||'[]'`);
    let arr = [];
    try { arr = JSON.parse(raw); } catch {}
    return arr.slice(from);
  }
  async errCount() {
    const raw = await this.eval(`sessionStorage.getItem('${ERRKEY}')||'[]'`);
    try { return JSON.parse(raw).length; } catch { return 0; }
  }
  async errReset() { await this.eval(`sessionStorage.removeItem('${ERRKEY}'); window.__errs && (window.__errs.length=0);`); }
  async ls() {
    return this.eval(`(()=>{const o={}; for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i); const v=localStorage.getItem(k)||''; o[k]={len:v.length, head:v.slice(0,160)};} return o;})()`);
  }
  async save(name, obj) {
    const p = `${STATE}\\${name}.json`;
    fs.writeFileSync(p, JSON.stringify(obj, null, 1), 'utf8');
    return p;
  }
  close() { try { this.ws.close(); } catch {} }
}

export async function boot(opts = {}) {
  const c = await CDP.connect();
  await c.attach();
  const w = opts.w || 750, h = opts.h || 1334;
  await c.viewport(w, h);
  await c.inject();
  await c.eval(COLLECTOR).catch(() => {});
  c.startErr = await c.errCount();
  return c;
}
