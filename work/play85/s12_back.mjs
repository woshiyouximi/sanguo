import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
log('href0', await c.eval('location.href'));
await c.mouse(20, 300); await sleep(1500);
log('href1', await c.eval('location.href'));
await sleep(1200);
log('campaign', await c.eval(`(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const sur=document.querySelector('#surrenderSheet');
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), rec:t('#rec'), btnSave:t('#btnSave'), badge:t('#slotBadge'), notice:t('#notice'),
  surHidden:sur?sur.hidden:null, surTitle:t('#surTitle'), surSub:t('#surSub'), surBody:((document.querySelector('#surrenderSheet')||{}).innerText||'').replace(/\\s+/g,' ').slice(0,500),
  logrows:[...document.querySelectorAll('#logrows .logrow')].map(e=>e.innerText.replace(/\\s+/g,' ').trim()).slice(0,6)};})()`));
await c.shot('s12a_back_campaign');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s12_back', { errs });
c.close();
