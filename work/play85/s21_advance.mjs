import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const NAV = `(()=>({ym:(document.querySelector('#ym')||{}).innerText,gold:(document.querySelector('#gold')||{}).innerText,rec:(document.querySelector('#rec')||{}).innerText,notice:((document.querySelector('#notice')||{}).innerText||'').replace(/\\s+/g,' ')}))()`;
await c.goto(BASE + 'campaign.html'); await sleep(1000);
log('before', await c.eval(NAV));
await c.mouse(146, 279); await sleep(700);
await c.shot('s21a_list_tab');
const row = await c.eval(`(()=>{const e=[...document.querySelectorAll('.city')].find(e=>(e.dataset.name||'')==='平原'); if(!e) return null; const q=e.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2),Math.round(q.width),Math.round(q.height)];})()`);
log('pingyuanRow', row);
await c.mouse(row[0], row[1]); await sleep(700);
const acts = await c.eval(`(()=>[...document.querySelectorAll('#actions .btn')].map(b=>{const q=b.getBoundingClientRect(); return {a:b.dataset.act||null,t:b.innerText.replace(/\\s+/g,' ').slice(0,50),x:Math.round(q.x+q.width/2),y:Math.round(q.y+q.height/2)};}))()`);
log('actions', acts);
await c.shot('s21b_pingyuan_selected');
const adv = acts.find(a => a.a === 'advance');
if (adv) { await c.mouse(adv.x, adv.y); await sleep(2600); }
log('afterAdvance', await c.eval(NAV));
log('logs', await c.eval(`(()=>[...document.querySelectorAll('#logrows .logrow')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,150)).slice(0,12))()`));
await c.shot('s21c_after_advance');
// 出征目標
const mar = acts.find(a => a.a === 'dispatch');
if (mar) { await c.mouse(mar.x, mar.y); await sleep(900); }
log('marchSheet', await c.eval(`(()=>{const s=document.querySelector('#marchSheet'); if(!s||s.hidden) return null; return {sub:(document.querySelector('#marchSub')||{}).innerText,cards:[...document.querySelectorAll('#marchTargets .scard')].map(e=>({n:e.dataset.march,t:e.innerText.replace(/\\s+/g,' ').slice(0,130)})),foot:((document.querySelector('#marchFoot')||{}).innerText||'').replace(/\\s+/g,' ').slice(0,220)};})()`));
await c.shot('s21d_march_sheet');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-3)));
await c.save('s21_advance', { acts, errs });
c.close();
