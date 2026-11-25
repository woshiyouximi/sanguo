import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(1500);
let p = await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); return s?{hidden:s.hidden,msg:(document.querySelector('#surMsg')||{}).innerText}:null;})()`);
log('panel0', p);
if (!p || p.hidden) {
  await c.goto(BASE + 'campaign.html?sur=%E5%BC%B5%E8%8B%B1,%E8%8F%AF%E4%BD%97&surking=%E6%9B%B9%E6%93%8D');
  await sleep(1500);
  log('seeded', await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); return {hidden:s.hidden,msg:(document.querySelector('#surMsg')||{}).innerText};})()`));
}
// 點「剩餘全部招降」
const b = await c.eval(`(()=>{const e=document.querySelector('#surAllRecruit'); const q=e.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2),e.disabled];})()`);
log('bulkBtn', b);
if (Array.isArray(b)) { await c.mouse(b[0], b[1]); await sleep(1800); }
log('afterBulk', await c.eval(`(()=>({sheet:(document.querySelector('#surrenderSheet')||{}).hidden,notice:((document.querySelector('#notice')||{}).innerText||'').replace(/\\s+/g,' '),ym:(document.querySelector('#ym')||{}).innerText}))()`));
await c.shot('s24a_after_bulk');
const db = await c.eval(`(()=>{for (const k of ['sanguo_saves_v1','sanguo_campaign_v1']) { const raw=localStorage.getItem(k)||''; if(!raw) continue; let s=null; try{s=JSON.parse(raw)}catch(e){}
  let snap = s; if (k==='sanguo_saves_v1') { const last=s.last||1; const e=(s.slots||[])[last-1]; snap=e&&e.snapshot; }
  if (!snap||!snap.cities) continue;
  const zy=[],ht=[],ll=(snap.cities['樂陵']&&snap.cities['樂陵'].roster)||null;
  for(const [cn,cs] of Object.entries(snap.cities)){ const r=(cs&&cs.roster)||[]; if(r.includes('張英'))zy.push(cn); if(r.includes('華佗'))ht.push(cn); }
  if (zy.length||ht.length||ll) return {key:k,owned:snap.owned,leling:ll,zhangying:zy,huatuo:ht}; }
 return {none:true};})()`);
log('db', db);
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
await c.save('s24_bulk', { db, errs });
c.close();
