import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = { acts: {}, lastAction: null };
await c.clickSel('#tabList'); await sleep(500);
out.lastAction = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:o.month,lastActionMonth:o.lastActionMonth,gold:o.gold};})()`);
const names = ['南皮','北平','鄴','北海','易京','界橋','濮陽','平原','陳留','許昌','汝南','宛','渤海','代縣'];
out.rows = await c.eval(`(()=>{const m={}; document.querySelectorAll('.city').forEach(e=>{ m[e.dataset.name]=(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60); }); return m;})()`);
for (const n of names) {
  const found = await c.eval(`(()=>{const e=document.querySelector('.city[data-name="${n}"]'); if(!e) return false; e.scrollIntoView({block:'center'}); return true;})()`);
  if (!found) { out.acts[n] = 'no-row'; continue; }
  await sleep(200);
  await c.clickSel(`.city[data-name="${n}"]`);
  await sleep(350);
  out.acts[n] = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,120):null;};
   return {hint:t('#hint'), acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60),dis:e.disabled}))};})()`);
}
out.shot = await c.shot('s6_candidates');
out.errs = await c.errs(c.startErr);
await c.save('s6_candidates', out);
console.log(JSON.stringify(out, null, 1));
c.close();
