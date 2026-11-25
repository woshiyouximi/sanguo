import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(1600);
let panel = await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); if(!s) return null; const cards=[...s.querySelectorAll('.sgen')].map(e=>({n:e.dataset.name,cls:e.className,t:e.innerText.replace(/\\s+/g,' ').slice(0,90)})); return {hidden:s.hidden,sub:(document.querySelector('#surSub')||{}).innerText,msg:(document.querySelector('#surMsg')||{}).innerText,cards};})()`);
log('panel0', panel);
if (!panel || panel.hidden) {
  // 沒彈：用探針再種一次
  await c.goto(BASE + 'campaign.html?sur=%E5%BC%B5%E8%8B%B1,%E8%8F%AF%E4%BD%97&surking=%E6%9B%B9%E6%93%8D');
  await sleep(1600);
  panel = await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); if(!s) return null; const cards=[...s.querySelectorAll('.sgen')].map(e=>({n:e.dataset.name,cls:e.className,t:e.innerText.replace(/\\s+/g,' ').slice(0,90)})); return {hidden:s.hidden,sub:(document.querySelector('#surSub')||{}).innerText,msg:(document.querySelector('#surMsg')||{}).innerText,cards};})()`);
  log('panelSeeded', panel);
}
await c.shot('s23a_panel');
const btnAt = async (name, act) => c.eval(`(()=>{const e=[...document.querySelectorAll('#surCards .sgen')].find(e=>e.dataset.name===${JSON.stringify(name)}); if(!e) return null; const b=e.querySelector('button[data-sur=${JSON.stringify(act)}]'); if(!b) return null; const q=b.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2),b.disabled];})()`);
for (const [n, a] of [['張英', 'recruit'], ['華佗', 'kill'], ['曹操', 'escape']]) {
  const p = await btnAt(n, a);
  log('btn', { n, a, p });
  if (Array.isArray(p) && p[2] === false) { await c.mouse(p[0], p[1]); await sleep(900); }
  else if (Array.isArray(p) && p[2] === true) { console.log('## disabled', n, a); }
}
await sleep(1200);
log('after', await c.eval(`(()=>({sheet:(document.querySelector('#surrenderSheet')||{}).hidden,notice:((document.querySelector('#notice')||{}).innerText||'').replace(/\\s+/g,' '),ym:(document.querySelector('#ym')||{}).innerText,logs:[...document.querySelectorAll('#logrows .logrow')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,120)).slice(0,5)}))()`));
await c.shot('s23b_after_all');
const db = await c.eval(`(()=>{const raw=localStorage.getItem('sanguo_campaign_v1')||''; let s=null; try{s=JSON.parse(raw)}catch(e){}
 if(!s) return {noSave:true};
 const owned=s.owned||[]; const out={owned,leling:null,zhangying:[],huatuo:[]};
 for(const [cn,cs] of Object.entries(s.cities||{})){ const r=(cs&&cs.roster)||[]; if(r.includes('張英'))out.zhangying.push(cn); if(r.includes('華佗'))out.huatuo.push(cn); }
 if(s.cities&&s.cities['樂陵']) out.leling=(s.cities['樂陵'].roster||[]);
 return out;})()`);
log('db', db);
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s23_surrender_done', { panel, db, errs });
c.close();
