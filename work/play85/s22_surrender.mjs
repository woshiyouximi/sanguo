import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html?sur=%E5%BC%B5%E8%8B%B1,%E8%8F%AF%E4%BD%97&surking=%E6%9B%B9%E6%93%8D');
await sleep(1800);
log('href', await c.eval('location.href'));
const panel = await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); if(!s) return null; const cards=[...s.querySelectorAll('.sgen')].map(e=>({n:e.dataset.name,t:e.innerText.replace(/\\s+/g,' ').slice(0,160),
  recruit:(e.querySelector('button[data-sur="recruit"]')||{}).disabled,kill:!!e.querySelector('button[data-sur="kill"]')}));
 return {hidden:s.hidden,sub:(document.querySelector('#surSub')||{}).innerText,msg:(document.querySelector('#surMsg')||{}).innerText,cards,
  allR:(document.querySelector('#surAllRecruit')||{}).disabled,allK:(document.querySelector('#surAllKill')||{}).disabled};})()`);
log('panel', panel);
await c.shot('s22a_surrender');
if (panel && !panel.hidden) {
  const click = async (name, act) => {
    const p = await c.eval(`(()=>{const e=[...document.querySelectorAll('#surCards .sgen')].find(e=>e.dataset.name===${JSON.stringify(name)}); if(!e) return null; const b=e.querySelector('button[data-sur=${JSON.stringify(act)}]'); if(!b||b.disabled) return {disabled:true}; const q=b.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2)];})()`);
    log('clickBtn', { name, act, p });
    if (Array.isArray(p)) { await c.mouse(p[0], p[1]); await sleep(900); }
  };
  const c1 = panel.cards[0];
  if (c1) await click(c1.n, 'recruit');
  log('midPanel', await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); return {hidden:s.hidden,msg:(document.querySelector('#surMsg')||{}).innerText,cards:[...s.querySelectorAll('.sgen')].map(e=>e.innerText.replace(/\\s+/g,' ').slice(0,120))};})()`));
  await c.shot('s22b_after_recruit');
  const p2 = await c.eval(`(()=>{const s=document.querySelector('#surrenderSheet'); if(s.hidden) return null; const e=[...s.querySelectorAll('.sgen')].find(e=>!e.classList.contains('done')); if(!e) return null; const b=e.querySelector('button[data-sur="kill"]'); const q=b.getBoundingClientRect(); return [Math.round(q.x+q.width/2),Math.round(q.y+q.height/2),e.dataset.name];})()`);
  log('killTarget', p2);
  if (p2) { await c.mouse(p2[0], p2[1]); await sleep(1500); }
  log('after', await c.eval(`(()=>({sheetHidden:(document.querySelector('#surrenderSheet')||{}).hidden,notice:((document.querySelector('#notice')||{}).innerText||'').replace(/\\s+/g,' '),ym:(document.querySelector('#ym')||{}).innerText}))()`));
  await c.shot('s22c_after_decide');
  const roster = await c.eval(`(()=>{const raw=localStorage.getItem('sanguo_saves_v1')||localStorage.getItem('sanguo_campaign_v1')||''; const i=raw.indexOf('張英'); return {hasZhangYing:i>=0, ctx:i>=0?raw.slice(Math.max(0,i-160),i+80):null};})()`);
  log('roster', roster);
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(-4)));
await c.save('s22_surrender', { panel, errs });
c.close();
