import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
console.log(JSON.stringify(await c.eval(`(()=>{const ss=document.getElementById('surrenderSheet'); const cm=JSON.parse(localStorage.getItem('sanguo_campaign_v1'));
 return {surHidden:ss.hidden, cards:document.querySelectorAll('#surCards .sgen').length, surSub:(document.getElementById('surSub')||{}).innerText, surMsg:(document.getElementById('surMsg')||{}).innerText, captured:(cm.captured||[]).map(x=>x&&x.name), executed:(cm.executed||[]).map(x=>x&&x.name), month:cm.month, owned:cm.owned, lastPost:cm.lastPost&&{city:cm.lastPost.city,joined:cm.lastPost.joined,released:cm.lastPost.released}, armies:cm.armies&&cm.armies.length, mine:(cm.armies||[]).filter(a=>a.own).map(a=>a.from+'>'+a.to+' '+a.soldiers), allBtn:[...document.querySelectorAll('#surAllRecruit,#surAllKill,#surAllRelease')].map(b=>b.textContent.trim()+':'+b.disabled)};})()`),null,1));
await c.close();
