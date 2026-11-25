import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
log('href', await c.eval('location.href'));
log('hit', await c.eval(`(()=>{const e=document.elementFromPoint(375,409); const b=document.querySelector('#徵兵'); const r=b?b.getBoundingClientRect():null; return {atPoint:e?{tag:e.tagName,id:e.id,cls:(e.className||'').toString().slice(0,40)}:null, btn:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null, lock:document.querySelector('#vLock')?document.querySelector('#vLock').innerText:null, hint:document.querySelector('#cmdHint')?document.querySelector('#cmdHint').innerText:null};})()`));
// 真点
await c.mouse(375, 409); await sleep(700);
log('after_real_click', await c.eval(`(()=>{const vis=[...document.querySelectorAll('.sheet,#sheet,#sheets,.scrim,#scrim,.modal')].map(e=>({id:e.id,cls:e.className,hidden:e.hidden,disp:getComputedStyle(e).display,rect:(()=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})()})); return {sheets:vis, hint:document.querySelector('#cmdHint')?document.querySelector('#cmdHint').innerText:null, log:[...document.querySelectorAll('#log .row')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).slice(0,3)};})()`));
await c.shot('s4c_after_real_click');
// DOM click 对照
log('dom_click', await c.eval(`(()=>{const b=document.querySelector('#徵兵'); if(!b) return 'no btn'; b.click(); return 'clicked';})()`));
await sleep(700);
log('after_dom_click', await c.eval(`(()=>{const vis=[...document.querySelectorAll('.sheet,#sheet,#sheets,.scrim,#scrim,.modal')].map(e=>({id:e.id,cls:e.className,hidden:e.hidden,disp:getComputedStyle(e).display,rect:(()=>{const r=e.getBoundingClientRect();return [Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)];})()})); return {sheets:vis, hint:document.querySelector('#cmdHint')?document.querySelector('#cmdHint').innerText:null};})()`));
await c.shot('s4d_after_dom_click');
c.close();
