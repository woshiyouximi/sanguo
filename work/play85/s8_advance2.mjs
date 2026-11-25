import { boot, sleep, BASE } from './cdp.mjs';
const c = await boot();
const log = (k, v) => console.log('##', k, JSON.stringify(v));
await c.goto(BASE + 'campaign.html'); await sleep(1000);
// 若存档浮层开着，先关
const shut = await c.eval(`(()=>{const s=document.querySelector('#saveSheet'); if(s&&!s.hidden){const x=document.querySelector('#saveSheet .close, #saveSheet .x, #sheetClose'); if(x){const q=x.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];} return 'no-close';} return 'closed';})()`);
log('shut', shut);
if (Array.isArray(shut)) { await c.mouse(shut[0], shut[1]); await sleep(500); }
log('before', await c.eval(`(()=>({href:location.href, ym:document.querySelector('#ym').innerText, gold:document.querySelector('#gold').innerText}))()`));
const a = await c.eval(`(()=>{const b=document.querySelector('#advance')||document.querySelector('[data-act=advance]'); const q=b.getBoundingClientRect(); return [q.x+q.width/2,q.y+q.height/2];})()`);
await c.mouse(a[0], a[1]);
let nav = null;
for (let i = 0; i < 20; i++) {
  await sleep(400);
  const h = await c.eval('location.href');
  if (!h.includes('campaign.html')) { nav = h; break; }
}
log('nav', nav);
log('after', await c.eval(`(()=>({href:location.href, ym:document.querySelector('#ym')?document.querySelector('#ym').innerText:null, gold:document.querySelector('#gold')?document.querySelector('#gold').innerText:null, notice:document.querySelector('#notice')?document.querySelector('#notice').innerText:null}))()`));
await c.shot(nav ? 's8a_forced_nav' : 's8a_after_advance2');
const errs = await c.errs(c.startErr);
console.log('ERRS', errs.length, JSON.stringify(errs.slice(0, 8)));
await c.save('s8_advance2', { nav, errs });
c.close();
