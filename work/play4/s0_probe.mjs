import { boot, BASE, sleep } from './cdp.mjs';

const c = await boot();
await c.goto(BASE + 'campaign.html');
await sleep(1500);

const info = await c.eval(`(()=>{
  const q = (s)=>document.querySelector(s);
  const txt = (s)=>{ const e=q(s); return e? (e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null; };
  const vis = (s)=>{ const e=q(s); if(!e) return null; const r=e.getBoundingClientRect(); const st=getComputedStyle(e); return {w:r.width,h:r.height,vis:st.visibility,disp:st.display,z:st.zIndex}; };
  const cities=[...document.querySelectorAll('.city')].map(e=>({n:e.dataset.name, t:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60)}));
  const acts=[...document.querySelectorAll('#actions .btn, #actions button')].map(e=>({act:e.dataset.act||'', txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,40), dis:e.disabled, disp:getComputedStyle(e).display}));
  return {
    href: location.href, title: document.title, stage: (()=>{const r=q('#stage').getBoundingClientRect(); return {x:r.x,y:r.y,w:r.width,h:r.height};})(),
    ym: txt('#ym'), gold: txt('#gold'), ct: txt('#ct'), rec: txt('#rec'),
    notice: txt('#notice'), hint: txt('#hint'), king: txt('#kingName'),
    saveSheet: vis('#saveSheet'), pickSheet: vis('#pickSheet'),
    cityCount: cities.length, cities: cities.slice(0,12), acts: acts.slice(0,14),
    inner: {w: innerWidth, h: innerHeight, dpr: devicePixelRatio},
  };
})()`);

const ls = await c.ls();
const lsDetail = await c.eval(`(()=>{const out={}; const raw=localStorage.getItem('sanguo_saves_v1'); if(raw){ try{ const o=JSON.parse(raw); out.saves={v:o.v,last:o.last,slots:(o.slots||[]).map((s,i)=>s?{i,ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,owned:(s.owned||[]).length,gold:s.gold,wins:s.wins,losses:s.losses}:null)}; }catch(e){ out.savesErr=String(e); } } const lg=localStorage.getItem('sanguo_campaign_v1'); if(lg){ try{ const s=JSON.parse(lg); out.legacy={ts:s.ts,month:s.month,scenario:s.scenario,king:s.king,owned:(s.owned||[]).length,gold:s.gold,wins:s.wins,battle:!!s.battle}; }catch(e){ out.legacyErr=String(e); } } return out;})()`);

const shot = await c.shot('s0_boot');
const errs = await c.errs(c.startErr);
await c.save('s0_probe', { info, ls, lsDetail, shot, errs });
console.log(JSON.stringify({ info, lsDetail, shot, errs }, null, 1));
c.close();
