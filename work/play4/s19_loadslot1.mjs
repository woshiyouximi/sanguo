import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const own=[...document.querySelectorAll('.city[data-name]')].map(e=>({n:e.dataset.name,t:(e.innerText||'').replace(/\\s+/g,' ').trim()})).filter(c=>/我方/.test(c.t));
 const L=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 const S=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}');
 return {tag:${JSON.stringify(tag)},ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows'),
  ownCount:own.length,legacy:{month:L.month,gold:L.gold,wins:L.wins,losses:L.losses,ts:L.ts},
  s0:S.slots&&S.slots[0]?{ts:S.slots[0].ts,month:S.slots[0].month,gold:S.slots[0].gold,owned:S.slots[0].ownedCount,wins:S.slots[0].wins,losses:S.slots[0].losses}:null,
  s1:S.slots&&S.slots[1]?{ts:S.slots[1].ts,month:S.slots[1].month,gold:S.slots[1].gold,owned:S.slots[1].ownedCount,wins:S.slots[1].wins,losses:S.slots[1].losses}:null};})()`);
out.a = await fp('A_before');
await c.clickSel('#btnSave'); await sleep(800);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="0"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1500);
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(600);
out.b = await fp('B_after_load_slot1');
out.shot = await c.shot('s19_load_slot1');
out.errs = await c.errs(c.startErr);
await c.save('s19_load_slot1', out);
console.log(JSON.stringify(out, null, 1));
c.close();
