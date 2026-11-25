import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};

// land on campaign map
if (!(await c.eval(`location.pathname.endsWith('campaign.html')`))) {
  await c.goto(BASE + 'campaign.html'); await sleep(1200);
}
await c.clickSel('#tabList'); await sleep(400);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u5357\\u76ae"]'); if(e) e.scrollIntoView({block:'center'});})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u5357\u76ae"]');
await sleep(500);
await c.clickSel('#actions .btn[data-act="city"]');
await c.waitLoad(); await sleep(1200);

out.hud = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;}; return {name:t('#cityName'),ym:null,gold:t('#vGold'),prep:t('#vPrep'),troops:t('#vTroops'),lock:t('#vLock'),log:t('#log')};})()`);

// click 徵兵
await c.clickSel('#grid .cmd[data-cmd="徵兵"]');
await sleep(800);
out.sheet = await c.eval(`(()=>{const sh=document.getElementById('sheet'); const body=document.getElementById('sheetBody');
 return {sheetExists:!!sh, hidden: sh?sh.hidden:null, title:(document.getElementById('sheetTitle')||{}).textContent||'',
  bodyText:(body?body.innerText:'').replace(/\\s+/g,' ').slice(0,600),
  html:(body?body.innerHTML:'').replace(/\\s+/g,' ').slice(0,1500),
  inputs:[...(body?body.querySelectorAll('input,button,select'):[])].map(e=>({tag:e.tagName,id:e.id,cls:e.className,type:e.type,min:e.min,max:e.max,val:e.value,txt:(e.innerText||'').trim().slice(0,30)})),
  ok:(document.getElementById('sheetOk')||{}).innerText};})()`);
out.shotSheet = await c.shot('s2d_recruit_sheet');
out.errs = await c.errs(c.startErr);
await c.save('s2d_recruit_sheet', out);
console.log(JSON.stringify(out, null, 1));
c.close();
