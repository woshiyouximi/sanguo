import { boot, BASE } from './cdp.mjs';
const c = await boot();
await c.goto(BASE + 'campaign.html');
const d = await c.eval(`(()=>{const sel='[data-act],[data-cmd],[data-name],#advance,#tabList,#tabMap,#actions,#slotBadge';
 const es=[...document.querySelectorAll(sel)].map(e=>{const q=e.getBoundingClientRect(); return {tag:e.tagName,id:e.id||null,act:e.dataset.act||null,cmd:e.dataset.cmd||null,nm:e.dataset.name||null,t:e.innerText.replace(/\s+/g,' ').slice(0,26),x:Math.round(q.x+q.width/2),y:Math.round(q.y+q.height/2),w:Math.round(q.width),h:Math.round(q.height)};});
 return es.slice(0,30);})()`);
console.log(JSON.stringify(d, null, 0));
c.close();
