import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
// 乐陵卡片
const card = await c.eval(`(()=>{const e=document.querySelector('[data-march="樂陵"]'); if(!e) return null; const q=e.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
log('card', card);
await c.mouse(card[0], card[1]); await sleep(500);
log('foot', await c.eval(`(()=>({sub:(document.querySelector('#marchSub')||{}).innerText||'', foot:(document.querySelector('#marchFoot')||{}).innerText||'', cards:[...document.querySelectorAll('#marchTargets [data-march]')].map(e=>({n:e.dataset.march, cls:e.className}))}))()`));
await c.shot('s9b_march_picked');
const go = await c.eval(`(()=>{const b=document.querySelector('#marchFoot [data-act=march]')||document.querySelector('#marchFoot button'); if(!b) return null; const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2,b.innerText.replace(/\\s+/g,' ').trim()];})()`);
log('goBtn', go);
await c.mouse(go[0], go[1]); await sleep(1200);
log('after_dispatch', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const raw=localStorage.getItem('sanguo_campaign_v1'); let armies=null; try{armies=JSON.parse(raw).armies;}catch(e){}
 return {ym:t('#ym'),gold:t('#gold'),notice:t('#notice'),sheet:document.querySelector('#marchSheet')?document.querySelector('#marchSheet').hidden:null, armies};})()`));
await c.shot('s9c_dispatched');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s9_dispatch', { errs });
c.close();
