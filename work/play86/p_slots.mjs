import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log('href', await c.eval('location.href'));
const bs = await c.rect('#btnSave'); console.log('btnSave', JSON.stringify(bs));
await c.mouse(bs.x + bs.w / 2, bs.y + bs.h / 2); await sleep(1000);
console.log('sheet', await c.eval(`(()=>{const s=document.getElementById('saveSheet'); return {open:!s.hidden, html:document.getElementById('slotRows').outerHTML.replace(/\\s+/g,' ').slice(0,700)};})()`));
await c.close();
