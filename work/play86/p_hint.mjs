import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await c.goto(BASE + 'campaign.html'); await sleep(2500);
const info = await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1'));return {owned:s.owned,cities:Object.fromEntries(Object.entries(s.cities||{}).map(([k,v])=>[k,{troops:v.troops,pop:v.pop,money:v.money,def:v.defense}]))};})()`);
console.log('owned', JSON.stringify(info.owned));
console.log('cities', JSON.stringify(info.cities).slice(0,600));
// 选中列表里第一个非我方城
const r = await c.eval(`(()=>{const rows=[...document.querySelectorAll('#list .city')];const own=new Set(${JSON.stringify(info.owned)});const e=rows.find(x=>!own.has(x.dataset.name));return e?e.dataset.name:null;})()`);
console.log('pick enemy city', r);
await c.eval(`(()=>{document.querySelectorAll('#tabList')[0].click();return 1;})()`); await sleep(300);
await c.eval(`(()=>{const own=new Set(${JSON.stringify(info.owned)});const e=[...document.querySelectorAll('#list .city')].find(x=>!own.has(x.dataset.name));if(e){e.scrollIntoView({block:'center'});}return e?e.dataset.name:null;})()`);
await sleep(300);
const rect = await c.eval(`(()=>{const own=new Set(${JSON.stringify(info.owned)});const e=[...document.querySelectorAll('#list .city')].find(x=>!own.has(x.dataset.name));if(!e)return null;const b=e.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2,name:e.dataset.name};})()`);
if (rect) { await c.mouse(rect.x, rect.y); await sleep(500); }
const hint = await c.eval(`(()=>({sel:(document.getElementById('hint')||{}).textContent,acts:[...document.querySelectorAll('#actions [data-act]')].map(b=>b.getAttribute('data-act')+':'+b.innerText.replace(/\\s+/g,' '))}))()`);
console.log('hint', JSON.stringify(hint, null, 1));
await c.close();
