import { boot, sleep } from './cdp.mjs';
const c = await boot({ w: 750, h: 1334 });
const out = {};
out.sheets = await c.eval(`[...document.querySelectorAll('[id$="Sheet"]')].map(e=>({id:e.id,hidden:e.hidden,cls:e.className,disp:getComputedStyle(e).display,op:getComputedStyle(e).opacity,z:getComputedStyle(e).zIndex}))`);
out.adv = await c.eval(`(()=>{const b=document.querySelector('#actions .btn[data-act="advance"]'); if(!b) return null; const r=b.getBoundingClientRect(); const top=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {x:r.x,y:r.y,w:r.width,h:r.height,dis:b.disabled,txt:(b.innerText||'').replace(/\\s+/g,' ').trim(),topEl:top?top.tagName+'.'+top.className:null,same:top===b};})()`);
out.ym = await c.eval(`(()=>{const e=document.getElementById('ym'); return e.innerText.trim();})()`);
console.log(JSON.stringify(out, null, 1));
c.close();
