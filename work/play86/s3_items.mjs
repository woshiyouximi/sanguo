import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
// 复查大地图可点击（物品链接）
log('at itemlink', await c.eval(`(()=>{const a=document.querySelector('footer a[href*="items"]')||[...document.querySelectorAll('a')].pop(); const r=a.getBoundingClientRect(); const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2); return {txt:a.textContent.trim(), x:r.x+r.width/2, y:r.y+r.height/2, hit:e&&e.tagName+'#'+e.id};})()`));
const a = await c.eval(`(()=>{const a=[...document.querySelectorAll('a')].find(x=>/items\\.html/.test(x.getAttribute('href')||'')); const r=a.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
await c.mouse(a.x, a.y); await c.waitLoad().catch(()=>{}); await sleep(1800);
log('href', await c.eval('location.href'));
log('items', JSON.stringify(await c.eval(`(()=>{const q=s=>document.querySelector(s); return {sub:(q('.sub')||{}).innerText, bag:(q('#bagN')||{}).innerText, eq:(q('#eqN')||{}).innerText, tabs:[...document.querySelectorAll('#gtabs button,#gtabs [data-filter]')].map(b=>b.textContent.trim()+(b.classList.contains('on')?'*':'')), rows:document.querySelectorAll('#itemlist > *').length, firstRow:(document.querySelector('#itemlist > *')||{}).innerText, genpick:(q('#genpick')||{}).innerText, stat:(q('#gstat')||{}).innerText, act:(q('#actMain')||{}).innerText, ok:!!window.__sgItemsOk};})()`),null,1));
await c.shot('03_物品页');
await c.close();
