import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
out.url = await c.eval('location.href');
out.camp = await c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
 return {ym:g('ym'), gold:g('gold'), ct:g('ct'), rec:g('rec'), notice:g('notice'), hint:g('hint'),
  log:g('logrows'), own:[...document.querySelectorAll('.city[data-name] .own, .city[data-name]')].slice(0,80).map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim()).filter(t=>t).slice(0,70)};})()`);
out.ls = await c.eval(`(()=>{const k='sanguo_saves_v1',L='sanguo_campaign_v1'; const o={};
 try{const s=JSON.parse(localStorage.getItem(k)); o.saves={last:s.last,slots:s.slots.map(x=>x?{name:x.slotName,month:x.month,gold:x.gold,owned:x.ownedCount,wins:x.wins,losses:x.losses,month2:x.month}:null)}}catch(e){o.saves='ERR '+e.message}
 try{const l=JSON.parse(localStorage.getItem(L)); o.legacy={month:l.month,gold:l.gold,wins:l.wins,losses:l.losses,defWins:l.defWins,armies:l.armies&&l.armies.length,ts:l.ts,owned:(l.owned||[]).length}}catch(e){o.legacy='ERR '+e.message}
 o.bytes={saves:(localStorage.getItem(k)||'').length,legacy:(localStorage.getItem(L)||'').length}; return o;})()`);
await c.save('s9_post_attack', out);
out.shot = await c.shot('s9_post_attack');
out.errs = await c.errs(c.startErr);
console.log(JSON.stringify(out, null, 1));
c.close();
