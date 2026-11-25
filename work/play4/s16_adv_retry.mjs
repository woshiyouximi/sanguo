import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = { tries: [] };
const ym = async () => c.eval(`(()=>{const e=document.getElementById('ym'); return e?e.innerText.replace(/\\s+/g,' ').trim():null;})()`);
const toast = async () => c.eval(`(()=>{const e=document.querySelector('.toast,#toast,#notice'); return e?(e.innerText||'').replace(/\\s+/g,' ').trim():null;})()`);
out.ym0 = await ym();
for (let i = 0; i < 3; i++) {
  const b = await c.eval(`(()=>{const b=document.querySelector('#actions .btn[data-act="advance"]'); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,dis:b.disabled,txt:(b.innerText||'').replace(/\\s+/g,' ').trim()};})()`);
  if (!b) { out.tries.push({ i, why: 'no button' }); break; }
  await c.mouse(Math.round(b.x), Math.round(b.y));
  let after = null;
  for (let k = 0; k < 12; k++) { await sleep(500); after = await ym(); if (after !== out.ym0) break; }
  out.tries.push({ i, btn: b, ym: after, toast: await toast(), url: await c.eval('location.href') });
  if (after !== out.ym0) break;
}
out.url = await c.eval('location.href');
out.ym1 = await ym();
await c.save('s16_advance_retry', out);
out.shot = await c.shot('s16_after_advance2');
console.log(JSON.stringify(out, null, 1));
c.close();
