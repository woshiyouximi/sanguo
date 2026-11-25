import { boot } from './cdp.mjs';
const c = await boot();
const log = (...a) => console.log('##', ...a);
log(JSON.stringify(await c.eval(`(()=>{const s=document.getElementById('scrim'); const cs=getComputedStyle(s); return {hidden:s.hidden, disp:cs.display, z:cs.zIndex, bg:cs.backgroundColor, rect:(r=>({x:r.x,y:r.y,w:r.width,h:r.height}))(s.getBoundingClientRect()), pe:cs.pointerEvents};})()`)));
log(JSON.stringify(await c.eval(`(()=>{const els=[...document.querySelectorAll('#stage > *')].map(e=>{const cs=getComputedStyle(e);return e.id||e.className+'|'+cs.position+'|z'+cs.zIndex+'|'+Math.round(e.getBoundingClientRect().height)}); return els;})()`)));
await c.close();
