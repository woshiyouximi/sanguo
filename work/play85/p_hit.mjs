import { boot, sleep } from './cdp.mjs';
const c = await boot();
const info = await c.eval(`(()=>{
 const b=document.getElementById('btnNewGame'); const r=b.getBoundingClientRect(); const cx=r.x+r.width/2, cy=r.y+r.height/2;
 const hit=document.elementFromPoint(cx,cy); const sc=document.getElementById('scrim'); const cs=getComputedStyle(sc);
 const chain=[]; let e=hit; for(let i=0;e&&i<6;i++){ chain.push(e.tagName+(e.id?'#'+e.id:'')+(e.className?'.'+String(e.className).split(' ').join('.'):'')); e=e.parentElement; }
 return {btn:{x:r.x,y:r.y,w:r.width,h:r.height,txt:(b.innerText||'').trim(),vis:getComputedStyle(b).visibility,pe:getComputedStyle(b).pointerEvents},
  hit:{tag:hit&&hit.tagName,id:hit&&hit.id,cls:String(hit&&hit.className)}, chain,
  scrim:{disp:cs.display,pe:cs.pointerEvents,op:cs.opacity,z:cs.zIndex,hidden:sc.hidden},
  sheets:['pickSheet','saveSheet','confirmSheet','marchSheet'].map(id=>{const e=document.getElementById(id); return {id,hidden:e.hidden,disp:getComputedStyle(e).display};}),
  stage:(()=>{const s=document.getElementById('stage'); const q=s.getBoundingClientRect(); return {x:q.x,y:q.y,w:q.width,h:q.height};})(),
  vw:innerWidth, vh:innerHeight, toast:(document.getElementById('toast')||{}).innerText};})()`);
console.log(JSON.stringify(info, null, 1));
c.close();
