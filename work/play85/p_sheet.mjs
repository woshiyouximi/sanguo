import { boot } from './cdp.mjs';
const c = await boot();
const h = await c.eval(`(()=>{const s=document.querySelector('#saveSheet'); return s? s.outerHTML.slice(0,3000):null;})()`);
console.log(h);
c.close();
