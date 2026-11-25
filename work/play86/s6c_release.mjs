import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.shot('07l_空俘虏面板挡死');
// 点「剩餘全部釋放」
const b = await c.eval(`(()=>{const e=document.getElementById('surAllRelease'); const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:e.disabled};})()`);
log('rel btn', JSON.stringify(b));
await c.mouse(b.x, b.y); await sleep(1200);
log('after release', JSON.stringify(await c.eval(`(()=>{const ss=document.getElementById('surrenderSheet'); const cm=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); return {surHidden:ss.hidden, scrim:document.getElementById('scrim').hidden, captured:(cm.captured||[]).length, notice:(document.getElementById('notice')||{}).innerText, msg:(document.getElementById('surMsg')||{}).innerText};})()`)));
log('errs', JSON.stringify((await c.errs(0)).filter(e=>e.kind==='error').map(e=>e.msg.slice(0,90)).slice(-3)));
await c.shot('07m_释放后');
await c.close();
