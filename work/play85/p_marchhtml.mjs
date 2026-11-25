import { boot, sleep } from './cdp.mjs';
const c = await boot();
const out = await c.eval(`(()=>{const s=document.querySelector('#marchSheet'); return s?{cls:s.className, hidden:s.hidden, html:s.innerHTML.replace(/\\n\\s*/g,'\\n').slice(0,2500)}:null;})()`);
console.log(JSON.stringify(out, null, 1));
c.close();
