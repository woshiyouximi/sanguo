import { boot, BASE } from './cdp.mjs';
const c = await boot();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('##', ...a);
await c.goto(BASE + 'campaign.html'); await sleep(1200);
log('logrows html', await c.eval(`document.getElementById('logrows').outerHTML.replace(/\\s+/g,' ').slice(0,400)`));
log('notice el', await c.eval(`(()=>{const e=document.getElementById('notice'); return e? e.outerHTML.replace(/\\s+/g,' ').slice(0,200):'none';})()`));
// 造 v2 到槽 1 并切 last=1
log('craft', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); let sn=st.slots[0].snapshot; sn.v=2; ['year','yearFlag','ledger','generalStatus','weapon','horse','thing'].forEach(k=>delete sn[k]); st.last=1; localStorage.setItem('sanguo_saves_v1', JSON.stringify(st)); localStorage.removeItem('sanguo_campaign_v1'); return {lv:sn.v, month:sn.month};})()`));
await c.goto(BASE + 'campaign.html'); await sleep(2600);
log('notice', JSON.stringify(await c.eval(`[...document.querySelectorAll('#notice, .toast, #toasts *')].map(e=>e.innerText.replace(/\\s+/g,' ')).filter(Boolean).slice(0,5)`)));
log('head', JSON.stringify(await c.eval(`(()=>({ym:(document.getElementById('ym')||{}).innerText, gold:(document.getElementById('gold')||{}).innerText, ct:(document.getElementById('ct')||{}).innerText, rec:(document.getElementById('rec')||{}).innerText, badge:(document.getElementById('slotBadge')||{}).innerText, sc:(document.getElementById('scName')||{}).innerText, king:(document.getElementById('kingName')||{}).innerText, listN:document.querySelectorAll('#list .city').length, logHtml:document.getElementById('logrows').innerHTML.replace(/\\s+/g,' ').slice(0,220)}))()`)));
await c.shot('08_迁移提示');
log('store', await c.eval(`(()=>{const st=JSON.parse(localStorage.getItem('sanguo_saves_v1')); const sn=st.slots[0].snapshot||{}; return {last:st.last, v:sn.v, month:sn.month, gold:sn.gold, owned:(sn.owned||[]).length, log:(sn.log||[]).length, ledger:!!sn.ledger, year:sn.year, generalStatus:!!sn.generalStatus, keys:Object.keys(sn).length};})()`));
await c.close();
