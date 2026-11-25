import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
log('href0', await c.eval('location.href'));
const info = await c.eval(`(()=>{const a=[...document.querySelectorAll('a[href="./items.html"]')].map(e=>{const b=e.getBoundingClientRect();return {x:b.x,y:b.y,w:b.width,h:b.height,txt:e.innerText}}); const at=document.elementFromPoint(375,1305); return {links:a, at:at?at.tagName+'#'+at.id+'.'+at.className+'|'+at.innerText.slice(0,20):null};})()`);
log('info', JSON.stringify(info));
const r = await c.rect('a[href="./items.html"]');
await c.mouse(r.x + r.w / 2, r.y + r.h / 2);
for (const d of [300, 600, 1500]) { await sleep(d); log('after', d, await c.eval('location.href')); }
await c.close();
