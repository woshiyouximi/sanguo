import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};
out.atStart = await c.eval('location.href');
out.sheetOpen = await c.eval(`!document.getElementById('sheet').hidden`);

// focus number field, select all, type 243
await c.eval(`(()=>{const e=document.getElementById('rcInfN'); e.focus(); e.select(); return e.value;})()`);
await c.send('Input.insertText', { text: '243' }, c.sid);
await sleep(400);
out.afterType = await c.eval(`(()=>({n:document.getElementById('rcInfN').value, r:document.getElementById('rcInfR').value, txt:(document.getElementById('sheetBody').innerText||'').replace(/\\s+/g,' ').slice(0,200)}))()`);

// confirm
await c.clickSel('#sheetOk');
await sleep(1200);
out.afterOk = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;};
 return {sheetHidden:document.getElementById('sheet').hidden, gold:t('#vGold'), prep:t('#vPrep'), troops:t('#vTroops'), inf:null, lock:t('#vLock'), cmdHint:t('#cmdHint'), log:t('#log'), logRows:[...document.querySelectorAll('#log .row')].map(e=>(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,200))};})()`);
out.shot = await c.shot('s2e_recruit_done');
out.ls = await c.eval(`(()=>{const o=JSON.parse(localStorage.getItem('sanguo_campaign_v1')||'{}'); const c0=o.cities&&o.cities['南皮']; return {month:o.month,lastActionMonth:o.lastActionMonth,nanpi:c0?{troops:c0.troops,prep:c0.prep,inf:c0.inf,cav:c0.cav,pop:c0.pop}:null};})()`);
out.errs = await c.errs(c.startErr);
await c.save('s2e_recruit', out);
console.log(JSON.stringify(out, null, 1));
c.close();
