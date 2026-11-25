import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
log('genpick html', await c.eval(`document.getElementById('genpick').outerHTML.replace(/\\s+/g,' ').slice(0,300)`));
log('list struct', JSON.stringify(await c.eval(`[...document.querySelectorAll('#itemlist > *')].slice(0,4).map(e=>e.tagName+'.'+e.className+':'+e.innerText.replace(/\\s+/g,' ').slice(0,40))`)));
// 选第一个武将（张角？）先点「張角」
const gp = await c.eval(`(()=>{const e=[...document.querySelectorAll('#genpick *')].find(x=>x.textContent.trim()==='張角'); if(!e) return null; const r=e.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,tag:e.tagName};})()`);
log('gen 張角', JSON.stringify(gp));
if (gp) { await c.mouse(gp.x, gp.y); await sleep(700); }
log('after genpick', JSON.stringify(await c.eval(`(()=>({gname:(document.getElementById('gname')||{}).innerText, gstat:(document.getElementById('gstat')||{}).innerText, eq:(document.getElementById('eqN')||{}).innerText, slots:(document.getElementById('gslots')||{}).innerText.replace(/\\s+/g,' '), act:(document.getElementById('actMain')||{}).innerText}))()`)));
// 点一个可装备的兵器行
const row = await c.eval(`(()=>{const rows=[...document.querySelectorAll('#itemlist [data-i],#itemlist .row,#itemlist .it')]; const pick=rows.find(r=>/刀|劍|槍|弓/.test(r.innerText)&&!/已裝備/.test(r.innerText)); if(!pick) return {n:rows.length, sample:rows.slice(0,3).map(r=>r.innerText.replace(/\\s+/g,' ').slice(0,30))}; const r=pick.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2,txt:pick.innerText.replace(/\\s+/g,' ').slice(0,40)};})()`);
log('row', JSON.stringify(row));
if (row.x) { await c.mouse(row.x, row.y); await sleep(600); }
log('after row', JSON.stringify(await c.eval(`(()=>({gname:(document.getElementById('gname')||{}).innerText, gstat:(document.getElementById('gstat')||{}).innerText, gcity:(document.getElementById('gcity')||{}).innerText, slots:(document.getElementById('gslots')||{}).innerText.replace(/\\s+/g,' '), act:(document.getElementById('actMain')||{}).innerText, hint:(document.getElementById('hint')||{}).innerText, detail:(document.getElementById('detail')||{}).innerText.replace(/\\s+/g,' ').slice(0,120)}))()`)));
await c.close();
