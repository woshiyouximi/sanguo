import { boot, sleep, BASE } from './cdp.mjs';
const url = process.argv[2] || 'campaign.html';
const c = await boot();
await c.goto(BASE + url);
await sleep(1400);
const out = await c.eval(`(()=>{
 const vis=(e)=>{const r=e.getBoundingClientRect(); if(r.width<2||r.height<2) return null; const s=getComputedStyle(e); if(s.visibility==='hidden'||s.display==='none'||+s.opacity===0) return null; return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)};};
 const items=[...document.querySelectorAll('button,[data-act],[data-do],[data-cmd],[data-tab],input,select,a,.city,.scard,[data-march],[data-pick]')].map(e=>{const r=vis(e); if(!r) return null;
   return {tag:e.tagName.toLowerCase(), id:e.id||null, type:e.type||null, val:(e.value!==undefined?String(e.value).slice(0,20):null), dis:e.disabled===true,
     cls:(e.className||'').toString().slice(0,26), txt:(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,44),
     act:e.dataset?(e.dataset.act||e.dataset.do||e.dataset.cmd||e.dataset.tab||e.dataset.march||e.dataset.pick||null):null, ...r};}).filter(Boolean);
 const t=(s)=>{const e=document.querySelector(s); return e?(e.innerText||'').replace(/\\s+/g,' ').trim().slice(0,500):null;};
 return {href:location.href, vw:innerWidth, vh:innerHeight,
   sheets:{pick:document.getElementById('pickSheet')?document.getElementById('pickSheet').hidden:null,
           save:document.getElementById('saveSheet')?document.getElementById('saveSheet').hidden:null,
           mon:document.getElementById('monarchSheet')?document.getElementById('monarchSheet').hidden:null,
           force:document.getElementById('forceSheet')?document.getElementById('forceSheet').hidden:null,
           throne:document.getElementById('throneSheet')?document.getElementById('throneSheet').hidden:null,
           march:document.getElementById('marchSheet')?document.getElementById('marchSheet').hidden:null},
   head:{ym:t('#ym'),gold:t('#gold'),ct:t('#ct'),rec:t('#rec'),king:t('#kingName'),kingdom:t('#kingdomName'),slot:t('#slotBadge'),btnSave:t('#btnSave')},
   notice:t('#notice'), log:t('#logrows'),
   items};})()`);
console.log('href', out.href, out.vw + 'x' + out.vh);
console.log('sheets', JSON.stringify(out.sheets));
console.log('head', JSON.stringify(out.head));
console.log('notice', JSON.stringify(out.notice));
console.log('log', JSON.stringify(out.log));
for (const it of out.items) console.log(`${it.tag}#${it.id || ''}[${it.act || ''}]${it.dis ? ' DIS' : ''} val=${it.val} "${it.txt}" @${it.x},${it.y} ${it.w}x${it.h}`);
await c.shot('p0_' + url.replace(/[^a-z0-9_]/gi, '_'));
console.log('ERRS', JSON.stringify(await c.errs(0)));
c.close();
