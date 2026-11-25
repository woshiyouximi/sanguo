import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { clicks: [] };
await c.goto(BASE + 'campaign.html?unlimited=1');
await c.waitLoad(); await sleep(1800);
out.url = await c.eval('location.href');
out.state0 = await c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;}; return {ym:g('ym'),gold:g('gold'),ct:g('ct'),notice:g('notice')};})()`);
await c.clickSel('#tabList'); await sleep(400);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u754c\\u6a4b"]'); if(e) e.scrollIntoView({block:'center'});})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u754c\u6a4b"]'); await sleep(400);
await c.clickSel('#actions .btn[data-act="city"]');
await c.waitLoad(); await sleep(1500);
out.cityUrl = await c.eval('location.href');
if (!/unlimited=1/.test(out.cityUrl)) {
  const u = out.cityUrl + (out.cityUrl.includes('?') ? '&' : '?') + 'unlimited=1';
  await c.goto(u); await c.waitLoad(); await sleep(1500);
  out.cityUrl2 = await c.eval('location.href');
}
out.hud0 = await c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;}; return {city:g('cityName'),pop:g('vPop'),gold:g('vGold'),prep:g('vPrep'),def:g('vDef'),lock:g('vLock'),hint:g('cmdHint')};})()`);
const doDev = async (i) => {
  const ret = await c.eval(`(()=>{const all=[...document.querySelectorAll('#grid .cmd')]; const b=all.find(x=>/開發/.test(x.dataset.cmd||'')); if(!b) return 'none:'+all.map(x=>x.dataset.cmd).join('|'); if(b.disabled) return 'disabled'; b.click(); return 'ok';})()`);
  await sleep(700);
  if (i === 0) out.devRet0 = ret;
  return c.eval(`(()=>{const g=(id)=>{const e=document.getElementById(id); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;};
   const rows=[...document.querySelectorAll('#log .row, #log > div')].slice(0,2).map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim());
   return {gold:g('vGold'),pop:g('vPop'),def:g('vDef'),lock:g('vLock'),hint:g('cmdHint'),top:rows};})()`);
};
for (let i = 0; i < 16; i++) {
  const r = await doDev(i);
  out.clicks.push(r);
  console.log(i, JSON.stringify(r));
  if (r && r.top && r.top.join(' ').includes('金不足')) break;
}
out.shot = await c.shot('s20_gold_short');
out.errs = await c.errs(c.startErr);
await c.save('s20_gold_short', out);
console.log(JSON.stringify({ url: out.url, state0: out.state0, cityUrl: out.cityUrl, cityUrl2: out.cityUrl2, hud0: out.hud0, last: out.clicks.slice(-3), n: out.clicks.length, errs: out.errs }, null, 1));
c.close();
