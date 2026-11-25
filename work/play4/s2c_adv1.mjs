import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};

await c.clickSel('#btnBack');
await c.waitLoad();
await sleep(1500);
out.backHref = await c.eval('location.href');
out.backState = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;}; return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),hint:t('#hint'),notice:t('#notice')};})()`);

// 推進一月
await c.clickSel('#actions .btn[data-act="advance"]');
await sleep(2500);
out.afterAdvanceHref = await c.eval('location.href');
out.afterAdvance = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,600):null;};
 return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),notice:t('#notice'),logrows:t('#logrows'),
  acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60),dis:e.disabled})),
  hasGame: !!window.__sanguo};})()`);
out.shot = await c.shot('s2c_advance_month2');
out.ls = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:o.month,gold:o.gold,lastActionMonth:o.lastActionMonth,log:o.log,owned:o.owned};})()`);
out.errs = await c.errs(c.startErr);
await c.save('s2c_advance', out);
console.log(JSON.stringify(out, null, 1));
c.close();
