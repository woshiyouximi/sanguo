import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const ST = `(()=>{const raw=localStorage.getItem('sanguo_saves_v1')||''; let s=null; try{s=JSON.parse(raw)}catch(e){} return s?{v:s.v,last:s.last,slots:s.slots.map((e,i)=>e?{i:i+1,time:e.time,ts:e.ts,gold:e.gold}:null)}:null;})()`;
const UI = `(()=>({badge:(document.querySelector('#slotBadge')||{}).innerText,btn:((document.querySelector('#btnSave')||{}).innerText||'').replace(/\\s+/g,' '),notice:((document.querySelector('#notice')||{}).innerText||'').replace(/\\s+/g,' '),sub:((document.querySelector('#saveSub')||{}).innerText||'').replace(/\\s+/g,' ')}))()`;
await c.goto(BASE + 'campaign.html'); await sleep(1200);
log('before_store', await c.eval(ST));
log('before_ui', await c.eval(UI));
// 打開存檔浮层
const sb = await c.eval(`(()=>{const q=document.querySelector('#btnSave').getBoundingClientRect();return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2)];})()`);
await c.mouse(sb[0], sb[1]); await sleep(700);
log('sheet_sub_before', await c.eval(`(document.querySelector('#saveSub')||{}).innerText`));
// 存到槽 10
const s10 = await c.eval(`(()=>{const b=document.querySelector('#slotRows button[data-slot="9"][data-do="save"]'); const q=b.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2)];})()`);
await c.mouse(s10[0], s10[1]); await sleep(1200);
log('after_save_store', await c.eval(ST));
log('after_save_ui', await c.eval(UI));
await c.shot('s26a_saved_slot10');
// 重新載入
await c.goto(BASE + 'campaign.html'); await sleep(1500);
log('after_reload_store', await c.eval(ST));
log('after_reload_ui', await c.eval(UI));
await c.shot('s26b_after_reload');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
await c.save('s26_slotlast', { errs });
c.close();
