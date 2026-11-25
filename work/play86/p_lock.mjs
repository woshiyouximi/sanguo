import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
log('save', await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); return JSON.stringify({month:s.month, lastActionMonth:s.lastActionMonth, gold:s.gold, owned:s.owned, armies:(s.armies||[]).length, cap:s.captured, log:(s.log||[]).slice(0,6)});})()`));
// 点列表里的平原
const rows = await c.eval(`(()=>[...document.querySelectorAll('#list .city')].filter(e=>e.dataset.name==='平原'||/平原/.test(e.innerText)).map(e=>{const b=e.getBoundingClientRect();return {n:e.dataset.name,x:b.x+b.width/2,y:b.y+b.height/2,vis:b.height>0};}))()`);
log('rows', JSON.stringify(rows));
if (rows[0]) { await c.mouse(rows[0].x, rows[0].y); await sleep(600); }
log('actions', JSON.stringify(await c.eval(`[...document.querySelectorAll('#actions [data-act]')].map(e=>e.dataset.act+'|'+(e.disabled?'✘':'✔')+'|'+e.innerText.replace(/\\s+/g,' '))`)));
log('hint', await c.eval(`(document.getElementById('hint')||{}).innerText`));
await c.close();
