import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};

await c.goto(BASE + 'campaign.html');
await sleep(1200);

// list view
await c.clickSel('#tabList');
await sleep(500);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u5357\\u76ae"]'); if(e) e.scrollIntoView({block:'center'}); return !!e;})()`);
await sleep(400);
const rowRect = await c.rect('.city[data-name="\u5357\u76ae"]');
out.rowRect = rowRect;
await c.clickSel('.city[data-name="\u5357\u76ae"]');
await sleep(600);
out.afterSelect = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200):null;};
 return {sel:t('.city.on')||null, hint:t('#hint'), acts:[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,50),dis:e.disabled})), marquee: document.querySelectorAll('.city.on').length};})()`);
out.shotSel = await c.shot('s2_city_selected');

// open 內政
const cityBtn = await c.rect('#actions .btn[data-act="city"]');
out.cityBtnRect = cityBtn;
if (cityBtn) {
  await c.mouse(cityBtn.x + cityBtn.w / 2, cityBtn.y + cityBtn.h / 2);
  await c.waitLoad();
  await sleep(1200);
}
out.cityPage = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;};
 return {href:location.href, name:t('#cityName'), title:document.title,
  chips:{pop:t('#vPop'), gold:t('#vGold'), prep:t('#vPrep'), def:t('#vDef'), gens:t('#vGens'), lock:t('#vLock'), major:t('#vMajor'), wise:t('#vWise'), eff:t('#vEff'), tire:t('#vTire'), morale:t('#vMorale')},
  cmdHint:t('#cmdHint'), log:t('#log'),
  cmds:[...document.querySelectorAll('#grid .cmd')].map(e=>({cmd:e.dataset.cmd,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,60),dis:e.disabled,note:(e.querySelector('.note')||{}).textContent||''})),
  back: !!document.querySelector('#back') };})()`);
out.shot = await c.shot('s2_city_open');
out.ls = await c.ls();
out.errs = await c.errs(c.startErr);
await c.save('s2_city_open', out);
console.log(JSON.stringify(out, null, 1));
c.close();
