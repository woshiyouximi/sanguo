import { boot, BASE } from './cdp.mjs';
const c = await boot();
await c.goto(BASE + 'campaign.html');
const d = await c.eval(`(()=>{const st=document.querySelector('#stage'); const r=st?st.getBoundingClientRect():null;
 const bs=[...document.querySelectorAll('button')].filter(b=>{const q=b.getBoundingClientRect(); return q.width>0;}).map(b=>{const q=b.getBoundingClientRect(); return {id:b.id||null,act:b.dataset.act||null,t:b.innerText.replace(/\s+/g,' ').slice(0,24),x:Math.round(q.x+q.width/2),y:Math.round(q.y+q.height/2),w:Math.round(q.width),h:Math.round(q.height)};});
 return {stage:r?[Math.round(r.x),Math.round(r.y),Math.round(r.width),Math.round(r.height)]:null, bs:bs.slice(0,40)};})()`);
console.log(JSON.stringify(d, null, 0));
c.close();
