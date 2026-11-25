import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};
const dumpC = () => c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,500):null;};
 return {href:location.href, ym:t('#ym'), gold:t('#vGold')||t('#gold'), lock:t('#vLock'), cmdHint:t('#cmdHint'), log:t('#log'),
  logRows:[...document.querySelectorAll('#log .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200)),
  sheetOpen: !!document.querySelector('.sheet:not([hidden])')};})()`);

// back to map
await c.clickSel('#btnBack'); await c.waitLoad(); await sleep(1200);
out.atMap = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200):null;}; return {ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),advance:(document.querySelector('#actions .btn[data-act=advance]')||{}).innerText};})()`);

await c.clickSel('#actions .btn[data-act="advance"]');
await sleep(2500);
out.afterAdv = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,900):null;};
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), ct:t('#ct'), notice:t('#notice'), logrows:t('#logrows'), title:document.title};})()`);
out.shotAdv = await c.shot('s2f_advance_m3');

if (out.afterAdv.href.includes('campaign.html')) {
  await c.clickSel('#tabList'); await sleep(400);
  await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u5357\\u76ae"]'); if(e) e.scrollIntoView({block:'center'});})()`);
  await sleep(300);
  await c.clickSel('.city[data-name="\u5357\u76ae"]'); await sleep(400);
  await c.clickSel('#actions .btn[data-act="city"]'); await c.waitLoad(); await sleep(1000);
  out.cityBefore = await dumpC();
  await c.clickSel('#grid .cmd[data-cmd="搜索"]');
  await sleep(1200);
  out.cityAfter = await dumpC();
  out.shot = await c.shot('s2f_search_done');
  out.ls = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:o.month,gold:o.gold,lastActionMonth:o.lastActionMonth,log:o.log,items:localStorage.getItem('sanguo_items_v1')?JSON.parse(localStorage.getItem('sanguo_items_v1')):null};})()`);
}
out.errs = await c.errs(c.startErr);
await c.save('s2f_search', out);
console.log(JSON.stringify(out, null, 1));
c.close();
