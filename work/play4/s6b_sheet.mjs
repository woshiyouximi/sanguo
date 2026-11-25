import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = { sheets: {} };
await c.clickSel('#tabList'); await sleep(400);
for (const n of ['南皮', '平原', '陳留', '許昌', '汝南', '宛']) {
  await c.eval(`(()=>{const e=document.querySelector('.city[data-name="${n}"]'); if(e) e.scrollIntoView({block:'center'});})()`);
  await sleep(200);
  await c.clickSel(`.city[data-name="${n}"]`); await sleep(300);
  await c.clickSel('#actions .btn[data-act="dispatch"]');
  await sleep(700);
  out.sheets[n] = await c.eval(`(()=>{const sh=document.getElementById('marchSheet'); const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,300):null;};
   return {open: sh && !sh.hidden, sub:t('#marchSub'), items:[...document.querySelectorAll('#marchTargets [data-target],#marchTargets .row,#marchTargets .mt,#marchTargets > *')].map(e=>({tag:e.tagName,dt:e.dataset&&e.dataset.target||null,cls:e.className,txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,90)})).slice(0,12), foot:t('#marchFoot'), dbg:t('#marchdbg')};})()`);
  if (n === '南皮') out.shotSheet = await c.shot('s6b_march_targets');
  await c.eval(`(()=>{const b=document.querySelector('#marchSheet [data-close]'); if(b) b.click(); return 1;})()`);
  await sleep(400);
}
out.errs = await c.errs(c.startErr);
await c.save('s6b_march_sheets', out);
console.log(JSON.stringify(out, null, 1));
c.close();
