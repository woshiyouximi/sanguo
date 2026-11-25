import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(900);
await c.mouse(146, 278); await sleep(500);
const rr = await c.eval(`(()=>{const e=[...document.querySelectorAll('.city')].find(x=>x.dataset.name==='平原'); if(!e) return null; const b=e.getBoundingClientRect(); return [b.x+b.width/2,b.y+b.height/2];})()`);
await c.mouse(rr[0], rr[1]); await sleep(600);
log('acts', await c.eval(`(()=>[...document.querySelectorAll('#actions .btn')].map(b=>({act:b.dataset.act, txt:b.innerText.replace(/\\s+/g,' ').trim()})))()`));
const cr = await c.eval(`(()=>{const b=[...document.querySelectorAll('#actions .btn')].find(x=>x.dataset.act==='city'); const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
await c.mouse(cr[0], cr[1]); await sleep(1300);
log('href', await c.eval('location.href'));
log('city', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};return {gold:t('#vGold'),pop:t('#vPop'),prep:t('#vPrep'),lock:t('#vLock'),hint:t('#cmdHint')};})()`));
log('btns', await c.eval(`(()=>[...document.querySelectorAll('#grid .cmd')].map(b=>({cmd:b.dataset.cmd, dis:b.disabled, txt:b.innerText.replace(/\\s+/g,' ').trim().slice(0,30)})))()`));
await c.shot('s4i_plain_citypage');
const sr = await c.eval(`(()=>{const b=[...document.querySelectorAll('#grid .cmd')].find(x=>(x.dataset.cmd||'').includes('搜索')); if(!b) return null; const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2,b.disabled];})()`);
log('searchBtn', sr);
if (sr && !sr[2]) {
  await c.mouse(sr[0], sr[1]); await sleep(1300);
  log('after_search', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
   return {gold:t('#vGold'),lock:t('#vLock'),sheet:document.querySelector('#sheet')?{cls:document.querySelector('#sheet').className,title:t('#sheetTitle'),body:((document.querySelector('#sheetBody')||{}).innerText||'').replace(/\\s+/g,' ').slice(0,300)}:null,
   log:[...document.querySelectorAll('#log .row')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).slice(0,4)};})()`));
  await c.shot('s4j_plain_search');
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 6)));
await c.save('s4i_plain_search', { errs });
c.close();
