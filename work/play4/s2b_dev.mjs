import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};
const dump = () => c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400):null;};
 return {href:location.href, chips:{pop:t('#vPop'), gold:t('#vGold'), prep:t('#vPrep'), def:t('#vDef'), lock:t('#vLock')},
  cmdHint:t('#cmdHint'), logText:t('#log'), logRows:[...document.querySelectorAll('#log .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200)),
  cmds:[...document.querySelectorAll('#grid .cmd')].map(e=>({cmd:e.dataset.cmd,dis:e.disabled,note:(e.querySelector('.note')||{}).textContent||'',op:getComputedStyle(e).opacity})),
  toast: (function(){const e=[...document.querySelectorAll('*')].find(x=>x.id&&/toast/i.test(x.id)); return e?(e.innerText||'').trim():null;})()};})()`);

// ensure we are on city page for 南皮
if (!(await c.eval('location.pathname.includes("city.html")'))) {
  await c.goto(BASE + 'city.html?city=' + encodeURIComponent('南皮'));
  await sleep(1200);
}
out.before = await dump();

// 1) click 開發
await c.clickSel('#grid .cmd[data-cmd="開發"]');
await sleep(900);
out.afterDev = await dump();
out.shotDev = await c.shot('s2b_develop');

// 2) gate: same month, click 徵兵 (expect disabled -> nothing) then 搜索
await c.clickSel('#grid .cmd[data-cmd="徵兵"]');
await sleep(500);
out.afterSecondClick = await dump();
// 3) also try 搜索
await c.clickSel('#grid .cmd[data-cmd="搜索"]');
await sleep(500);
out.afterThirdClick = await dump();
out.shotGate = await c.shot('s2b_gate');

const sl = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); return {month:o.month,gold:o.gold,lastActionMonth:o.lastActionMonth, log:o.log, nanpi:o.cities&&o.cities['南皮']?{pop:o.cities['南皮'].pop,def:o.cities['南皮'].def,troops:o.cities['南皮'].troops,prep:o.cities['南皮'].prep}:null};})()`);
out.state = sl;
out.errs = await c.errs(c.startErr);
await c.save('s2b_develop', out);
console.log(JSON.stringify(out, null, 1));
c.close();
