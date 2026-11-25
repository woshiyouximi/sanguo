import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
const fp = async (tag) => c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 const own=[...document.querySelectorAll('.city[data-name]')].map(e=>({n:e.dataset.name,t:(e.innerText||'').replace(/\\s+/g,' ').trim()})).filter(c=>/我方/.test(c.t));
 const L=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}');
 const S=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'{}');
 return {tag:${JSON.stringify(tag)},url:location.href,ym:g('ym'),gold:g('gold'),ct:g('ct'),rec:g('rec'),notice:g('notice'),log:g('logrows'),
  ownCount:own.length,own:own.map(c=>c.n).sort(),legacy:{month:L.month,gold:L.gold,wins:L.wins,losses:L.losses,defWins:L.defWins,ts:L.ts},
  s0:S.slots&&S.slots[0]?{ts:S.slots[0].ts,month:S.slots[0].month,gold:S.slots[0].gold,owned:S.slots[0].ownedCount,wins:S.slots[0].wins,losses:S.slots[0].losses}:null,
  s1:S.slots&&S.slots[1]?{ts:S.slots[1].ts,month:S.slots[1].month,gold:S.slots[1].gold,owned:S.slots[1].ownedCount,wins:S.slots[1].wins,losses:S.slots[1].losses}:null};})()`);
await sleep(1000);
out.a = await fp('A_now');
out.shotA = await c.shot('s18a_now');
await c.clickSel('#btnSave'); await sleep(800);
out.rows = await c.eval(`[...document.querySelectorAll('#slotRows [data-slot]')].slice(0,4).map(e=>({slot:e.dataset.slot,do:e.dataset.do,txt:(e.closest('div,li,tr')||e).innerText.replace(/\\s+/g,' ').trim().slice(0,120)}))`);
await c.eval(`(()=>{const b=document.querySelector('#slotRows [data-slot="1"][data-do="load"]'); if(b) b.click(); return !!b;})()`);
await sleep(1400);
await c.eval(`(()=>{const s=document.getElementById('saveSheet'); if(s) s.hidden=true; return 1;})()`);
await sleep(600);
out.b = await fp('B_after_load_slot2');
out.shotB = await c.shot('s18b_rollback');
out.errs = await c.errs(c.startErr);
await c.save('s18_rollback2', out);
console.log(JSON.stringify({ a: out.a, rows: out.rows, b: out.b, errs: out.errs }, null, 1));
c.close();
