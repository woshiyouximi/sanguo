import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.goto(BASE + 'campaign.html'); await sleep(1200);
const e0 = await c.errCount();
log('store before', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sn=st.slots[0].snapshot||{}; return {last:st.last, v:sn.v, month:sn.month, keys:Object.keys(sn).length};})()`));
// 重新造 v2（上一轮可能已被升）
await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); let sn=st.slots[0].snapshot; sn.v=2; ['year','yearFlag','ledger','generalStatus','weapon','horse','thing'].forEach(k=>delete sn[k]); st.last=1; localStorage.setItem('sanguo_saves_v1', JSON.stringify(st)); localStorage.removeItem('sanguo_campaign_v1'); return st.slots[0].snapshot.v;})()`);
await c.eval('location.reload()'); await sleep(3000);
log('notice txt', JSON.stringify(await c.eval(`(()=>{const n=document.getElementById('notice'); return {hidden:n.hidden, text:n.textContent.replace(/\\s+/g,' ').slice(0,120), cls:n.className};})()`)));
log('store after', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sn=st.slots[0].snapshot||{}; return {last:st.last, v:sn.v, month:sn.month, keys:Object.keys(sn).length, year:sn.year};})()`));
log('fresh errs', JSON.stringify((await c.errs(e0)).map(e=>e.kind+':'+e.msg.slice(0,90))));
log('head', await c.eval(`(()=>[document.getElementById('ym').innerText, document.getElementById('gold').innerText, document.getElementById('ct').innerText, document.getElementById('slotBadge').innerText].join(' | '))()`));
await c.shot('08_迁移提示');
await c.close();
