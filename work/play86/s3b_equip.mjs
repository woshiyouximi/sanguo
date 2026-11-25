import { boot } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
const snap = async (tag) => log(tag, JSON.stringify(await c.eval(`(()=>({gen:(document.getElementById('gname')||{}).innerText, stat:(document.getElementById('gstat')||{}).innerText, eq:(document.getElementById('eqN')||{}).innerText, bag:(document.getElementById('bagN')||{}).innerText, slots:(document.getElementById('gslots')||{}).innerText.replace(/\\s+/g,' '), act:(document.getElementById('actMain')||{}).innerText, hint:(document.getElementById('hint')||{}).innerText.slice(0,40), bonus:(document.getElementById('detail')||{}).innerText.replace(/\\s+/g,' ').match(/加 成 表[\\s\\S]{0,90}/)}))()`), null, 1));
await c.goto('http://127.0.0.1:5173/web/items.html'); await sleep(1600);
// 选 直劍
const r = await c.eval(`(()=>{const e=[...document.querySelectorAll('#itemlist .irow')].find(x=>/直劍/.test(x.innerText)); if(!e) return null; e.scrollIntoView({block:'center'}); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2};})()`);
log('row 直劍', JSON.stringify(r));
await c.mouse(r.x, r.y); await sleep(600);
await snap('before equip');
await c.shot('03b_选直劍');
const act = await c.eval(`(()=>{const e=document.getElementById('actMain'); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,dis:e.disabled};})()`);
await c.mouse(act.x, act.y); await sleep(900);
await snap('after equip');
await c.shot('03c_装备后');
log('saves equip', JSON.stringify(await c.eval(`(()=>{const s=JSON.parse(localStorage.getItem('sanguo_campaign_v1')); return {equip:s.equip, keys:Object.keys(s.equip||{}).length, w:s.weapon};})()`)));
// 卸下
const act2 = await c.eval(`(()=>{const e=document.getElementById('actMain'); const b=e.getBoundingClientRect(); return {x:b.x+b.width/2,y:b.y+b.height/2,txt:e.innerText,dis:e.disabled};})()`);
log('act2', JSON.stringify(act2));
await c.mouse(act2.x, act2.y); await sleep(900);
await snap('after unequip');
await c.shot('03d_卸下后');
// 再装备一次留作后续（步骤4 加成）
await c.mouse(r.x, r.y); await sleep(500); await c.mouse(act.x, act.y); await sleep(800);
await snap('re-equip');
log('errs', JSON.stringify((await c.errs(0)).map(e=>e.kind+':'+e.msg.slice(0,60)).slice(-4)));
await c.close();
