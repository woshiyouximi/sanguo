import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const D = `(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const sheets=[...document.querySelectorAll('.sheet')].filter(e=>e.className.includes('on')).map(e=>({id:e.id,title:(e.querySelector('h3')||{}).innerText||'',body:(e.querySelector('.bd')||{}).innerText||''}));
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'),
  sheets:sheets.map(s=>({id:s.id,title:s.title.replace(/\\s+/g,' ').slice(0,60),body:s.body.replace(/\\s+/g,' ').slice(0,300)}))};})()`;
await c.goto(BASE + 'campaign.html'); await sleep(1000);
log('before', await c.eval(D));
await c.shot('s5a_before_advance');
const a = await c.eval(`(()=>{const b=document.querySelector('#advance')||[...document.querySelectorAll('[data-act=advance]')][0]; if(!b) return null; const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
log('advanceBtn', a);
await c.mouse(a[0], a[1]);
for (const w of [800, 1500, 2500]) { await sleep(w); log('t+' + w, await c.eval(D)); }
await c.shot('s5b_after_advance');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s5_advance', { state: await c.eval(D), errs });
c.close();
