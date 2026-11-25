import { boot, BASE, sleep } from './cdp.mjs';
import fs from 'node:fs';
const c = await boot();
await c.goto(BASE + 'campaign.html');
await sleep(1500);
const out = {};
out.href = await c.eval('location.href');
out.title = await c.eval('document.title');
out.dump = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,600):null;};
 const q=(s)=>document.querySelector(s);
 return {ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), rec:t('#rec'), notice:t('#notice'), king:t('#kingName'),
  saveHidden:q('#saveSheet')?q('#saveSheet').hidden:null, pickHidden:q('#pickSheet')?q('#pickSheet').hidden:null,
  btnSave:q('#btnSave')?{txt:t('#btnSave'),rect:q('#btnSave').getBoundingClientRect().toJSON()}:null,
  cities:[...document.querySelectorAll('.city')].map(e=>({name:e.dataset.name,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)})),
  tabs:[...document.querySelectorAll('#tabs .tab,#tabList')].map(e=>({id:e.id,txt:(e.innerText||'').trim().slice(0,20)})),
  logRows:[...document.querySelectorAll('#log .row,#logrows .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,160)).slice(-12),
  stage:(()=>{const r=q('#stage').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
  bodyH:document.body.scrollHeight};})()`);
out.store = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_saves_v1')||'null'); if(!o) return null;
 return {v:o.v,last:o.last,slots:(o.slots||[]).map((s,i)=>s?{i:i+1,name:s.name,slotName:s.slotName,time:s.time,ts:s.ts,scenario:s.scenario,scenarioName:s.scenarioName,month:s.month,gold:s.gold,ownedCount:s.ownedCount,wins:s.wins,losses:s.losses,monarch:s.monarch,forceCount:s.forceCount,cityCount:s.cityCount,generalCount:s.generalCount,snapLen:JSON.stringify(s.snapshot||{}).length}:null)};})()`);
out.ls = await c.ls();
out.build = fs.readdirSync('F:\\sanguo\\game\\web').filter(f=>/\.(js|html)$/.test(f)).map(f=>{const st=fs.statSync('F:\\sanguo\\game\\web\\'+f);return {f,len:st.size,mtime:st.mtime.toISOString()};});
out.errs = await c.errs(0);
out.shot = await c.shot('s0_boot');
await c.save('s0_probe', out);
console.log(JSON.stringify(out, null, 1));
c.close();
