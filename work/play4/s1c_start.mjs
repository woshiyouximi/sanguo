import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();

// choose 張角 then start
const picked = await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>x.dataset.king==='\\u5f35\\u89d2'); if(!e) return null; e.click(); return (document.getElementById('pickWarn').innerText||'').trim();})()`);
await sleep(500);
const shotSel = await c.shot('s1c_picked_changchiao');
await c.clickSel('#btnPickStart');
await sleep(2500);

const after = await c.eval(`(()=>{
  const q=(s)=>document.querySelector(s); const t=(s)=>{const e=q(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400):null;};
  const my=[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>e.dataset.name);
  return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'), king:t('#kingName'),
    pickHidden: q('#pickSheet').hidden, saveHidden: q('#saveSheet').hidden,
    owned: my, cityCount: document.querySelectorAll('.city').length,
    acts: [...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40),dis:e.disabled})),
    logrows: t('#logrows')};
})()`);
const shot = await c.shot('s1c_newgame_done');

const sl = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const s=(o.slots||[])[0]||{}; const lg=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 return {last:o.last, slot0:{ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,gold:s.gold,owned:s.owned,log:s.log,cities:Object.keys(s.cities||{}).length}, legacy:{ts:lg.ts,month:lg.month,scenario:lg.scenario,king:lg.king,gold:lg.gold,owned:lg.owned}};})()`);
const ls = await c.ls();
const errs = await c.errs(c.startErr);
await c.save('s1c_newgame', { picked, after, sl, ls, shot, errs });
console.log(JSON.stringify({ picked, after, sl, shot, errs }, null, 1));
c.close();
