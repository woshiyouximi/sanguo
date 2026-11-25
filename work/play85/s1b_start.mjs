import { boot, sleep } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));

// 现在处于 scenario 步（黃巾之亂 已选中）
let pk = await c.eval(`(()=>{const e=document.getElementById('pickSheet'); return {hidden:e.hidden,ttl:document.getElementById('pickTtl').innerText,btn:document.getElementById('btnPickStart').innerText, n:document.querySelectorAll('#pickCards .scard').length};})()`);
log('before', pk);
await c.clickSel('#btnPickStart'); await sleep(700);
const kings = await c.eval(`(()=>{const cards=[...document.querySelectorAll('#pickCards .scard')].map(x=>({king:x.dataset.king||null,cls:x.className,off:x.dataset.off||null,txt:(x.innerText||'').replace(/\\s+/g,' ').trim().slice(0,70)}));
 return {ttl:document.getElementById('pickTtl').innerText,sub:document.getElementById('pickSub').innerText,warn:document.getElementById('pickWarn').innerText,btn:document.getElementById('btnPickStart').innerText,dis:document.getElementById('btnPickStart').disabled,n:cards.length,cards};})()`);
log('kings', kings);
const shotKings = await c.shot('s1_pick_king');

const picked = await c.eval(`(()=>{const e=[...document.querySelectorAll('#pickCards .scard')].find(x=>x.dataset.king==='\\u5f35\\u89d2'); if(!e) return null; e.click(); return {warn:document.getElementById('pickWarn').innerText, cls:e.className};})()`);
await sleep(600);
const shotPicked = await c.shot('s1_picked');
log('picked', picked);

await c.clickSel('#btnPickStart'); await sleep(3000);
const after = await c.eval(`(()=>{const q=(s)=>document.querySelector(s); const t=(s)=>{const e=q(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400):null;};
  const my=[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>e.dataset.name);
  return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'), king:t('#kingName'),
   pickHidden:q('#pickSheet').hidden, saveHidden:q('#saveSheet').hidden, slotBadge:t('#slotBadge'), btnSave:t('#btnSave'),
   owned:my, cityCount:document.querySelectorAll('.city').length,
   ownCities:[...document.querySelectorAll('.city')].filter(e=>/我方/.test(e.innerText||'')).map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)),
   acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40),dis:e.disabled})),
   logrows:t('#logrows')};})()`);
log('afterStart', after);
const shotMap = await c.shot('s1_map_newgame');

const sl = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}'); const s=(o.slots||[])[0]||{}; const lg=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 return {last:o.last, slot0:{ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,gold:s.gold,owned:s.owned,cities:Object.keys(s.cities||{}).length,name:s.name},
  legacy:{ts:lg.ts,month:lg.month,scenario:lg.scenario,king:lg.king,gold:lg.gold,owned:lg.owned}, slotKings:[...(o.slots||[])].map(x=>x&&x.king)};})()`);
log('saves', sl);
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s1b_newgame', { kings, picked, after, sl, errs, shots: [shotKings, shotPicked, shotMap] });
c.close();
