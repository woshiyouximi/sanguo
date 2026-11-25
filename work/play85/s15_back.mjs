import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.mouse(20, 300); await sleep(2200);
log('href', await c.eval('location.href'));
const D = `(()=>{const q=s=>document.querySelector(s); const g=id=>{const e=q('#'+id); return e?{t:(e.innerText||'').slice(0,300),hidden:!!e.hidden,disp:getComputedStyle(e).display,rect:[e.getBoundingClientRect().x|0,e.getBoundingClientRect().y|0,e.getBoundingClientRect().width|0,e.getBoundingClientRect().height|0]}:null};
 let store=null; try{store=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null')}catch(e){}
 let camp=null; try{camp=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'null')}catch(e){}
 return {href:location.href, ym:g('ym'), gold:g('gold'), notice:g('notice'), rec:g('rec'), badge:g('slotBadge'), btnSave:g('btnSave'),
  saveSheet:g('saveSheet'), pickSheet:g('pickSheet'), marchSheet:g('marchSheet'), confirmSheet:g('confirmSheet'), sur:g('surrenderSheet'),
  confirmTitle:q('#confirmSheet')?(q('#confirmSheet').innerText||'').slice(0,400):null,
  sur:g('surrenderSheet'), surText:q('#surrenderSheet')&&!q('#surrenderSheet').hidden?(q('#surrenderSheet').innerText||'').slice(0,400):null,
  store:store?{last:store.last,slots:store.slots.map((s,i)=>s?{i:i+1,name:s.name,time:s.time,gold:s.gold,owned:s.ownedCount,ts:s.ts}:null)}:null,
  camp:camp?{king:camp.king,month:camp.month,gold:camp.gold,owned:camp.owned,armies:camp.armies,scene:camp.scene}:null,
  logs:[...document.querySelectorAll('#logrows .logrow')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,160)),
  cities:[...document.querySelectorAll('.city')].slice(0,6).map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,60))};})()`;
const d = await c.eval(D);
log('campaign', d);
await c.shot('s15_back_map');
await c.fullShot('s15_back_full');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
await c.save('s15_back', { d, errs });
c.close();
