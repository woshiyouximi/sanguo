import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.enableNet();
await c.goto(BASE + 'campaign.html');
await sleep(1200);
const st = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const rows=[...document.querySelectorAll('#logrows .row, #log .row')].map(e=>e.innerText.replace(/\\s+/g,' ').trim());
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), king:t('#kingName'), notice:t('#notice'),
  slot:t('#slotBadge'), saveSheetHidden:document.querySelector('#saveSheet')?document.querySelector('#saveSheet').hidden:null,
  logCount:rows.length, log:rows.slice(0,14),
  cities:[...document.querySelectorAll('.city')].slice(0,10).map(e=>({name:e.dataset.name, txt:(e.innerText||'').replace(/\\s+/g,' ').trim()}))};})()`);
log('campaign', st);
const nav = await c.navLog();
log('navs', nav);
const ls = await c.ls();
log('lsKeys', Object.fromEntries(Object.entries(ls).map(([k, v]) => [k, v.len + ' ' + v.head.slice(0, 90)])));
const shot = await c.shot('s3i_campaign_after_defends');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 10)));
await c.save('s3i_campaign_after', { st, nav, errs, shot });
c.close();
