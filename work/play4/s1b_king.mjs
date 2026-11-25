import { boot, BASE, sleep } from './cdp.mjs';
const c = await boot();
await c.clickSel('#btnPickStart');
await sleep(800);
const pick2 = await c.eval(`(()=>{const e=document.getElementById('pickSheet'); const cards=[...document.querySelectorAll('#pickCards .scard')].map(x=>({king:x.dataset.king||null,off:x.dataset.off||null,pick:x.dataset.pick||null,cls:x.className,txt:(x.innerText||'').replace(/\\s+/g,' ').trim().slice(0,100)})); return {hidden:e.hidden,ttl:(document.getElementById('pickTtl').innerText||'').trim(),sub:(document.getElementById('pickSub').innerText||'').trim(),warn:(document.getElementById('pickWarn').innerText||'').trim(),n:cards.length,cards,startBtn:(document.getElementById('btnPickStart').innerText||'').trim()};})()`);
const shot = await c.shot('s1b_pick_king');
await c.save('s1b_pick2', { pick2, shot });
console.log(JSON.stringify({ pick2, shot, errs: await c.errs(c.startErr) }, null, 1));
c.close();
