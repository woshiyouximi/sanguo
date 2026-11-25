import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
const out = {};
await c.clickSel('#tabList'); await sleep(400);
await c.eval(`(()=>{const e=document.querySelector('.city[data-name="\\u6613\\u4eac"]'); if(e) e.scrollIntoView({block:'center'});})()`);
await sleep(300);
await c.clickSel('.city[data-name="\u6613\u4eac"]'); await sleep(400);
out.acts = await c.eval(`[...document.querySelectorAll('#actions .btn')].map(e=>({act:e.dataset.act,txt:(e.innerText||'').replace(/\\s+/g,' ').trim(),dis:e.disabled}))`);
out.shotSel = await c.shot('s7_enemy_selected');
await c.clickSel('#actions .btn[data-act="march"]');
await c.waitLoad(); await sleep(1500);
out.href = await c.eval('location.href');
out.deploy = await c.eval(`(()=>{const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,400):null;};
 return {href:location.href, target:t('#target'), vs:t('#vs'), def:t('#def'), gar:t('#gar'), intel:t('#intel'), hint:t('#hint'),
  gname:t('#gname'), gstr:t('#gstr'), gint:t('#gint'), gtire:t('#gtire'), gmorale:t('#gmorale'), gskill:t('#gskill'),
  range:{min:document.getElementById('numrange').min,max:document.getElementById('numrange').max,val:document.getElementById('numrange').value},
  numnow:t('#numnow'), numcap:t('#numcap'),
  troops:[...document.querySelectorAll('#troopgrid *')].filter(e=>e.dataset&&e.dataset.troop!==undefined||/troop|tf/.test(e.className)).map(e=>({cls:e.className,dt:e.dataset.troop||'',txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,30),off:/off|dis/.test(e.className)})).slice(0,20),
  forms:[...document.querySelectorAll('#formgrid *')].filter(e=>e.dataset&&e.dataset.form!==undefined||/form|fm/.test(e.className)).map(e=>({cls:e.className,dt:e.dataset.form||'',txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,30),off:/off|dis/.test(e.className)})).slice(0,20),
  go:(document.getElementById('go')||{}).innerText, gosub:(document.getElementById('gosub')||{}).innerText};})()`);
out.shot = await c.shot('s7_deploy');
out.errs = await c.errs(c.startErr);
await c.save('s7_deploy', out);
console.log(JSON.stringify(out, null, 1));
c.close();
