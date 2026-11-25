import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
log('state', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const raw=localStorage.getItem('sanguo_campaign_v1'); let o=null; try{o=JSON.parse(raw);}catch(e){}
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), notice:t('#notice'), marchSheet:document.querySelector('#marchSheet')?document.querySelector('#marchSheet').hidden:null,
  legacy:{month:o&&o.month, gold:o&&o.gold, armies:o&&o.armies, log:(o&&o.log||[]).slice(-4)}, dbg:t('#marchdbg')};})()`));
await c.shot('s9d_after_dispatch_state');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s9d_state', { errs });
c.close();
