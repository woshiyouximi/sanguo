import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
const STATE = `(()=>{const t=s=>{const e=document.querySelector(s);return e?e.innerText.replace(/\\s+/g,' ').trim():null;};
 const cs=document.querySelector('#confirmSheet');
 return {href:location.href, ym:t('#ym'), gold:t('#gold'), notice:t('#notice'),
  confirm:cs&&!cs.hidden?{title:t('#confirmTitle'), body:(document.querySelector('#confirmBody')||{}).innerText||'', btns:[...cs.querySelectorAll('button')].map(b=>({id:b.id,txt:b.innerText.replace(/\\s+/g,' ').trim(),r:(()=>{const q=b.getBoundingClientRect();return [Math.round(q.x),Math.round(q.y),Math.round(q.width),Math.round(q.height)];})()}))}:null,
  sheets:[...document.querySelectorAll('.sheet')].filter(e=>!e.hidden).map(e=>e.id)};})()`;
await c.goto(BASE + 'campaign.html'); await sleep(1000);
log('before', await c.eval(STATE));
const a = await c.eval(`(()=>{const b=document.querySelector('#advance')||document.querySelector('[data-act=advance]'); const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
await c.mouse(a[0], a[1]);
let st = null, nav = null;
for (let i = 0; i < 25; i++) {
  await sleep(400);
  st = await c.eval(STATE);
  if (st.confirm || !st.href.includes('campaign.html')) break;
}
log('t', st);
await c.shot(st && st.confirm ? 's10a_arrive_confirm' : 's10a_arrive_state');
if (st && st.confirm) {
  const b = st.confirm.btns.find((x) => /出\s*戰|出戰/.test(x.txt)) || st.confirm.btns[0];
  log('clickConfirm', b);
  await c.mouse(b.r[0] + b.r[2] / 2, b.r[1] + b.r[3] / 2);
  for (let i = 0; i < 20; i++) { await sleep(400); const h = await c.eval('location.href'); if (!h.includes('campaign.html')) { nav = h; break; } }
  log('afterConfirm', { nav, href: await c.eval('location.href') });
  await c.shot('s10b_after_confirm');
}
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s10_arrive', { st, nav, errs });
c.close();
