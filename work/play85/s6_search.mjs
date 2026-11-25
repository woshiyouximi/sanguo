import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(900);
await c.mouse(146, 278); await sleep(600);
log('logrows', await c.eval(`(()=>[...document.querySelectorAll('#logrows .logrow')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()))()`));
const rr = await c.eval(`(()=>{const e=[...document.querySelectorAll('.city')].find(x=>x.dataset.name==='平原'); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2];})()`);
await c.mouse(rr[0], rr[1]); await sleep(600);
const cr = await c.eval(`(()=>{const b=[...document.querySelectorAll('#actions .btn')].find(x=>x.dataset.act==='city'); const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
await c.mouse(cr[0], cr[1]); await sleep(1300);
log('city', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};return {gold:t('#vGold'),pop:t('#vPop'),prep:t('#vPrep'),lock:t('#vLock'),hint:t('#cmdHint')};})()`));
const sr = await c.eval(`(()=>{const b=[...document.querySelectorAll('#grid .cmd')].find(x=>(x.dataset.cmd||'').includes('搜索')); if(!b) return null; const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2,b.disabled];})()`);
log('searchBtn', sr);
await c.shot('s6a_plain_before_search');
if (sr && !sr[2]) {
  await c.mouse(sr[0], sr[1]); await sleep(1400);
  log('after_search', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
   return {gold:t('#vGold'),lock:t('#vLock'),hint:t('#cmdHint'),sheet:document.querySelector('#sheet')&&document.querySelector('#sheet').className.includes('on')?{title:t('#sheetTitle'),body:((document.querySelector('#sheetBody')||{}).innerText||'').replace(/\\s+/g,' ').slice(0,400),ft:((document.querySelector('#sheet')||{}).innerText||'').replace(/\\s+/g,' ').slice(-200)}:null,
   log:[...document.querySelectorAll('#log .row')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).slice(0,4)};})()`));
  await c.shot('s6b_plain_search');
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 6)));
await c.save('s6_search', { errs });
c.close();
