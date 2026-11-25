import { boot, sleep, BASE } from './cdp.mjs';
const url = process.argv[2] || '';
const c = await boot();
if (url) { await c.goto(BASE + url); await sleep(900); }
const out = await c.eval(`(()=>{
 const vis=(e)=>{const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return null; const s=getComputedStyle(e); if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0) return null; return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
 const items=[...document.querySelectorAll('button,[data-act],[data-do],[data-cmd],[data-tab],input,select,a')].map(e=>{const r=vis(e); if(!r) return null; return {tag:e.tagName.toLowerCase(), id:e.id||null, type:e.type||null, val:(e.value!==undefined?String(e.value).slice(0,20):null), dis:e.disabled===true, cls:(e.className||'').toString().slice(0,30), txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,46), act:e.dataset?e.dataset.act||e.dataset.do||e.dataset.cmd||e.dataset.tab||null:null, ...r};}).filter(Boolean);
 return {href:location.href, vw:innerWidth, vh:innerHeight, items};})()`);
console.log('href', out.href, out.vw + 'x' + out.vh);
for (const it of out.items) console.log(`${it.tag}#${it.id || ''}[${it.act || ''}]${it.dis ? ' DIS' : ''} val=${it.val} "${it.txt}" @${it.x},${it.y} ${it.w}x${it.h}`);
c.close();
